import type { Metadata } from 'next';
import Link from 'next/link';
import { TalentConsultingMark } from '@/components/BrandLogo';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms for using Talent Studio career tools, AI writing tools, subscriptions, and billing.',
};

const sections = [
  {
    title: 'Use Of The Product',
    body: 'Talent Studio provides career, writing, and job-search tools. You are responsible for the materials you upload, the claims you make, and the final content you submit to employers or third parties.',
  },
  {
    title: 'AI Output',
    body: 'AI output can be incomplete, inaccurate, or unsuitable for your situation. Do not add credentials, experience, education, metrics, or claims that you cannot verify. Review and edit all output before use.',
  },
  {
    title: 'No Outcome Guarantee',
    body: 'Talent Studio can help you prepare materials and make decisions, but it does not guarantee interviews, offers, compensation changes, visa outcomes, or employment results.',
  },
  {
    title: 'Subscriptions And Cancellation',
    body: 'Paid plans are billed through Stripe, which is the payment processor and financial source of truth. Stripe may collect billing address, tax ID, and tax location details needed for Stripe Tax. If you cancel, your plan is scheduled to end at the close of the current billing period unless Stripe shows otherwise. You keep paid access until that end date.',
  },
  {
    title: 'Refunds',
    body: 'Refund requests are reviewed based on account history, billing timing, plan type, payment status, dispute status, and product usage. Approved refunds are executed through Stripe and confirmed by Stripe records. Stripe fees, abuse, chargebacks, annual-plan timing, and heavy usage can affect eligibility.',
  },
  {
    title: 'Disputes And Billing Records',
    body: 'If a payment is disputed, we may retain billing, subscription, usage, communication, and admin-review records needed to understand and respond to the dispute. The in-app ledger is an operational mirror for support and reconciliation, not a replacement for Stripe reports or accounting records.',
  },
  {
    title: 'Acceptable Use',
    body: 'Do not use Talent Studio to misrepresent qualifications, create fraudulent applications, violate third-party rights, scrape protected systems, or attempt to bypass security or usage limits.',
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-dvh bg-[var(--bg-deep)] px-4 py-12 text-[var(--text-primary)] sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]">
          <span className="material-symbols-rounded text-[17px]">arrow_back</span>
          Back to Talent Studio
        </Link>
        <header className="mb-8">
          <div className="flex items-center gap-3">
            <TalentConsultingMark className="h-9 w-9 rounded-[12px] border border-[var(--border-subtle)]" />
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">Talent Studio</p>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Terms of Service</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">Last updated May 14, 2026. These terms keep the product clear, responsible, and fair to use.</p>
        </header>
        <div className="space-y-4">
          {sections.map((section) => (
            <section key={section.title} className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5">
              <h2 className="text-base font-semibold">{section.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
