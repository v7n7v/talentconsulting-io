import type { Metadata } from 'next';
import Link from 'next/link';
import { TalentConsultingWordmark } from '@/components/BrandLogo';
import JsonLd from '@/components/seo/JsonLd';
import { breadcrumbJsonLd, buildMetadata } from '@/lib/seo';
import PricingTables from './PricingTables';

export const metadata: Metadata = buildMetadata({
  title: 'Pricing',
  description:
    'Free career checks and tools with no account. Talent Standard for hands-on application work, Talent Max for Taco-led scouting and review-ready packets.',
  path: '/pricing',
  keywords: ['resume builder pricing', 'AI career tool pricing', 'job search app cost'],
});

/**
 * The public pricing page.
 *
 * Four landing links pointed at /pricing and the route did not exist, so the
 * footer dodged it with an in-page #pricing anchor that only resolves on `/`.
 *
 * No amount appears in this file. Every paid figure is fetched from Stripe at
 * run time through hooks/use-billing-prices, and when the catalogue cannot be
 * read the card says so rather than showing a placeholder. That is the same
 * rule the rest of the product follows: an unknown value stays unknown.
 */
export default function PricingPage() {
  return (
    <main className="min-h-dvh bg-[var(--bg-deep)] text-[var(--text-primary)]">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Pricing', path: '/pricing' },
        ])}
      />

      <header className="border-b border-[var(--border-subtle)]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" aria-label="TalentConsulting.io home" className="inline-flex min-h-[44px] min-w-0 items-center">
            <TalentConsultingWordmark className="w-[min(210px,48vw)]" />
          </Link>
          <Link
            href="/tools"
            className="inline-flex min-h-[44px] items-center text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            Free tools
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-1 text-xs text-[var(--text-muted)]">
          <Link
            href="/"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center transition-colors hover:text-[var(--text-primary)]"
          >
            Home
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" className="inline-flex min-h-[44px] items-center">Pricing</span>
        </nav>

        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">Pricing</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-secondary)]">
          Start free with no account. Paid plans add the parts of a search that need your saved
          history rather than a single paste. Nothing is submitted to an employer without you
          approving it first.
        </p>

        <PricingTables />

        <section className="mt-14 max-w-2xl">
          <h2 className="text-lg font-semibold tracking-tight">What none of these plans do</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
            No plan applies to jobs for you, and no plan guarantees interviews, offers, salary
            changes or visa outcomes. Taco prepares work for your review and stops there. Billing
            interval, invoices, payment method and cancellation are handled in Stripe.
          </p>
        </section>
      </div>
    </main>
  );
}
