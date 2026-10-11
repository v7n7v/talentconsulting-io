'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { TalentConsultingMark, TalentConsultingWordmark } from '@/components/BrandLogo';

interface SuiteSelectorProps {
  fullPage?: boolean;
  showBrandHeader?: boolean;
  onSelect?: () => void;
}

export default function SuiteSelector({ fullPage = false, showBrandHeader = true, onSelect }: SuiteSelectorProps) {
  const router = useRouter();
  const { user } = useStore();

  const suite = {
    id: 'talent',
    name: 'Talent Suite',
    tagline: 'AI Career Intelligence',
    description: 'Build stunning resumes, generate JDs, study with flash cards, and explore market opportunities',
    icon: 'auto_awesome',
    path: '/suite/resume',
    features: [
      { icon: 'description', name: 'Resume Builder', desc: 'Liquid Resume' },
      { icon: 'work', name: 'JD Generator', desc: 'Mission Blueprint' },
      { icon: '⚔️', name: 'The Gauntlet', desc: 'Interview Simulator' },
      { icon: '🌉', name: 'Skill Bridge', desc: 'From Resume to Ready' },
    ],
  };

  const handleSelect = () => {
    router.push(suite.path);
    onSelect?.();
  };

  if (!fullPage) {
    return (
      <div className="flex gap-2 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
        <button
          onClick={handleSelect}
          className="btn-primary flex min-h-11 items-center gap-2 px-4 py-2 text-sm"
        >
          <TalentConsultingMark className="h-5 w-5 rounded-md" />
          <span className="hidden md:inline">Talent Suite</span>
        </button>
      </div>
    );
  }

  return (
    <div className={showBrandHeader ? "p-6 lg:p-8 pb-8" : "px-6 lg:px-8 pb-8 pt-0"}>
      {showBrandHeader && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="inline-flex items-center gap-3 mb-6"
          >
            <TalentConsultingMark className="h-12 w-12 rounded-2xl border border-[var(--border-subtle)]" />
            <TalentConsultingWordmark className="w-[min(360px,72vw)]" />
          </motion.div>
          <p className="text-xl text-[var(--text-secondary)] max-w-2xl mx-auto">
            Your AI-powered career intelligence platform. Build, prepare, and launch your next opportunity.
          </p>
        </motion.div>
      )}

      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          className="group relative"
        >
          <motion.button
            onClick={handleSelect}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="elevation-interactive relative w-full h-full text-left overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--card-bg)] hover:border-[var(--border-hover)] transition-colors duration-300 flex flex-col"
          >
            <div className="relative p-8 flex-1 flex flex-col">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <motion.span
                    initial={{ scale: 1 }}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    className="text-6xl block mb-4"
                  >
                    {suite.icon}
                  </motion.span>
                  <h2 className="text-3xl font-bold text-[var(--text-primary)] mb-1">{suite.name}</h2>
                  <p className="text-sm font-medium text-[var(--accent)]">
                    {suite.tagline}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-[var(--accent-dim)] border border-[var(--border-subtle)] flex items-center justify-center opacity-70 group-hover:opacity-100 transition-opacity">
                  <svg className="w-6 h-6 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
              </div>

              <p className="text-[var(--text-secondary)] mb-8">{suite.description}</p>

              <div className="grid grid-cols-2 gap-3 mb-8 flex-1">
                {suite.features.map((feature) => (
                  <div
                    key={feature.name}
                    className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <span className="text-xl">{feature.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">{feature.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end pt-6 border-t border-[var(--border-subtle)] mt-auto">
                <div className="btn-primary flex min-h-11 items-center px-6 py-3 font-semibold">
                  Enter Suite →
                </div>
              </div>
            </div>
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
