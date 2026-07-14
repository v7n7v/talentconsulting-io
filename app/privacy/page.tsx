import type { Metadata } from 'next';
import Link from 'next/link';
import { TalentConsultingMark } from '@/components/BrandLogo';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Talent Studio handles account, billing, resume, and AI writing data.',
};

const sections = [
  {
    title: 'What We Collect',
    body: 'Talent Studio collects the account details you provide, workspace content you add, usage events needed to enforce free limits, and billing status received from Stripe. Career materials can include resumes, cover letters, job descriptions, notes, and generated drafts.',
  },
  {
    title: 'How We Use Data',
    body: 'We use your data to run the product, save your workspace, process AI requests, enforce plan limits, improve reliability, prevent abuse, and provide support. We do not sell personal data.',
  },
  {
    title: 'AI Processing',
    body: 'When you use AI tools, the text you submit may be sent to model providers so the requested output can be generated. You should review all AI-assisted output before using it in an application, interview, or professional setting.',
  },
  {
    title: 'Billing',
    body: 'Payments, invoices, payment methods, subscription changes, tax calculation, tax ID collection, billing address updates, refunds, disputes, and cancellation actions are handled by Stripe. Talent Studio stores billing identifiers, plan status, Stripe object references, operational ledger entries, refund and dispute case notes, and billing communication records. We do not store full card numbers, bank details, or sensitive payment method data.',
  },
  {
    title: 'Retention And Deletion',
    body: 'Workspace data is kept while your account is active unless you delete it or request deletion. Some billing, tax, refund, dispute, security, anti-abuse, or compliance records may be retained where required or reasonably needed to support audits, reconciliation, and legal obligations.',
  },
  {
    title: 'Contact',
    body: 'For privacy questions or deletion requests, contact support through the in-app feedback page or the account email associated with Talent Studio.',
  },
];

export default function PrivacyPage() {
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
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">Last updated May 14, 2026. This page summarizes the product privacy posture in plain language.</p>
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
