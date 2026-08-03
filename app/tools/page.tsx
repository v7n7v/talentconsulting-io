import type { Metadata } from 'next';
import Link from 'next/link';
import { TalentConsultingWordmark } from '@/components/BrandLogo';
import JsonLd from '@/components/seo/JsonLd';
import { PUBLIC_TOOLS } from '@/lib/tools-catalog';
import { absoluteUrl, breadcrumbJsonLd, buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Free career tools',
  description:
    'Five free tools for the parts of a job search that are checkable: resume structure, ATS fit, interview practice, writing voice, and originality signals.',
  path: '/tools',
  keywords: [
    'free career tools',
    'free resume tools',
    'ATS checker',
    'AI resume tools',
    'interview practice tool',
  ],
});

/**
 * An index of the tools that have a public page - and only those.
 *
 * The landing rail names 22 tools. Five have public pages; the rest live inside
 * the Studio behind an account. Listing all 22 here would be an index promising
 * pages that do not exist, which is the defect this route was created to fix,
 * reproduced one level down.
 */
export default function ToolsIndexPage() {
  return (
    <main className="min-h-dvh bg-[var(--bg-deep)] text-[var(--text-primary)]">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Tools', path: '/tools' },
        ])}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'Free career tools',
          itemListElement: PUBLIC_TOOLS.map((tool, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: tool.name,
            url: absoluteUrl(tool.href),
          })),
        }}
      />

      <header className="border-b border-[var(--border-subtle)]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link
            href="/"
            aria-label="TalentConsulting.io home"
            className="inline-flex min-h-[44px] min-w-0 items-center"
          >
            <TalentConsultingWordmark className="w-[min(210px,48vw)]" />
          </Link>
          <Link
            href="/templates"
            className="inline-flex min-h-[44px] items-center text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            Templates
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Explicit 44px, not min-h-11. The root font-size here is 14px, so every
            rem-based Tailwind size is 87.5% of nominal and min-h-11 resolves to
            38.5px - under the target ui-verify.js checks for. A bare inline
            breadcrumb link measures 29px wide on its own. */}
        <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-1 text-xs text-[var(--text-muted)]">
          <Link
            href="/"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center transition-colors hover:text-[var(--text-primary)]"
          >
            Home
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" className="inline-flex min-h-[44px] items-center">Tools</span>
        </nav>

        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">Free career tools</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-secondary)]">
          Five tools for the parts of a job search that can actually be checked. Each one tells you
          what to fix first rather than scoring you and stopping. No account needed to try them.
        </p>

        <ul className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {PUBLIC_TOOLS.map((tool) => (
            <li key={tool.href} className="min-w-0">
              <Link href={tool.href} className="glass-card flex h-full gap-3 p-5 transition-colors">
                {/* No colour class. globals.css:2863 sets
                    `a .material-symbols-rounded { color: currentColor }`, which
                    outranks a utility - icons inside links follow the link's ink
                    by design. A colour class here would look deliberate and do
                    nothing, and an accent icon on every card is decoration. */}
                <span aria-hidden="true" className="material-symbols-rounded shrink-0 text-xl">
                  {tool.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[var(--text-primary)]">{tool.name}</span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{tool.summary}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <section className="mt-12 max-w-2xl">
          <h2 className="text-lg font-semibold tracking-tight">The rest of the suite</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
            Job tracking, packet preparation, story banks and Taco itself live inside the Studio,
            because they work from your saved resume rather than a single paste. Nothing is submitted
            anywhere without you approving it first.
          </p>
          {/* min-h-[44px] on top of .btn-secondary: the shared class is
              padding 8px/24px at 14px, which renders 39px tall. */}
          <Link href="/suite" className="btn-secondary mt-5 inline-flex min-h-[44px] items-center">
            Open the Studio
          </Link>
        </section>
      </div>
    </main>
  );
}
