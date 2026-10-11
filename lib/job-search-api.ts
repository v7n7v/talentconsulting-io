import type { JobIngestionEvidence, JobSalary, ProviderDiagnostic, ProviderOutcome, SalaryInterval } from './job-ingestion';
import { classifyProviderFailure, normalizeJobDate } from './job-ingestion';

/**
 * Job Search API Integration
 * Primary: Adzuna API with server-side caching
 * Legacy fallback: Adzuna, when licensed
 */

export interface RealJob extends Omit<JobIngestionEvidence, 'salary' | 'employmentType'> {
    id: string;
    title: string;
    company: string;
    location: string;
    salary: JobSalary;
    description: string;
    skills: string[];
    url: string;
    postedDate: string;
    employmentType: string;
    category?: string;
    source: 'adzuna' | 'remotive';
}

export interface JobSearchParams {
    query: string;
    location?: string;
    country?: string;
    page?: number;
    numPages?: number;
    remote?: boolean;
    fullTime?: boolean;
    salaryMin?: number;
    sortBy?: 'relevance' | 'salary' | 'date';
    resultsPerPage?: number;
}

export interface JobSearchResult {
    jobs: RealJob[];
    totalCount: number;
    source: string;
    cached?: boolean;
    status?: ProviderOutcome;
    diagnostics?: ProviderDiagnostic[];
}

// ── Server-side in-memory cache (5-min TTL) ──
const cache = new Map<string, { data: JobSearchResult; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(params: JobSearchParams): string {
    return JSON.stringify({
        query: params.query, location: params.location || '', country: (params.country || 'us').toLowerCase(),
        page: params.page ?? 1, numPages: params.numPages ?? 1, remote: params.remote ?? false,
        fullTime: params.fullTime ?? false, salaryMin: params.salaryMin ?? 0,
        sortBy: params.sortBy || 'relevance', resultsPerPage: params.resultsPerPage ?? 20,
    });
}

function getFromCache(key: string): JobSearchResult | null {
    const entry = cache.get(key);
    if (entry && Date.now() < entry.expiry) {
        return { ...structuredClone(entry.data), cached: true };
    }
    if (entry) cache.delete(key);
    return null;
}

function setCache(key: string, data: JobSearchResult): void {
    if (data.status !== 'success' && data.status !== 'empty') return;
    cache.set(key, { data: structuredClone(data), expiry: Date.now() + CACHE_TTL });
    // Prune old entries (keep max 200)
    if (cache.size > 200) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
    }
}

// ── Skill extraction from job descriptions ──
const SKILL_KEYWORDS = [
    'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'go', 'golang', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'scala',
    'react', 'vue', 'angular', 'next.js', 'nextjs', 'svelte', 'html', 'css', 'tailwind', 'sass', 'webpack',
    'node.js', 'nodejs', 'express', 'django', 'flask', 'spring', 'rails', 'fastapi', 'graphql', 'rest api',
    'postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'dynamodb', 'sql', 'nosql',
    'aws', 'azure', 'gcp', 'google cloud', 'docker', 'kubernetes', 'k8s', 'terraform', 'jenkins', 'ci/cd', 'github actions',
    'machine learning', 'deep learning', 'tensorflow', 'pytorch', 'nlp', 'computer vision', 'llm', 'openai', 'langchain',
    'data science', 'data engineering', 'spark', 'hadoop', 'airflow', 'pandas', 'numpy', 'tableau', 'power bi',
    'ios', 'android', 'react native', 'flutter', 'mobile development',
    'agile', 'scrum', 'git', 'linux', 'microservices', 'api design', 'system design', 'leadership', 'communication',
    'figma', 'sketch', 'adobe', 'photoshop', 'illustrator',
    'salesforce', 'hubspot', 'jira', 'confluence', 'slack',
    'excel', 'powerpoint', 'sharepoint',
    'cybersecurity', 'penetration testing', 'soc', 'siem', 'firewall',
];

