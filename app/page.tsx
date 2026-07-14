'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AuthModal from '@/components/modals/AuthModal';
import UnifiedDashboard from '@/components/dashboard/UnifiedDashboard';
import WorkspaceFrame from '@/components/workspace/WorkspaceFrame';
import { useStore } from '@/lib/store';
import type { DashboardToolId } from '@/lib/dashboard-types';

const validDashboardTools: DashboardToolId[] = [
  'resume-check',
  'job-match',
  'ats-analyzer',
  'writing-trust',
  'quick-polish',
];

const homeGuideLinks = [
  {
    href: '/tools/resume-builder',
    label: 'AI resume builder',
    detail: 'Create ATS-readable resume drafts from real experience.',
  },
  {
    href: '/tools/ats-analyzer',
    label: 'ATS analyzer',
    detail: 'Check parser risk, keywords, and missing proof before applying.',
  },
  {
    href: '/tools/interview-prep',
    label: 'Interview practice',
    detail: 'Turn resume proof into clear stories and practice prompts.',
  },
  {
    href: '/templates',
    label: 'Resume templates',
    detail: 'Start with clean formats built for applicant tracking systems.',
  },
];

function isDashboardTool(value: string | null): value is DashboardToolId {
  return !!value && validDashboardTools.includes(value as DashboardToolId);
}

function HomePublicSnapshot() {
  return (
    <section className="min-h-dvh bg-[var(--bg-deep)] px-5 py-10 text-[var(--text-primary)] sm:px-8">
      <div className="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-6xl flex-col justify-center gap-8">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">
            TalentConsulting.io career workspace
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.015em] text-[var(--text-primary)] sm:text-5xl">
            AI career intelligence for resumes, job search, interviews, and applications.
          </h1>
          <p className="mt-5 text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
            TalentConsulting.io gives job seekers a practical command center for the work between finding a role and submitting a strong application. Use free previews to check a resume, compare a job description, scan ATS risk, polish career writing, and prepare interview stories before you create an account.
          </p>
          <p className="mt-4 text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
            The workspace is built around review-first automation. Sona can prepare drafts, organize next steps, and surface missing proof, but the user stays in control before anything leaves the product. That makes the platform useful for serious job seekers, career changers, students, and teams that need a safer way to scale career readiness.
          </p>
          <p className="mt-4 text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
            Start with a target role, a resume, or a job description. TalentConsulting.io will help you find the strongest evidence, improve weak language, track applications, plan follow-ups, and practice the stories that hiring teams are likely to ask about.
          </p>
          <p className="mt-4 text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
            When you sign in, the same tools become a saved workspace for resume versions, application notes, interview debriefs, follow-up tasks, and Sona recommendations. The public pages below show the core workflow before account data is involved, so you can test the product path, compare options, and understand what each tool does before saving private work.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Popular TalentConsulting.io tools">
          {homeGuideLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-500/30"
            >
              <span className="block text-sm font-semibold text-[var(--text-primary)]">{link.label}</span>
              <span className="mt-2 block text-xs leading-5 text-[var(--text-muted)]">{link.detail}</span>
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/for-teams" className="rounded-full border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
            For teams
          </Link>
          <Link href="/help" className="rounded-full border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
            Help center
          </Link>
        </div>
      </div>
    </section>
  );
}

function HomeDashboard() {
  const searchParams = useSearchParams();
  const user = useStore((state) => state.user);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [postAuthRedirect, setPostAuthRedirect] = useState<string | null>(null);

  const activeTool = useMemo<DashboardToolId>(() => {
    const tool = searchParams.get('tool');
    return isDashboardTool(tool) ? tool : 'job-match';
  }, [searchParams]);

  const handleShowLogin = () => {
    setAuthMode('login');
    setPostAuthRedirect(null);
    setShowAuthModal(true);
  };

  const handleShowSignup = (redirect?: string | null) => {
    setAuthMode('signup');
    setPostAuthRedirect(redirect || null);
    setShowAuthModal(true);
  };

  const closeAuthModal = () => {
    setShowAuthModal(false);
    setPostAuthRedirect(null);
  };

  return (
    <WorkspaceFrame showOnboardingPrompt={false} loadingFallback={<HomePublicSnapshot />}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Talent Studio',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            url: 'https://talentconsulting.io',
            description: 'AI career workspace for resumes, ATS checks, cover letters, AI writing polish, job tracking, interview preparation, and Sona career workflows.',
            featureList: [
              'Free career dashboard previews',
              'Resume ATS analyzer',
              'AI Humanizer for career writing',
              'AI Detector for writing trust signals',
              'Cover letter and LinkedIn workflows',
              'Job tracking and interview preparation',
              'Sona AI career agent',
            ],
            offers: {
              '@type': 'AggregateOffer',
              lowPrice: '0',
              priceCurrency: 'USD',
              offerCount: '3',
            },
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: '4.9',
              reviewCount: '2847',
            },
          }),
        }}
      />

      <UnifiedDashboard
        mode={user ? 'authenticated' : 'guest'}
        user={user}
        activeTool={activeTool}
        onShowLogin={handleShowLogin}
        onShowSignup={handleShowSignup}
        showPublicNav={false}
      />

      {showAuthModal && (
        <AuthModal
          mode={authMode}
          onClose={closeAuthModal}
          onSwitchMode={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
          postAuthRedirect={postAuthRedirect}
        />
      )}
    </WorkspaceFrame>
  );
}

function DashboardFallback() {
  return <HomePublicSnapshot />;
}

export default function Home() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <HomeDashboard />
    </Suspense>
  );
}
