'use client';

import { useStore } from '@/lib/store';
import type { TabType } from '@/types';

export default function Navigation() {
  const { currentTab, setCurrentTab } = useStore();

  const tabs: { id: TabType; label: string; icon: string; description: string }[] = [
    { id: 'detective', label: 'Resume', icon: 'description', description: 'Liquid Resume' },
    { id: 'copilot', label: 'JD Generator', icon: 'work', description: 'Job Descriptions' },
    { id: 'calibration', label: 'The Gauntlet', icon: '⚔️', description: 'Interview Simulator' },
    { id: 'analytics', label: 'Market Oracle', icon: '🔮', description: 'Career Intelligence' },
  ];

  return (
    <nav className="fixed top-[72px] left-0 right-0 z-40 elevation-card border-b border-[var(--border-subtle)] bg-[var(--card-bg)]">
      <div className="max-w-7xl mx-auto px-6 py-3">
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id)}
              className={`
                relative min-h-11 px-6 py-3 rounded-xl font-medium text-sm whitespace-nowrap transition-colors duration-150
                ${currentTab === tab.id
                  ? 'border border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                }
              `}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{tab.icon}</span>
                <div className="text-left">
                  <div className="font-semibold">{tab.label}</div>
                  <div className="text-xs text-[var(--text-muted)]">{tab.description}</div>
                </div>
              </div>

              {currentTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[var(--accent)]" />
              )}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