function extractSkillsFromDescription(description: string): string[] {
    const text = description || '';
    const found: string[] = [];
    const aliases: Record<string, string> = {
        golang: 'Go', postgres: 'PostgreSQL', postgresql: 'PostgreSQL', k8s: 'Kubernetes',
        kubernetes: 'Kubernetes', nextjs: 'Next.js', 'next.js': 'Next.js', nodejs: 'Node.js', 'node.js': 'Node.js',
    };
    const labels: Record<string, string> = { javascript: 'JavaScript', typescript: 'TypeScript', 'c++': 'C++', 'c#': 'C#', 'ci/cd': 'CI/CD', 'rest api': 'REST API',
        'google cloud': 'Google Cloud', 'power bi': 'Power BI', 'machine learning': 'Machine Learning',
        'deep learning': 'Deep Learning', 'data science': 'Data Science', 'data engineering': 'Data Engineering',
        'computer vision': 'Computer Vision', 'react native': 'React Native', 'mobile development': 'Mobile Development',
        'api design': 'API Design', 'system design': 'System Design', 'penetration testing': 'Penetration Testing',
        'github actions': 'GitHub Actions' };
    const ambiguous: Record<string, RegExp> = {
        go: /\b(?:go\s+(?:developer|programming|language|engineer|backend|service|services)|golang|go-lang)\b/i,
        react: /\breact(?:\.js)?\s+(?:framework|library|developer|engineer|native|application|app)\b/i,
        spark: /\b(?:apache\s+spark|spark\s+(?:sql|streaming|framework|jobs?|cluster|dataframe))\b/i,
    };
    const technicalTokens = SKILL_KEYWORDS.filter(k => !['go', 'react', 'spark'].includes(k)).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const technicalNear = new RegExp(`(?:${technicalTokens.join('|')})`, 'i');
    const listContexts = [...text.matchAll(/(?:skills?|technologies|tech(?:nology)? stack|toolkit|experience with)\s*[:\-]?\s*([^.!?\n]{1,180})/gi)].map(m => ({ start: m.index || 0, end: (m.index || 0) + m[0].length }));
    for (const raw of SKILL_KEYWORDS) {
        const skill = raw.toLowerCase();
        let matched: boolean;
        if (ambiguous[skill]) {
            matched = ambiguous[skill].test(text);
            if (!matched) {
                const tokenPattern = new RegExp(`\\b${skill}\\b`, 'gi');
                matched = [...text.matchAll(tokenPattern)].some(match => {
                    const start = match.index || 0;
                    const end = start + match[0].length;
                    const local = text.slice(Math.max(0, start - 45), Math.min(text.length, end + 45));
                    const capitalized = match[0][0] === match[0][0].toUpperCase();
                    const inList = listContexts.some(range => start >= range.start && end <= range.end);
                    return inList || (capitalized && technicalNear.test(local));
                });
            }
        }
        else {
            const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Require punctuation-aware edges, retaining technical names such as C++, C#, and CI/CD.
            matched = new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'iu').test(text);
        }
        if (matched) {
            const label = aliases[skill] || labels[skill] || skill.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
            if (!found.includes(label)) found.push(label);
        }
    }
    return found;
}

// ── Salary Parsing ──
function formatSalaryRange(min: number | null, max: number | null, currency = 'USD', interval?: SalaryInterval): string {
    const low = safeSalary(min);
    const high = safeSalary(max);
    if (low === null && high === null) return '';
    const fmt = (n: number) => {
        const compact = n >= 1000 ? Math.round(n / 1000) * 1000 : n;
        try {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(compact)
                .replace(/,000$/, 'k');
        } catch {
            return `${currency} ${compact.toLocaleString('en-US')}`;
        }
    };
    const suffix: Partial<Record<SalaryInterval, string>> = { year: '/yr', month: '/mo', week: '/wk', day: '/day', hour: '/hr' };
    const rate = interval ? suffix[interval] || '' : '';
    if (low !== null && high !== null && low !== high) return `${fmt(low)} – ${fmt(high)}${rate}`;
    if (low !== null) return `${fmt(low)}+${rate}`;
    if (high !== null) return `Up to ${fmt(high)}${rate}`;
    return '';
}

// ── Time Ago ──
function timeAgo(dateString: string): string {
    const normalized = normalizeJobDate(dateString);
    if (!normalized) return 'Date not listed';
    const diff = Date.now() - new Date(normalized).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    return `${weeks}w ago`;
}

