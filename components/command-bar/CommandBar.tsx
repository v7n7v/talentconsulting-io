'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname, useRouter } from 'next/navigation';

interface Module {
  id: string;
  name: string;
  icon: string;
  path: string;
  description: string;
}

const modules: Module[] = [
  {
    id: 'resume',
    name: 'Resume',
    icon: 'description',
    path: '/suite/resume',
    description: 'Liquid Resume Builder',
  },
  {
    id: 'interview-studio',
    name: 'Interview Studio',
    icon: 'interpreter_mode',
    path: '/suite/interview-sim',
    description: 'Practice + Debrief',
  },
  {
    id: 'oracle',
    name: 'Oracle',
    icon: '🔮',
    path: '/suite/market-oracle',
    description: 'JD Decoder + Career Intel',
  },
];

export default function CommandBar() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const currentModule = modules.find(m => pathname?.startsWith(m.path)) || modules[0];

  const handleModuleClick = (module: Module) => {
    router.push(module.path);
    setIsExpanded(false);
  };

  // Keyboard shortcut handler
  useState(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowPalette(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <>
      {/* Command Bar */}
      <motion.div
        className="fixed bottom-6 left-1/2 z-50"
        style={{ x: '-50%' }}
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 20 }}
      >
        <div className="elevation-raised rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 py-3">
          <div className="flex items-center gap-2">
            {/* Current Module */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex min-h-11 items-center gap-3 px-4 py-2 rounded-xl transition-colors hover:bg-[var(--bg-hover)]"
            >
              <span className="text-2xl">{currentModule.icon}</span>
              <div className="text-left">
                <div className="text-sm font-semibold text-[var(--text-primary)]">{currentModule.name}</div>
                <div className="text-xs text-[var(--text-muted)]">{currentModule.description}</div>
              </div>
              <svg
                className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
              </svg>
            </button>

            <div className="w-px h-8 bg-[var(--border-subtle)]" />

            {/* Quick Actions */}
            <button
              onClick={() => setShowPalette(true)}
              className="group flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 transition-colors hover:bg-[var(--bg-hover)]"
              title="Command Palette (Cmd+K)"
            >
              <svg className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
            </button>
          </div>

          {/* Expanded Module List */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="pt-3 mt-3 border-t border-[var(--border-subtle)] grid grid-cols-2 gap-2">
                  {modules.map((module) => (
                    <button
                      key={module.id}
                      onClick={() => handleModuleClick(module)}
                      className={`min-h-11 p-3 rounded-xl text-left transition-colors ${
                        currentModule.id === module.id
                          ? 'bg-[var(--accent-dim)] border border-[var(--accent)]'
                          : 'border border-transparent hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{module.icon}</span>
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-[var(--text-primary)]">{module.name}</div>
                          <div className="text-xs text-[var(--text-muted)]">{module.description}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Command Palette */}
      <AnimatePresence>
        {showPalette && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-start justify-center bg-[color-mix(in_srgb,var(--bg-deep)_82%,transparent)] backdrop-blur-sm pt-32"
            onClick={() => setShowPalette(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: -20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: -20 }}
              className="elevation-raised mx-4 w-full max-w-2xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <svg className="w-5 h-5 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                <input
                  type="text"
                  placeholder="Search modules..."
                  className="min-h-11 flex-1 border-none bg-transparent text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                  autoFocus
                />
                <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text-muted)]">ESC</kbd>
              </div>

              <div className="space-y-1">
                {modules.map((module) => (
                  <button
                    key={module.id}
                    onClick={() => {
                      handleModuleClick(module);
                      setShowPalette(false);
                    }}
                    className="group w-full min-h-11 p-4 rounded-xl text-left transition-colors hover:bg-[var(--bg-hover)]"
                  >
                    <div className="flex items-center gap-4">
                      <span className="icon-shell-neutral inline-grid h-12 w-12 shrink-0 place-items-center rounded-xl border text-2xl">
                        {module.icon}
                      </span>
                      <div className="flex-1">
                        <div className="font-semibold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]">
                          {module.name}
                        </div>
                        <div className="text-sm text-[var(--text-muted)]">{module.description}</div>
                      </div>
                      <svg className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                      </svg>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-muted)]">
                <div>Press <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5"><span className="material-symbols-rounded align-middle mr-1">keyboard_command_key</span>K</kbd> to open</div>
                <div>Navigate with <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5">↑↓</kbd></div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
