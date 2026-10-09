# Managed job-site scraper research

Reviewed October 8, 2026. Taco already has public Greenhouse, Lever, and Ashby adapters, normalized metadata, trust checks, typed outcomes, local paging, and bounded Ever Jobs coverage. This review looks for additive LinkedIn, Indeed, Glassdoor, and Workday sources. No paid runs, signups, credential access, or bulk extraction were performed; vendor reliability claims were not independently measured.

## Recommendation

Pilot **Bright Data Jobs Scraper API** for managed LinkedIn/Indeed/Glassdoor extraction and **Apify’s Bebity LinkedIn Jobs Scraper** as a mature comparison. Bright Data is provider-operated, multi-site, structured, and publicly priced. Bebity has more Store history and adoption than the recently published two-user Actors, with documented descriptions and filters.

Do not select the new `agenttoolworks` LinkedIn/Indeed Actor just on price. Its price is compelling, but its page states that LinkedIn `applyUrl` is only the LinkedIn job page; it does not return the employer’s external application URL. Its author-reported tests are not independent. Keep Apify’s Workday Actor as an exploratory option; it is community-maintained with low adoption.

Before displaying or redistributing listings, confirm data rights in writing. Bright Data’s current MSA bars distribution of Data Services data to offer a similar or competitive product, a clause that may matter for Taco. No reviewed Apify Actor or Oxylabs product page grants Taco a right to redistribute extracted job content.

## Comparison

| Product | Coverage and output | Integration and limits | Public price | Status and assessment |
|---|---|---|---|---|
| [Bright Data Jobs Scraper API](https://brightdata.com/products/web-scraper/jobs-scraper) | LinkedIn, Indeed, Glassdoor; keyword/company discovery and job-URL collection. Descriptions and apply links advertised; completeness untested. | REST; up to 5,000 URLs; API/webhook/cloud delivery. Paging unverified. | **$1.50/1,000 successful records**; **5,000 free/month**. $499/month includes 384,000, then $1.30/1,000. Infrastructure included. | Provider-maintained. Strong managed multi-board pilot; pricing and product-use terms are separate questions. |
| [Apify `bebity/linkedin-jobs-scraper`](https://apify.com/bebity/linkedin-jobs-scraper) | LinkedIn; documents full descriptions and direct apply links, untested. | Sync/async REST and dataset retrieval; search filters and bounded result limits. | **From $1.00/1,000 job results**. Author says platform usage is included; optional enrichment costs extra. | Community-maintained. Store showed 43K total users and 72 reviews. More established than the new Actors; adoption does not prove reliability. |
| [Apify `agenttoolworks/linkedin-indeed-jobs-scraper`](https://apify.com/agenttoolworks/linkedin-indeed-jobs-scraper) | Searches LinkedIn and Indeed by keywords, location, and country. Claims full descriptions and salary/date/work-type fields. Its LinkedIn `applyUrl` is the LinkedIn job page, not the employer’s external application URL; `applyType` only flags external vs Easy Apply. | Sync/async API and dataset; page advertises 30 countries and board-specific limits. | **LinkedIn $0.35/1,000 with description or $0.15 without; Indeed $0.10/1,000 with description or $0.05 without.** Actor says platform usage is included and no subscription applies. | Community-maintained and very new (two users shown). Low price does not establish stability; author tests are not independent. Use only as a price benchmark. |
| [Apify `fetch_cat/workday-jobs-scraper`](https://apify.com/fetch_cat/workday-jobs-scraper) | Public Workday career sites. Claims IDs, title, locations, posting date, employment type, remote signal, and full descriptions; tenant fields vary. This ATS family is additive to native adapters, though Ever Jobs may already cover some listings. | Apify API and dataset; multiple career-site URLs and search term. Paging guarantee unverified. | **$0.005/run + $0.00004220 per saved row** at free tier (~$0.0422/1,000 rows plus run), with tier discounts. Apify compute, storage, proxies, and transfer may add cost. | Community-maintained with single-digit total users shown. Exploratory only; verify totals, paging, and descriptions. |
| [Oxylabs Jobs Scraper API](https://oxylabs.io/products/scraper-api/web/jobs-scraper) | General Web Scraper API. Indeed is a named target but returns raw HTML (Oxy Parser available); product page also mentions Glassdoor. LinkedIn, normalized job schema, and full-description contract were not confirmed. | Realtime API with target URL and geo-location, JS rendering, batches, and scheduled cloud delivery. Taco would need to parse/normalize pages. | Free trial up to **2,000 results**. Public “Other” rate is **$1.15/1,000 successful results without JS** or **$1.35/1,000 with JS**; not confirmed as Indeed-specific. | Provider-operated generic infrastructure; useful for unsupported sites but less job-ready. |

Bright Data’s separate [Jobs Data API](https://brightdata.com/products/data-feeds/jobs-data-api) advertises unified LinkedIn/Indeed/Glassdoor records, 100+ fields, daily updates, deduplication, and async snapshots delivered by API, webhook, or storage. Price is **not shown**; it says pay per record with volume discounts. This is a quote-only product, distinct from the live Scraper API above.

## Pilot checks and rights

Compare Bright Data and Bebity on a small fixed query set: descriptions, IDs, timestamps, salary/work-type completeness, geography, duplicates, and failed-vs-empty outcomes. Preserve Taco’s normalized metadata, provenance, trust checks, typed outcomes, and paging. Test Workday separately against boards with known totals.

Bright Data’s [Master Service Agreement](https://brightdata.com/license) (updated June 16, 2026) says Data Services data must not be redistributed to offer a similar or competitive product, and disclaims data accuracy/completeness. The Bright Data API marketing page’s commercial use cases do not waive those terms. The reviewed Apify Actor pages describe collection/output, not a sublicensing right; Oxylabs’ product page likewise does not settle redistribution. Get written approval for Taco’s intended display and retention model, and assess the source-site terms separately.

## Evidence notes

Full pages/docs were opened for the products and terms linked above. `agenttoolworks` explicitly states its apply-URL limit and low user count; its test figures are author-reported. Bebity’s page shows price, adoption/reviews, output fields, and API options; success-rate claims are unverified. Oxylabs pricing is its generic “Other” tier. Recheck current prices before a paid run.

Glassdoor Actors appeared only in search snippets and are not relied on here. The Misceres Indeed Actor was opened but not selected for the pilot. No source was run; output quality, coverage, and latency remain unverified.