const COUNTRY_CURRENCY: Record<string, string> = {
    us: 'USD', gb: 'GBP', uk: 'GBP', ca: 'CAD', au: 'AUD', nz: 'NZD', ie: 'EUR', de: 'EUR', fr: 'EUR',
    es: 'EUR', it: 'EUR', nl: 'EUR', be: 'EUR', at: 'EUR', pt: 'EUR', fi: 'EUR', gr: 'EUR',
    pl: 'PLN', ch: 'CHF', se: 'SEK', no: 'NOK', dk: 'DKK', in: 'INR', sg: 'SGD', jp: 'JPY',
    br: 'BRL', mx: 'MXN', za: 'ZAR', ae: 'AED',
};
function safeSalary(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
function resultWithOutcome(jobs: RealJob[], source: string, status: ProviderOutcome, diagnostic?: ProviderDiagnostic): JobSearchResult {
    return { jobs, totalCount: jobs.length, source, status, diagnostics: diagnostic ? [diagnostic] : [] };
}

/**
 * Adzuna API — Primary source
 * Endpoint: GET /v1/api/jobs/{country}/search/{page}
 * Free tier: 250/day, 2500/month
 */
export async function searchJobsAdzuna(params: JobSearchParams): Promise<JobSearchResult> {
    // Off unless explicitly licensed. Adzuna's terms allow a 14-day trial "strictly
    // for the purpose of validating the general coverage and quality of the data";
    // any ongoing commercial use needs a written licence. They also require a
    // "Jobs by Adzuna" attribution of at least 116x23px wherever listings appear,
    // which this codebase renders in exactly zero places, and they forbid using the
    // data "in aggregation (including but not limited to vacancy counts, average
    // salaries etc)" — which is what passing their `count` through as totalCount was.
    //
    // Calling it anyway while shipping to real users is a breach, so the switch is
    // off by default rather than on. Remotive remains disabled until its terms are reviewed.
    // To re-enable: obtain the written licence, add the attribution component to the
    // job-search and market-oracle result lists, then set ADZUNA_LICENSED=true.
    if (process.env.ADZUNA_LICENSED !== 'true') {
        return resultWithOutcome([], 'Adzuna', 'disabled', { provider: 'adzuna', status: 'disabled' });
    }

    const appId = process.env.ADZUNA_APP_ID;
    const apiKey = process.env.ADZUNA_API_KEY;

    if (!appId || !apiKey) {
        console.warn('ADZUNA credentials not set');
        return resultWithOutcome([], 'Adzuna', 'disabled', { provider: 'adzuna', status: 'disabled' });
    }

    // Check cache first
    const cacheKey = getCacheKey(params);
    const cached = getFromCache(cacheKey);
    if (cached) return cached;

    try {
        const query = encodeURIComponent(params.query);
        const location = params.location ? encodeURIComponent(params.location) : '';
        const country = params.country || 'us';
        const page = params.page || 1;
        const resultsPerPage = params.resultsPerPage || 20;

        let url = `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?app_id=${appId}&app_key=${apiKey}&what=${query}&results_per_page=${resultsPerPage}&content-type=application/json`;

        if (location) url += `&where=${location}`;
        if (params.sortBy === 'salary') url += '&sort_by=salary';
        else if (params.sortBy === 'date') url += '&sort_by=date';
        else url += '&sort_by=relevance';
        if (params.fullTime) url += '&full_time=1';
        // Product targets are annual USD; a foreign API threshold uses local currency.
        // Leave incomparable pay eligible for the final merged-candidate filter.
        if (params.salaryMin && country.toLowerCase() === 'us') url += `&salary_min=${params.salaryMin}`;

        const response = await fetch(url, {
            headers: { Accept: 'application/json' },
            next: { revalidate: 300 }, // Next.js 5-min fetch cache
            signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) {
            throw Object.assign(new Error(`Adzuna API error: ${response.status} ${response.statusText}`), { status: response.status });
        }

        const data = await response.json();
        if (!data || typeof data !== 'object' || !Array.isArray(data.results)) {
            const error = Object.assign(new Error('Malformed Adzuna response'), { name: 'JobPayloadError' });
            throw error;
        }
        const currency = COUNTRY_CURRENCY[(params.country || 'us').toLowerCase()] || 'UNKNOWN';
        const parsedRows = data.results.map((job: any) => {
            if (!job || typeof job !== 'object') return null;
            const id = typeof job.id === 'string' || typeof job.id === 'number' ? String(job.id).trim() : '';
            const title = typeof job.title === 'string' ? cleanTitle(job.title) : '';
            let redirectUrl = '';
            try {
                const parsed = new URL(job.redirect_url);
                if (parsed.protocol === 'https:' || parsed.protocol === 'http:') redirectUrl = parsed.toString();
            } catch { /* malformed URL */ }
            if (!id || !title || !redirectUrl) return null;
            const description = typeof job.description === 'string' ? job.description : '';
            const company = typeof job.company?.display_name === 'string' ? job.company.display_name : 'Not listed';
            const location = typeof job.location?.display_name === 'string' ? job.location.display_name : 'Not listed';
            const publishedAt = normalizeJobDate(job.created);
            return {
            id,
            title,
            company,
            location,
            salary: {
                min: safeSalary(job.salary_min),
                max: safeSalary(job.salary_max),
                currency,
                // Annual is inferred from Adzuna's salary thresholds/examples; the response does not carry an interval field.
                interval: safeSalary(job.salary_min) !== null || safeSalary(job.salary_max) !== null ? 'year' : 'unknown',
                isPredicted: !!job.salary_is_predicted,
            },
            description,
            skills: extractSkillsFromDescription(description),
            url: redirectUrl,
            postedDate: publishedAt,
            employmentType: job.contract_type === 'contract' ? 'Contract' : job.contract_time === 'full_time' ? 'Full-time' : job.contract_time === 'part_time' ? 'Part-time' : 'Not listed',
            category: typeof job.category?.label === 'string' ? job.category.label : '',
            source: 'adzuna' as const,
            descriptionPreview: description.slice(0, 500),
            locations: location !== 'Not listed' ? [location] : [],
            applyUrl: redirectUrl,
            sourceJobId: id,
            publishedAt,
            ingestion: { parserVersion: 'adzuna-v2-annual-interval-inferred', method: 'public_api', descriptionTruncated: false },
        } as RealJob;
        });
        const malformedRows = parsedRows.filter((job: RealJob | null) => job === null).length;
        const jobs: RealJob[] = parsedRows.filter((job: RealJob | null): job is RealJob => job !== null);

        const result: JobSearchResult = {
            jobs,
            // Their `data.count` is a market-wide vacancy count, and using their data
            // "in aggregation (including but not limited to vacancy counts...)" is
            // forbidden without written consent. Publishing the listings themselves
            // is permitted, so report only how many we are actually showing.
            totalCount: jobs.length,
            source: 'Adzuna',
            status: jobs.length > 0 ? 'success' : malformedRows > 0 ? 'malformed' : 'empty',
            diagnostics: [{ provider: 'adzuna', status: jobs.length > 0 ? 'success' : malformedRows > 0 ? 'malformed' : 'empty', rejectedRows: malformedRows }],
        };

        setCache(cacheKey, result);
        return result;
    } catch (error) {
        const status = classifyProviderFailure(error);
        console.warn(`Adzuna provider outcome: ${status}`);
        const httpStatus = (error as { status?: number })?.status;
        return resultWithOutcome([], 'Adzuna', status, { provider: 'adzuna', status, httpStatus });
    }
}

// Clean HTML entities and tags from Adzuna titles
function cleanTitle(title: string): string {
    return title
        .replace(/<\/?[^>]+(>|$)/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
}

/** Remotive is intentionally disabled until its terms and product flow are remediated. */
export async function searchJobsRemotive(_params: JobSearchParams): Promise<JobSearchResult> {
    return resultWithOutcome([], 'Remotive', 'disabled', { provider: 'remotive', status: 'disabled' });
}

/**
 * Main search — Adzuna first, Remotive fallback
 */
export async function searchJobs(params: JobSearchParams): Promise<JobSearchResult> {
    // Primary: Adzuna
    const result = await searchJobsAdzuna(params);
    if (result.jobs.length > 0) return result;

    // Fallback: Remotive
    const fallback = await searchJobsRemotive(params);
    const diagnostics = [...(result.diagnostics || []), ...(fallback.diagnostics || [])];
    let status: ProviderOutcome;
    if (result.status && result.status !== 'disabled') status = result.status;
    else if (result.status === 'disabled' && fallback.status === 'disabled') status = 'disabled';
    else status = fallback.status || 'empty';
    return { ...fallback, status, diagnostics };
}

/**
 * Calculate fit score between user resume skills and job requirements
 * Returns 0-100 integer
 */
export function calculateFitScore(userSkills: string[], jobSkills: string[], jobTitle = ''): number {
    if (jobSkills.length === 0) return 55; // Unknown requirements → benefit of doubt

    const userLower = userSkills.map(s => s.toLowerCase().trim());
    const titleLower = jobTitle.toLowerCase();

    let matchCount = 0;
    for (const jSkill of jobSkills) {
        const jLower = jSkill.toLowerCase().trim();
        const matched = userLower.some(us =>
            us.includes(jLower) || jLower.includes(us) ||
            us.replace(/[.\-_\s]/g, '').includes(jLower.replace(/[.\-_\s]/g, ''))
        );
        if (matched) matchCount++;
    }

    // Bonus: check if user skills appear in job title
    let titleBonus = 0;
    for (const us of userLower) {
        if (titleLower.includes(us)) titleBonus += 0.15;
    }
    titleBonus = Math.min(titleBonus, 0.3);

    const rawScore = (matchCount / jobSkills.length) + titleBonus;
    // Scale to 40-98 range
    return Math.min(98, Math.round(40 + Math.min(rawScore, 1) * 58));
}

export { formatSalaryRange, timeAgo, extractSkillsFromDescription };
