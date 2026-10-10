/**
 * Job Search API Integration
 * Primary: Adzuna API with server-side caching
 * Fallback: Remotive (free, always works)
 */

export interface RealJob {
    id: string;
    title: string;
    company: string;
    location: string;
    salary: {
        min: number | null;
        max: number | null;
        currency: string;
        isPredicted?: boolean;
    };
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
}

// ── Server-side in-memory cache (5-min TTL) ──
const cache = new Map<string, { data: JobSearchResult; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(params: JobSearchParams): string {
    return `${params.query}|${params.location || ''}|${params.country || 'us'}|${params.page || 1}|${params.sortBy || 'relevance'}|${params.fullTime || false}|${params.salaryMin || 0}`;
}

function getFromCache(key: string): JobSearchResult | null {
    const entry = cache.get(key);
    if (entry && Date.now() < entry.expiry) {
        return { ...entry.data, cached: true };
    }
    if (entry) cache.delete(key);
    return null;
}

function setCache(key: string, data: JobSearchResult): void {
    cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
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
    const lowerDesc = description.toLowerCase();
    const foundSkills: string[] = [];

    for (const skill of SKILL_KEYWORDS) {
        if (lowerDesc.includes(skill.toLowerCase())) {
            const formatted = skill.split(' ').map(word =>
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');
            foundSkills.push(formatted);
        }
    }

    return [...new Set(foundSkills)].slice(0, 12);
}

// ── Salary Parsing ──
function formatSalaryRange(min: number | null, max: number | null, currency = 'USD'): string {
    if (!min && !max) return '';
    const fmt = (n: number) => {
        if (n >= 1000) return `$${Math.round(n / 1000)}k`;
        return `$${n}`;
    };
    if (min && max && min !== max) return `${fmt(min)} – ${fmt(max)}`;
    if (min) return `${fmt(min)}+`;
    if (max) return `Up to ${fmt(max)}`;
    return '';
}

// ── Time Ago ──
function timeAgo(dateString: string): string {
    const diff = Date.now() - new Date(dateString).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    return `${weeks}w ago`;
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
    // off by default rather than on. Remotive is the fallback and needs no licence.
    // To re-enable: obtain the written licence, add the attribution component to the
    // job-search and market-oracle result lists, then set ADZUNA_LICENSED=true.
    if (process.env.ADZUNA_LICENSED !== 'true') {
        return { jobs: [], totalCount: 0, source: 'adzuna (unlicensed - disabled)' };
    }

    const appId = process.env.ADZUNA_APP_ID;
    const apiKey = process.env.ADZUNA_API_KEY;

    if (!appId || !apiKey) {
        console.warn('ADZUNA credentials not set');
        return { jobs: [], totalCount: 0, source: 'adzuna (no key)' };
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
        if (params.salaryMin) url += `&salary_min=${params.salaryMin}`;

        const response = await fetch(url, {
            headers: { Accept: 'application/json' },
            next: { revalidate: 300 }, // Next.js 5-min fetch cache
        });

        if (!response.ok) {
            throw new Error(`Adzuna API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        const jobs: RealJob[] = (data.results || []).map((job: any) => ({
            id: job.id?.toString() || crypto.randomUUID(),
            title: cleanTitle(job.title || 'Unknown Title'),
            company: job.company?.display_name || 'Unknown Company',
            location: job.location?.display_name || 'Unknown Location',
            salary: {
                min: job.salary_min || null,
                max: job.salary_max || null,
                currency: 'USD',
                isPredicted: !!job.salary_is_predicted,
            },
            description: job.description || '',
            skills: extractSkillsFromDescription(job.description || ''),
            url: job.redirect_url || '#',
            postedDate: job.created || new Date().toISOString(),
            employmentType: job.contract_type === 'contract' ? 'Contract' : job.contract_time === 'full_time' ? 'Full-time' : job.contract_time === 'part_time' ? 'Part-time' : 'Full-time',
            category: job.category?.label || '',
            source: 'adzuna' as const,
        }));

        const result: JobSearchResult = {
            jobs,
            // Their `data.count` is a market-wide vacancy count, and using their data
            // "in aggregation (including but not limited to vacancy counts...)" is
            // forbidden without written consent. Publishing the listings themselves
            // is permitted, so report only how many we are actually showing.
            totalCount: jobs.length,
            source: 'Adzuna',
        };

        setCache(cacheKey, result);
        return result;
    } catch (error) {
        console.error('Adzuna API error:', error);
        return { jobs: [], totalCount: 0, source: 'adzuna (error)' };
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

/**
 * Remotive API — DISABLED. We were in breach of their terms.
 *
 * Remotive ships its terms in-band on every response, in the `0-legal-notice`
 * field. Read live on 2026-08-04, it says, verbatim:
 *
 *   "Displaying our jobs in order to collect signups/email addresses to show a
 *    listing constitutes a breach of our terms of services."
 *
 * Taco gates job matches behind signup, so every Remotive listing we showed was
 * exactly that. The same notice also requires a link back to the Remotive URL AND
 * naming Remotive as the source (we did neither), imposes a deliberate 24-hour
 * delay so attribution accrues to them, and advises at most ~4 requests per day —
 * we called it per search. Their paid API "starting budget is $5k/mo".
 *
 * Turning it off rather than remediating: the feed returns 32 listings TOTAL
 * (job-count 32, total-job-count 32 — not per page), skewed to micro and freelance
 * employers. Since searchAllKnownBoards now reaches ~2,869 postings across the
 * company boards, this feed contributes almost nothing and carries a live breach.
 *
 * Re-enabling would mean: ungating listings from signup, rendering the link-back
 * and source credit, honouring the 24-hour delay, and caching to ~4 calls/day.
 */
export async function searchJobsRemotive(_params: JobSearchParams): Promise<JobSearchResult> {
    return { jobs: [], totalCount: 0, source: 'remotive (disabled - terms)' };
}

async function searchJobsRemotiveDisabled(params: JobSearchParams): Promise<JobSearchResult> {
    try {
        const url = `https://remotive.com/api/remote-jobs?limit=50`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Remotive API error: ${response.status}`);
        }

        const data = await response.json();
        const queryLower = params.query.toLowerCase();
        const filteredJobs = (data.jobs || []).filter((job: any) =>
            job.title?.toLowerCase().includes(queryLower) ||
            job.description?.toLowerCase().includes(queryLower) ||
            job.tags?.some((tag: string) => tag.toLowerCase().includes(queryLower))
        );

        const jobs: RealJob[] = filteredJobs.slice(0, 30).map((job: any) => ({
            id: job.id?.toString() || crypto.randomUUID(),
            title: job.title || 'Unknown Title',
            company: job.company_name || 'Unknown Company',
            location: job.candidate_required_location || 'Remote',
            salary: { min: null, max: null, currency: 'USD' },
            description: job.description || '',
            skills: job.tags || extractSkillsFromDescription(job.description || ''),
            url: job.url || '#',
            postedDate: job.publication_date || new Date().toISOString(),
            employmentType: job.job_type || 'Full-time',
            source: 'remotive' as const,
        }));

        return { jobs, totalCount: jobs.length, source: 'Remotive' };
    } catch (error) {
        console.error('Remotive API error:', error);
        return { jobs: [], totalCount: 0, source: 'remotive (error)' };
    }
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
    // A disabled/error fallback must not erase a successful empty primary result.
    if (result.source === 'Adzuna' && fallback.jobs.length === 0) return result;
    return fallback;
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
