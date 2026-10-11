'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import ApplicationKitContextBar from '@/components/ApplicationKitContextBar';
import { SuiteToolHeader, SuiteToolShell } from '@/components/suite/SuiteToolChrome';
import { useApplicationKitContext } from '@/hooks/useApplicationKitContext';

type ATSTab = 'preview' | 'score';

export default function ATSAnalyzerPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<ATSTab>('preview');
  const { context: kitContext, updateContext } = useApplicationKitContext();

  /* `tab` as well as `mobileTab`. The landing page's Job Match card links here
     and needs the Match Score tab, which is the guest-usable one:
     /api/resume/ats-score is allowAnonymous and ATSScorePanel wires useAuthGate.
     `mobileTab` is kept because MobileQuickToolsRail already emits it, but it is
     the wrong name for a link a desktop visitor follows. */
  useEffect(() => {
    const requestedTab = searchParams.get('tab') || searchParams.get('mobileTab');
    if (requestedTab === 'score' || requestedTab === 'preview') setActiveTab(requestedTab);
  }, [searchParams]);

  return (
    <SuiteToolShell variant="standard">
      <SuiteToolHeader tool="ats-analyzer">
        <div className="flex gap-1 p-1 rounded-xl w-fit bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          {([
            { key: 'preview' as ATSTab, label: 'ATS Preview', icon: 'scanner', desc: 'See what recruiters see' },
            { key: 'score' as ATSTab, label: 'Match Score', icon: 'analytics', desc: 'Keyword gap analysis' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex min-h-[44px] items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'border border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
                  : 'border border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              <span className="material-symbols-rounded text-[18px]">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </SuiteToolHeader>

      <ApplicationKitContextBar
        context={kitContext}
        activeTool="ats"
        onChange={updateContext}
      />

      {/* Tab content — lazy loaded */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activeTab === 'preview' ? <ATSPreviewTab /> : <ATSScoreTab />}
      </motion.div>
    </SuiteToolShell>
  );
}

// ─── Lazy wrappers ───
// These dynamically import the existing page content as embedded components
import dynamic from 'next/dynamic';

const ATSPreviewTab = dynamic(() => import('./preview-tab'), {
  loading: () => <div className="h-64 rounded-xl animate-pulse bg-[var(--bg-surface)] border border-[var(--border-subtle)]" />,
});

const ATSScoreTab = dynamic(() => import('./score-tab'), {
  loading: () => <div className="h-64 rounded-xl animate-pulse bg-[var(--bg-surface)] border border-[var(--border-subtle)]" />,
});
