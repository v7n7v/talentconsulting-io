/**
 * Portal Scanner — public ATS APIs with bounded caching and normalized evidence.
 */
import {
  JobIngestionEvidence,
  JobSalary,
  ProviderDiagnostic,
  ProviderOutcome,
  classifyProviderFailure,
  finiteSalary,
  normalizeEmploymentType,
  normalizeJobDate,
  normalizeSalaryInterval,
  normalizeWorkplaceType,
} from "./job-ingestion";

export interface PortalJob extends JobIngestionEvidence {
  id: string;
  title: string;
  company: string;
  location: string;
  department: string;
  url: string;
  postedDate: string;
  source: "greenhouse" | "ashby" | "lever";
  description?: string;
}
export interface PortalSearchResult {
  jobs: PortalJob[];
  totalCount: number;
  source: string;
  company: string;
  status?: ProviderOutcome;
  diagnostics?: ProviderDiagnostic[];
  boardsSucceeded?: number;
  boardsFailed?: number;
  cached?: boolean;
}
const PORTAL_CACHE_TTL = 10 * 60 * 1000;
const PORTAL_CACHE_MAX = 256;
const portalCache = new Map<
  string,
  { data: PortalSearchResult; expiry: number }
>();
const inFlight = new Map<string, Promise<PortalSearchResult>>();
const DESCRIPTION_MAX = 100_000;
const BOARD_FETCH_LIMIT = 2000;
function validLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit < 1)
    throw new RangeError("limit must be a positive finite number");
  return Math.min(Math.floor(limit), BOARD_FETCH_LIMIT);
}
function validAggregateLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit < 1)
    throw new RangeError("limit must be a positive finite number");
  return Math.min(Math.floor(limit), 32_000);
}
function validSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,99}$/i.test(slug);
}
type JsonRecord = Record<string, unknown>;
function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isString(value: unknown): value is string {
  return typeof value === "string";
}
function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => isString(value) && Boolean(value));
}
function isJobSalary(value: JobSalary | undefined): value is JobSalary {
  return value !== undefined;
}
function clone<T>(value: T): T {
  return structuredClone(value);
}
function failure(
  provider: string,
  company: string,
  status: ProviderOutcome,
): PortalSearchResult {
  return {
    jobs: [],
    totalCount: 0,
    source: `${provider} (error)`,
    company,
    status,
    diagnostics: [{ provider, status }],
  };
}
function resultFor(
  data: PortalSearchResult,
  query?: string,
  limit = 50,
  cached = false,
): PortalSearchResult {
  const q = query?.trim().toLowerCase();
  const jobs = q
    ? data.jobs.filter((j) =>
        `${j.title} ${j.department} ${j.description || ""}`
          .toLowerCase()
          .includes(q),
      )
    : data.jobs;
  const copied = clone(data);
  return {
    ...copied,
    jobs: clone(jobs.slice(0, validAggregateLimit(limit))),
    totalCount: jobs.length,
    cached,
  };
}
function cacheGet(key: string): PortalSearchResult | undefined {
  const x = portalCache.get(key);
  if (!x) return;
  if (Date.now() >= x.expiry) {
    portalCache.delete(key);
    return;
  }
  return clone(x.data);
}
function cachePut(key: string, data: PortalSearchResult) {
  if (portalCache.size >= PORTAL_CACHE_MAX)
    portalCache.delete(portalCache.keys().next().value!);
  portalCache.set(key, {
    data: clone(data),
    expiry: Date.now() + PORTAL_CACHE_TTL,
  });
}
function textContent(
  input: unknown,
  max = DESCRIPTION_MAX,
): { text: string; truncated: boolean } {
  let s = String(input ?? "");
  for (let i = 0; i < 2; i++)
    s = s.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => {
      if (e[0] === "#") {
        const n =
          e[1]?.toLowerCase() === "x"
            ? parseInt(e.slice(2), 16)
            : parseInt(e.slice(1), 10);
        try {
          return String.fromCodePoint(n);
        } catch {
          return " ";
        }
      }
      return (
        (
          {
            amp: "&",
            lt: "<",
            gt: ">",
            quot: '"',
            apos: "'",
            nbsp: " ",
          } as Record<string, string>
        )[e.toLowerCase()] || m
      );
    });
  s = s
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|section|br|tr)\s*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<[^>]*>/g, " ");
  s = s
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const truncated = s.length > max;
  return { text: truncated ? s.slice(0, max) : s, truncated };
}
function validUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password
      ? u.toString()
      : "";
  } catch {
    return "";
  }
}
class JobPayloadError extends Error {
  name = "JobPayloadError";
}
async function fetchBoard(
  key: string,
  provider: string,
  url: string,
  parse: (data: unknown) => PortalSearchResult,
): Promise<PortalSearchResult> {
  const old = cacheGet(key);
  if (old) return { ...old, cached: true };
  const pending = inFlight.get(key);
  if (pending) return { ...(await pending), cached: true };
  const p = (async () => {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        const e = Object.assign(new Error(`${provider}: ${res.status}`), {
          status: res.status,
        });
        throw e;
      }
      const raw = await res.json();
      const r = parse(raw);
      if (r.status === "success" || r.status === "empty") cachePut(key, r);
      return r;
    } catch (e: unknown) {
      const error = isRecord(e) ? e : undefined;
      const httpStatus =
        typeof error?.status === "number" && Number.isFinite(error.status)
          ? error.status
          : undefined;
      const status =
        httpStatus === 429
          ? "rate_limited"
          : error?.name === "SyntaxError"
            ? "malformed"
            : classifyProviderFailure(e);
      return {
        jobs: [],
        totalCount: 0,
        source: `${provider} (error)`,
        company: key.split(":").pop() || "",
        status,
        diagnostics: [
          {
            provider,
            status,
            ...(httpStatus === undefined ? {} : { httpStatus }),
          },
        ],
      };
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, p);
  return p;
}
function validRows(
  rows: unknown[],
  provider: string,
  map: (j: JsonRecord) => PortalJob | null,
  company: string,
): PortalSearchResult {
  let rejected = 0;
  const jobs: PortalJob[] = [];
  const observedAt = new Date().toISOString();
  for (const row of rows) {
    if (!isRecord(row)) {
      rejected++;
      continue;
    }
    try {
      const j = map(row);
      if (!j) rejected++;
      else jobs.push({ ...j, observedAt });
    } catch {
      // A malformed optional field on one posting must not discard valid peers.
      rejected++;
    }
  }
  const status =
    rows.length === 0 ? "empty" : jobs.length ? "success" : "malformed";
  return {
    jobs: jobs.slice(0, BOARD_FETCH_LIMIT),
    totalCount: Math.min(jobs.length, BOARD_FETCH_LIMIT),
    source: provider,
    company,
    status,
    diagnostics: [{ provider, status, rejectedRows: rejected }],
  };
}
function salary(
  min: unknown,
  max: unknown,
  currency: unknown,
  interval: unknown,
): JobSalary | undefined {
  const lo = finiteSalary(min),
    hi = finiteSalary(max);
  if (lo === null && hi === null) return;
  return {
    min: lo,
    max: hi,
    currency: typeof currency === "string" ? currency.toUpperCase() : "",
    interval: normalizeSalaryInterval(interval),
  };
}
export async function searchGreenhouse(
  companySlug: string,
  query?: string,
  limit = 50,
): Promise<PortalSearchResult> {
  validLimit(limit);
  if (!validSlug(companySlug))
    return failure("Greenhouse", companySlug, "malformed");
  const data = await fetchBoard(
    `gh:${companySlug}`,
    "Greenhouse",
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(companySlug)}/jobs?content=true`,
    (d) => {
      if (!isRecord(d) || !Array.isArray(d.jobs))
        throw new JobPayloadError("Expected jobs array");
      const name = isString(d.name) && d.name ? d.name : companySlug;
      const rows = d.jobs;
      return validRows(
        rows,
        "Greenhouse",
        (j) => {
          const url = j.absolute_url
            ? validUrl(j.absolute_url)
            : validUrl(
                `https://boards.greenhouse.io/${companySlug}/jobs/${j.id}`,
              );
          if (
            (typeof j.id !== "string" && typeof j.id !== "number") ||
            typeof j.title !== "string" ||
            !j.title.trim() ||
            !url
          )
            return null;
          const body = textContent(j.content);
          const published = normalizeJobDate(j.first_published || j.created_at);
          const location = isRecord(j.location) ? j.location.name : undefined;
          const firstDepartment = Array.isArray(j.departments)
            ? j.departments[0]
            : undefined;
          const department = isRecord(firstDepartment)
            ? firstDepartment.name
            : undefined;
          const locationName = isString(location) && location
            ? location
            : undefined;
          return {
            id: `gh-${j.id}`,
            sourceJobId: String(j.id),
            title: j.title,
            company: name,
            location: locationName || "Not Specified",
            locations: locationName ? [locationName] : [],
            department: isString(department) ? department || "" : "",
            url,
            applyUrl: url,
            postedDate: published,
            publishedAt: published,
            updatedAt: normalizeJobDate(j.updated_at) || undefined,
            source: "greenhouse",
            description: body.text,
            descriptionPreview: body.text.slice(0, 500),
            ingestion: {
              parserVersion: "2",
              method: "public_api",
              descriptionTruncated: body.truncated,
            },
          };
        },
        name,
      );
    },
  );
  return resultFor(data, query, limit, !!data.cached);
}
export async function searchLever(
  companySlug: string,
  query?: string,
  limit = 50,
  region?: "eu" | "global",
): Promise<PortalSearchResult> {
  validLimit(limit);
  if (!validSlug(companySlug))
    return failure("Lever", companySlug, "malformed");
  const host = region === "eu" ? "api.eu.lever.co" : "api.lever.co";
  const data = await fetchBoard(
    `lv:${host}:${companySlug}`,
    "Lever",
    `https://${host}/v0/postings/${encodeURIComponent(companySlug)}?mode=json`,
    (d) => {
      if (!Array.isArray(d))
        throw new JobPayloadError("Expected postings array");
      return validRows(
        d,
        "Lever",
        (j) => {
          const url = validUrl(j.hostedUrl || j.applyUrl);
          if (
            (typeof j.id !== "string" && typeof j.id !== "number") ||
            !String(j.id).trim() ||
            typeof j.text !== "string" ||
            !j.text.trim() ||
            !url
          )
            return null;
          const body = textContent(
            [
              j.descriptionPlain || j.description,
              (Array.isArray(j.lists) ? j.lists : [])
                .filter(isRecord)
                .map((x) => {
                  return `${x.text || x.title || ""}\n${x.content || ""}`;
                })
                .join("\n"),
              j.additionalPlain || j.additional || j.closing,
            ]
              .filter(Boolean)
              .join("\n\n"),
          );
          const categories = isRecord(j.categories) ? j.categories : undefined;
          const allLocations = categories?.allLocations || j.allLocations;
          const location = categories?.location;
          const loc = isString(location) && location ? location : "Not Specified";
          const locations = Array.isArray(allLocations)
            ? allLocations.filter(isString)
            : [loc];
          const department = categories?.department;
          const team = categories?.team;
          const salaryRange = isRecord(j.salaryRange) ? j.salaryRange : undefined;
          const pub = normalizeJobDate(j.createdAt);
          return {
            id: `lv-${j.id}`,
            sourceJobId: String(j.id),
            title: j.text,
            company: companySlug,
            location: loc,
            locations,
            country: isString(j.country) ? j.country : undefined,
            department:
              (isString(department) && department) ||
              (isString(team) && team) ||
              "",
            url,
            applyUrl: validUrl(j.applyUrl) || url,
            postedDate: pub,
            publishedAt: pub,
            source: "lever",
            description: body.text,
            descriptionPreview: body.text.slice(0, 500),
            employmentType: normalizeEmploymentType(categories?.commitment),
            remoteMode: normalizeWorkplaceType(j.workplaceType),
            salary: salary(
              salaryRange?.min,
              salaryRange?.max,
              salaryRange?.currency,
              salaryRange?.interval,
            ),
            ingestion: {
              parserVersion: "2",
              method: "public_api",
              descriptionTruncated: body.truncated,
            },
          };
        },
        companySlug,
      );
    },
  );
  return resultFor(data, query, limit, !!data.cached);
}
export async function searchAshby(
  companySlug: string,
  query?: string,
  limit = 50,
): Promise<PortalSearchResult> {
  validLimit(limit);
  if (!validSlug(companySlug))
    return failure("Ashby", companySlug, "malformed");
  const data = await fetchBoard(
    `ash:${companySlug}`,
    "Ashby",
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(companySlug)}?includeCompensation=true`,
    (d) => {
      if (!isRecord(d) || !Array.isArray(d.jobs))
        throw new JobPayloadError("Expected jobs array");
      const organizationName = firstString(d.organizationName) || companySlug;
      const visible = d.jobs.filter(
        (row) => !isRecord(row) || row.isListed !== false,
      );
      const r = validRows(
        visible,
        "Ashby",
        (j) => {
          const url = validUrl(j.jobUrl || j.applyUrl);
          if (
            (typeof j.id !== "string" && typeof j.id !== "number") ||
            !String(j.id).trim() ||
            typeof j.title !== "string" ||
            !j.title.trim() ||
            !url
          )
            return null;
          const body = textContent(j.descriptionPlain || j.descriptionHtml);
          const locations = [
            j.location,
            ...(Array.isArray(j.secondaryLocations)
              ? j.secondaryLocations.map((x) =>
                  isString(x) ? x : isRecord(x) ? x.location : undefined,
                )
              : []),
          ].filter((x): x is string => isString(x) && Boolean(x));
          const compensation = isRecord(j.compensation)
            ? j.compensation
            : undefined;
          const address = isRecord(j.address) ? j.address : undefined;
          const postalAddress = isRecord(address?.postalAddress)
            ? address.postalAddress
            : undefined;
          const summary = Array.isArray(compensation?.summaryComponents)
            ? compensation.summaryComponents
            : null;
          const tierComponents = Array.isArray(
            compensation?.compensationTiers,
          )
            ? compensation.compensationTiers.flatMap((tier) =>
                isRecord(tier) && Array.isArray(tier.components)
                  ? tier.components.filter(isRecord)
                  : [],
              )
            : [];
          const components = summary?.length
            ? summary.filter(isRecord)
            : tierComponents;
          const pays = components
            .filter((x) => x.compensationType === "Salary")
            .map((x) =>
              salary(x.minValue, x.maxValue, x.currencyCode, x.interval),
            )
            .filter(isJobSalary);
          let pay: JobSalary | undefined;
          if (pays.length) {
            const currencies = new Set(pays.map((x) => x.currency));
            const intervals = new Set(pays.map((x) => x.interval));
            if (currencies.size === 1 && intervals.size === 1) {
              const mins = pays
                  .map((x) => x.min)
                  .filter((x): x is number => x !== null),
                maxs = pays
                  .map((x) => x.max)
                  .filter((x): x is number => x !== null);
              pay = {
                min: mins.length ? Math.min(...mins) : null,
                max: maxs.length ? Math.max(...maxs) : null,
                currency: pays[0].currency,
                interval: pays[0].interval,
              };
            }
          }
          const pub = normalizeJobDate(j.publishedAt);
          return {
            id: `ash-${j.id}`,
            sourceJobId: String(j.id),
            title: j.title,
            company: organizationName,
            location: locations[0] || "Not Specified",
            locations,
            country: firstString(
              postalAddress?.addressCountry,
              address?.addressCountry,
            ),
            department:
              firstString(j.departmentName, j.department, j.team) || "",
            url,
            applyUrl: validUrl(j.applyUrl) || url,
            postedDate: pub,
            publishedAt: pub,
            source: "ashby",
            description: body.text,
            descriptionPreview: body.text.slice(0, 500),
            employmentType: normalizeEmploymentType(j.employmentType),
            remoteMode: normalizeWorkplaceType(
              j.workplaceType || (j.isRemote ? "Remote" : ""),
            ),
            salary: pay,
            ingestion: {
              parserVersion: "2",
              method: "public_api",
              descriptionTruncated: body.truncated,
            },
          };
        },
        organizationName,
      );
      return r;
    },
  );
  return resultFor(data, query, limit, !!data.cached);
}
export async function scanCompanyPortals(
  companySlug: string,
  query?: string,
  limit = 50,
): Promise<PortalSearchResult> {
  validLimit(limit);
  if (!validSlug(companySlug))
    return failure("Portals", companySlug, "malformed");
  const rs = await Promise.all([
    searchGreenhouse(companySlug, undefined, BOARD_FETCH_LIMIT),
    searchLever(companySlug, undefined, BOARD_FETCH_LIMIT),
    searchAshby(companySlug, undefined, BOARD_FETCH_LIMIT),
  ]);
  const jobs = rs.flatMap((r) => r.jobs);
  const diagnostics = rs.flatMap((r) => r.diagnostics || []);
  const boardsSucceeded = diagnostics.filter(
      (d) => d.status === "success" || d.status === "empty",
    ).length,
    boardsFailed = diagnostics.length - boardsSucceeded;
  const status: ProviderOutcome = jobs.length
    ? "success"
    : boardsSucceeded
      ? "empty"
      : diagnostics.find((d) => d.status === "rate_limited")?.status ||
        diagnostics.find((d) => d.status === "timeout")?.status ||
        "unavailable";
  const raw: PortalSearchResult = {
    jobs,
    totalCount: jobs.length,
    source:
      rs
        .filter((r) => r.jobs.length)
        .map((r) => r.source)
        .join(" + ") || "No portal found",
    company: rs.find((r) => r.jobs.length)?.company || companySlug,
    status,
    diagnostics,
    boardsSucceeded,
    boardsFailed,
  };
  return resultFor(raw, query, limit);
}
// ── Well-known company → ATS slug mapping ──
// These are public board slugs — easily verified
// Every entry below was called live on 2026-08-04 and the posting count recorded.
// Six rows were wrong before that check: netflix and twitch were registered on
// Lever and both 404 (Netflix has left Lever entirely), and ramp, notion, plaid and
// benchling were registered on Greenhouse where all four 404 — they are on Ashby,
// and between them carry 391 postings that were unreachable. 'ramp-ashby' was a
// duplicate key pointing at the same board as 'ramp'.
//
// A wrong platform is silent: the adapter gets a 404, returns empty, and search
// simply finds nothing for that company. Re-verify counts before trusting them; a
// board can empty out or migrate at any time. An Ashby board that returns 200 with
// zero jobs (vercel today) is indistinguishable from a wrong slug — both are valid
// responses, so neither can be auto-detected as an error.
export const KNOWN_BOARDS: Record<
  string,
  { platform: "greenhouse" | "lever" | "ashby"; slug: string }
> = {
  // Greenhouse — 2,350 postings verified 2026-08-04
  databricks: { platform: "greenhouse", slug: "databricks" }, // 807
  stripe: { platform: "greenhouse", slug: "stripe" }, // 550
  cloudflare: { platform: "greenhouse", slug: "cloudflare" }, // 290
  airbnb: { platform: "greenhouse", slug: "airbnb" }, // 189
  figma: { platform: "greenhouse", slug: "figma" }, // 177
  coinbase: { platform: "greenhouse", slug: "coinbase" }, // 163
  duolingo: { platform: "greenhouse", slug: "duolingo" }, // 65
  twitch: { platform: "greenhouse", slug: "twitch" }, // 62 — was on Lever (404)
  discord: { platform: "greenhouse", slug: "discord" }, // 47

  // Ashby — 416 postings verified 2026-08-04
  ramp: { platform: "ashby", slug: "ramp" }, // 120 — was on Greenhouse (404)
  notion: { platform: "ashby", slug: "notion" }, // 111 — was on Greenhouse (404)
  plaid: { platform: "ashby", slug: "plaid" }, // 108 — was on Greenhouse (404)
  benchling: { platform: "ashby", slug: "benchling" }, // 52  — was on Greenhouse (404)
  linear: { platform: "ashby", slug: "linear" }, // 25
  vercel: { platform: "ashby", slug: "vercel" }, // 0 — valid 200, empty board

  // Lever — 103 postings verified 2026-08-04
  spotify: { platform: "lever", slug: "spotify" }, // 103
  // netflix and twitch were here and both 404. Netflix is no longer on Lever;
  // twitch moved to Greenhouse above. They were costing a request per scan and
  // returning nothing.
};

export async function searchCompanyJobs(
  company: string,
  query?: string,
  limit = 50,
): Promise<PortalSearchResult> {
  const n = company.toLowerCase().replace(/[^a-z0-9]/g, "");
  const b = KNOWN_BOARDS[n];
  if (!b) return scanCompanyPortals(n, query, limit);
  switch (b.platform) {
    case "greenhouse":
      return searchGreenhouse(b.slug, query, limit);
    case "lever":
      return searchLever(b.slug, query, limit);
    case "ashby":
      return searchAshby(b.slug, query, limit);
  }
}
export async function searchAllKnownBoards(
  query?: string,
  limit = 60,
): Promise<PortalSearchResult> {
  validAggregateLimit(limit);
  const entries = Object.entries(KNOWN_BOARDS);
  const rs = await Promise.all(
    entries.map(([, b]) =>
      b.platform === "greenhouse"
        ? searchGreenhouse(b.slug, undefined, BOARD_FETCH_LIMIT)
        : b.platform === "lever"
          ? searchLever(b.slug, undefined, BOARD_FETCH_LIMIT)
          : searchAshby(b.slug, undefined, BOARD_FETCH_LIMIT),
    ),
  );
  const diagnostics = rs.flatMap((r) => r.diagnostics || []);
  const boardsSucceeded = diagnostics.filter(
      (d) => d.status === "success" || d.status === "empty",
    ).length,
    boardsFailed = diagnostics.length - boardsSucceeded;
  const terms = (query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((x) => x.length > 1);
  const all = rs
    .flatMap((r) => r.jobs)
    .filter((j) =>
      terms.every((t) =>
        `${j.title} ${j.location} ${j.company}`.toLowerCase().includes(t),
      ),
    );
  const status: ProviderOutcome = all.length
    ? "success"
    : boardsSucceeded
      ? "empty"
      : diagnostics.find((d) => d.status === "rate_limited")?.status ||
        diagnostics.find((d) => d.status === "timeout")?.status ||
        "unavailable";
  return {
    jobs: clone(all.slice(0, limit)),
    totalCount: all.length,
    source: `${boardsSucceeded} company boards`,
    company: "",
    diagnostics,
    boardsSucceeded,
    boardsFailed,
    status,
  };
}
