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
  color: string;
}

const modules: Module[] = [
  {
    id: 'resume',
    name: 'Resume',
    icon: 'description',
    path: '/suite/resume',
    description: 'Liquid Resume Builder',
    color: '#ffffff',
  },
  {
    id: 'interview-studio',
    name: 'Interview Studio',
    icon: 'interpreter_mode',
    path: '/suite/interview-sim',
    description: 'Practice + Debrief',
    color: '#06b6d4',
  },
  {
    id: 'oracle',
    name: 'Oracle',
    icon: '🔮',
    path: '/suite/market-oracle',
    description: 'JD Decoder + Career Intel',
    color: '#00ff88',
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
        <div className="glass-card px-4 py-3 bg-black/40 border-white/10"
             style={{
               backdropFilter: 'blur(40px)',
               WebkitBackdropFilter: 'blur(40px)',
             }}
        >
          <div className="flex items-center gap-2">
            {/* Current Module */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-3 px-4 py-2 rounded-xl hover:bg-white/5 transition-colors"
            >
              <span className="text-2xl">{currentModule.icon}</span>
              <div className="text-left">
                <div className="text-sm font-semibold text-white">{currentModule.name}</div>
                <div className="text-xs text-slate-500">{currentModule.description}</div>
              </div>
              <svg
                className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
              </svg>
            </button>

            <div className="w-px h-8 bg-white/10" />

            {/* Quick Actions */}
            <button
              onClick={() => setShowPalette(true)}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors group"
              title="Command Palette (Cmd+K)"
            >
              <svg className="w-5 h-5 text-slate-400 group-hover:text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                <div className="pt-3 mt-3 border-t border-white/10 grid grid-cols-2 gap-2">
                  {modules.map((module) => (
                    <button
                      key={module.id}
                      onClick={() => handleModuleClick(module)}
                      className={`p-3 rounded-xl text-left transition-all ${
                        currentModule.id === module.id
                          ? 'bg-cyan-500/10 border border-cyan-500/30'
                          : 'hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{module.icon}</span>
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-white">{module.name}</div>
                          <div className="text-xs text-slate-500">{module.description}</div>
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
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-start justify-center pt-32"
            onClick={() => setShowPalette(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: -20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: -20 }}
              className="glass-card p-6 w-full max-w-2xl mx-4 bg-black/60"
              style={{
                backdropFilter: 'blur(40px)',
                WebkitBackdropFilter: 'blur(40px)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                <input
                  type="text"
                  placeholder="Search modules..."
                  className="flex-1 bg-transparent border-none outline-none text-white placeholder-slate-500"
                  autoFocus
                />
                <kbd className="px-2 py-1 text-xs rounded bg-white/10 text-slate-400">ESC</kbd>
              </div>

              <div className="space-y-1">
                {modules.map((module) => (
                  <button
                    key={module.id}
                    onClick={() => {
                      handleModuleClick(module);
                      setShowPalette(false);
                    }}
                    className="w-full p-4 rounded-xl hover:bg-white/5 transition-colors text-left group"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                        style={{ background: `${module.color}20`, border: `1px solid ${module.color}40` }}
                      >
                        {module.icon}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-white group-hover:text-cyan-400 transition-colors">
                          {module.name}
                        </div>
                        <div className="text-sm text-slate-400">{module.description}</div>
                      </div>
                      <svg className="w-5 h-5 text-slate-600 group-hover:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                      </svg>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-slate-500">
                <div>Press <kbd className="px-1.5 py-0.5 rounded bg-white/10"><span className="material-symbols-rounded align-middle mr-1">keyboard_command_key</span>K</kbd> to open</div>
                <div>Navigate with <kbd className="px-1.5 py-0.5 rounded bg-white/10">↑↓</kbd></div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
