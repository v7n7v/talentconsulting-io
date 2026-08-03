'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useBillingPrices } from '@/hooks/use-billing-prices';
import type { PublicBillingPrice } from '@/lib/billing-price-types';
import { getPlanIdentity } from '@/lib/plan-identity';
import { COMPARISON, FREE_FEATURES, PRO_FEATURES, STUDIO_EXTRAS, type PlanFeature } from '@/lib/pricing-content';

type Interval = 'month' | 'year';

const FREE = getPlanIdentity('free');
const STANDARD = getPlanIdentity('pro');
const MAX = getPlanIdentity('studio');

/**
 * What a price renders as when Stripe has not answered.
 *
 * `unitAmount` is null and `sourceStatus` is 'unconfigured' or 'retrieval_error'
 * whenever the catalogue could not be read. There is no placeholder to fall back
 * on: PLAN_PRICE is null for every paid tier by design, so a number shown here
 * would be invented. The empty state says so and points at the one surface that
 * always has the real figure.
 */
function PriceLine({ price, loading }: { price: PublicBillingPrice; loading: boolean }) {
  const verified = !loading && price.sourceStatus === 'verified' && price.unitAmount !== null;
  if (!verified) {
    return (
      <p className="mt-4 text-sm text-[var(--text-muted)]">
        Pricing is loading from our billing provider. Open checkout to see the current figure.
      </p>
    );
  }
  // `display` already carries its own cadence ("$9.99/mo", "$99.99/yr"), so no
  // separate label. The annual equivalent and the saving are shown only when the
  // data actually has them - Max annual is exactly twelve months, with no
  // discount, and must not be dressed up as one.
  const showEffective = price.interval === 'year' && price.effectiveMonthlyDisplay !== price.display;
  return (
    <div className="mt-4">
      <p className="text-3xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)]">
        {price.display}
      </p>
      {showEffective || price.savingsLabel ? (
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs text-[var(--text-muted)]">
          {showEffective ? <span className="tabular-nums">{price.effectiveMonthlyDisplay}</span> : null}
          {price.savingsLabel ? <span>{price.savingsLabel}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

function FeatureList({ features }: { features: PlanFeature[] }) {
  return (
    <ul className="mt-5 space-y-3">
      {features.map((f) => (
        <li key={f.title} className="flex min-w-0 gap-3">
          <span aria-hidden="true" className="material-symbols-rounded shrink-0 text-base">{f.icon}</span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-[var(--text-primary)]">{f.title}</span>
            <span className="mt-0.5 block text-xs leading-5 text-[var(--text-secondary)]">{f.desc}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function PricingTables() {
  const { prices, loading, error, refresh } = useBillingPrices();
  const [interval, setInterval] = useState<Interval>('month');

  const proPrice = prices.plans.pro[interval];
  const maxPrice = prices.plans.studio[interval];

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Billing interval" className="inline-flex gap-1">
          {(['month', 'year'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setInterval(value)}
              aria-pressed={interval === value}
              className={
                interval === value
                  ? 'btn-secondary inline-flex min-h-[44px] items-center'
                  : 'inline-flex min-h-[44px] items-center px-4 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]'
              }
            >
              {value === 'month' ? 'Monthly' : 'Annual'}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-[var(--text-muted)]">
          Pricing could not be loaded.{' '}
          <button type="button" onClick={refresh} className="underline underline-offset-2 hover:text-[var(--text-primary)]">
            Try again
          </button>
        </p>
      ) : null}

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <section className="glass-card flex flex-col p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{FREE.displayName}</h2>
          <p className="mt-4 flex flex-wrap items-baseline gap-x-2">
            <span className="text-3xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)]">$0</span>
            <span className="text-xs text-[var(--text-muted)]">no account needed to start</span>
          </p>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{FREE.description}</p>
          <FeatureList features={FREE_FEATURES} />
          <Link href="/tools" className="btn-secondary mt-6 inline-flex min-h-[44px] items-center self-start">
            Use the free tools
          </Link>
        </section>

        <section className="glass-card flex flex-col p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{STANDARD.displayName}</h2>
          <PriceLine price={proPrice} loading={loading} />
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{STANDARD.description}</p>
          <FeatureList features={PRO_FEATURES.slice(0, 5)} />
          <Link
            href="/suite/upgrade?plan=pro"
            className="btn-secondary mt-6 inline-flex min-h-[44px] items-center self-start"
          >
            Compare and subscribe
          </Link>
        </section>

        <section className="glass-card flex flex-col p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{MAX.displayName}</h2>
          <PriceLine price={maxPrice} loading={loading} />
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{MAX.description}</p>
          <FeatureList features={STUDIO_EXTRAS} />
          <Link
            href="/suite/upgrade?plan=studio"
            className="btn-secondary mt-6 inline-flex min-h-[44px] items-center self-start"
          >
            Compare and subscribe
          </Link>
        </section>
      </div>

      <section className="mt-14">
        <h2 className="text-lg font-semibold tracking-tight">Plan comparison</h2>
        {/* overflow-x on the wrapper, not the page: a nine-row table cannot fit
            320px, and the body must never scroll horizontally. */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <caption className="sr-only">What each plan includes</caption>
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th scope="col" className="py-3 pr-4 font-medium text-[var(--text-muted)]">Capability</th>
                <th scope="col" className="py-3 pr-4 font-medium text-[var(--text-muted)]">{FREE.shortName}</th>
                <th scope="col" className="py-3 pr-4 font-medium text-[var(--text-muted)]">{STANDARD.shortName}</th>
                <th scope="col" className="py-3 font-medium text-[var(--text-muted)]">{MAX.shortName}</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.label} className="border-b border-[var(--border-subtle)]">
                  <th scope="row" className="py-3 pr-4 font-normal text-[var(--text-primary)]">{row.label}</th>
                  <td className="py-3 pr-4 text-[var(--text-secondary)]">{row.free}</td>
                  <td className="py-3 pr-4 text-[var(--text-secondary)]">{row.pro}</td>
                  <td className="py-3 text-[var(--text-secondary)]">{row.studio}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
