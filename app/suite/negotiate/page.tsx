import Link from 'next/link';
import { SuiteToolHeader } from '@/components/suite/SuiteToolChrome';
import { ToolGuidanceBinding } from '@/components/guidance/ToolGuidanceProvider';
import { buildToolStory, storyStep } from '@/lib/tool-story-adapters';

export default function NegotiationCompatibilityPage() {
  return (
    <div className="mobile-app-content min-h-dvh px-4 py-3 md:p-6">
      <ToolGuidanceBinding config={buildToolStory({
        toolId: 'negotiate', title: 'Offer planning', contextKey: 'applications-handoff',
        purpose: 'Continue offer work inside the application record that actually reached the offer stage.',
        work: [
          storyStep('application', 'Open the real application', 'Use Applications to select an actual offer-stage record. This page does not capture or generate an offer.', 'offers-applications'),
          storyStep('offers', 'Review your recorded offers', 'Review offers opens the tracker with its offer filter. Enter actual compensation and deadlines there; guidance does not choose or edit a record.', 'offers-review'),
        ],
      })} />
      <div className="mx-auto max-w-3xl space-y-4">
        <SuiteToolHeader
          tool="negotiate"
          title="Salary negotiation moved into Applications"
          subtitle="Offer Coach now appears inside an application when it reaches the offer stage. Capture the offer, prepare a counter, ask Taco for language, and record the final decision without leaving the application record."
          eyebrow="Offer Coach"
          icon="payments"
          pageHelpId="negotiate"
        />

        <section className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 md:p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['1', 'Open an offer', 'Select an application with Offer status.'],
              ['2', 'Evaluate comp', 'Add base, total comp, equity, bonus, and deadline.'],
              ['3', 'Act cleanly', 'Generate the brief, copy language, and record the result.'],
            ].map(([step, title, body]) => (
              <div key={step} className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
                <span className="grid h-8 w-8 place-items-center rounded-[11px] border border-[var(--taco-coral)] bg-[var(--accent-dim)] text-sm font-bold text-[var(--accent)] dark:text-[var(--accent)]">{step}</span>
                <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{title}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{body}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link data-guide="offers-applications" href="/suite/applications" className="inline-flex items-center gap-2 rounded-[12px] border border-[var(--taco-coral)] bg-[var(--accent-dim)] px-4 py-2 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--accent-dim)] dark:text-[var(--accent)]">
              <span className="material-symbols-rounded text-[18px]">work</span>
              Open Applications
            </Link>
            <Link data-guide="offers-review" href="/suite/applications?status=offer" className="inline-flex items-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
              <span className="material-symbols-rounded text-[18px]">celebration</span>
              Review offers
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
