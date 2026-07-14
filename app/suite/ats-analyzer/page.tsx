'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useTheme } from '@/components/ThemeProvider';
import ApplicationKitContextBar from '@/components/ApplicationKitContextBar';
import { SuiteToolHeader, SuiteToolShell } from '@/components/suite/SuiteToolChrome';
import { useApplicationKitContext } from '@/hooks/useApplicationKitContext';

type ATSTab = 'preview' | 'score';

export default function ATSAnalyzerPage() {
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [activeTab, setActiveTab] = useState<ATSTab>('preview');
  const { context: kitContext, updateContext } = useApplicationKitContext();

  useEffect(() => {
    const requestedTab = searchParams.get('mobileTab');
    if (requestedTab === 'score' || requestedTab === 'preview') setActiveTab(requestedTab);
  }, [searchParams]);

  return (
    <SuiteToolShell variant="standard">
      <SuiteToolHeader tool="ats-analyzer">
        <div className="flex gap-1 p-1 rounded-xl w-fit" style={{
          background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}`,
        }}>
          {([
            { key: 'preview' as ATSTab, label: 'ATS Preview', icon: 'scanner', desc: 'See what recruiters see' },
            { key: 'score' as ATSTab, label: 'Match Score', icon: 'analytics', desc: 'Keyword gap analysis' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
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
  loading: () => <div className="h-64 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} />,
});

const ATSScoreTab = dynamic(() => import('./score-tab'), {
  loading: () => <div className="h-64 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} />,
});
