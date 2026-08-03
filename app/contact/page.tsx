import type { Metadata } from 'next';
import Link from 'next/link';
import { TalentConsultingWordmark } from '@/components/BrandLogo';
import JsonLd from '@/components/seo/JsonLd';
import { breadcrumbJsonLd, buildMetadata } from '@/lib/seo';
import ContactForm from './ContactForm';

export const metadata: Metadata = buildMetadata({
  title: 'Contact us',
  description:
    'Send a question, a bug report, or a feature request to the TalentConsulting.io team. Every message gets a reference number and a reply.',
  path: '/contact',
  keywords: ['talentconsulting contact', 'talentconsulting support'],
});

/**
 * The page behind a link that has been 404ing in real customer email.
 *
 * emails/components/TalentEmailLayout.tsx renders "Contact support" pointing at
 * https://talentconsulting.io/contact in the footer of every transactional
 * email, and emails/tokens.ts plus six entries in lib/email/catalog.ts default
 * to the same URL. The API route has been complete this whole time - rate
 * limiting, a TC- case id, a Firestore record and two queued emails. Only the
 * page was missing.
 */
export default function ContactPage() {
  return (
    <main className="min-h-dvh bg-[var(--bg-deep)] text-[var(--text-primary)]">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Contact', path: '/contact' },
        ])}
      />

      <header className="border-b border-[var(--border-subtle)]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" aria-label="TalentConsulting.io home" className="inline-flex min-h-[44px] min-w-0 items-center">
            <TalentConsultingWordmark className="w-[min(210px,48vw)]" />
          </Link>
          <Link
            href="/help"
            className="inline-flex min-h-[44px] items-center text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            Help centre
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
          <span aria-current="page" className="inline-flex min-h-[44px] items-center">Contact</span>
        </nav>

        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">Contact us</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-secondary)]">
          Questions, bugs, and requests all reach the same queue. You will get a reference number
          straight away and a reply from a person, not an autoresponder that closes itself.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
          If your question is about your account or a resume already in the product, mentioning that
          gets it to the right person faster. Please do not paste passwords or payment details here.
        </p>

        <ContactForm />
      </div>
    </main>
  );
}
