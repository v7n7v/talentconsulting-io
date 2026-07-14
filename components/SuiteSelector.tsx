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
    gradient: 'from-[#0070F3] via-[#0070F3]/80 to-[#0070F3]/60',
    buttonStyle: 'bg-[#0070F3] text-white',
    taglineColor: 'text-[#0070F3]',
    statColor: 'text-[#0070F3]',
    path: '/suite/resume',
    features: [
      { icon: 'description', name: 'Resume Builder', desc: 'Liquid Resume' },
      { icon: 'work', name: 'JD Generator', desc: 'Mission Blueprint' },
      { icon: '⚔️', name: 'The Gauntlet', desc: 'Interview Simulator' },
      { icon: '🌉', name: 'Skill Bridge', desc: 'From Resume to Ready' },
    ],
    stats: { label: 'Careers Launched', value: '890+' },
  };

  const handleSelect = () => {
    router.push(suite.path);
    onSelect?.();
  };

  if (!fullPage) {
    return (
      <div className="flex gap-2 p-1 rounded-xl bg-white/5 border border-white/10">
        <button
          onClick={handleSelect}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all bg-gradient-to-r ${suite.gradient} text-white shadow-lg`}
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
            <TalentConsultingMark className="h-12 w-12 rounded-2xl border border-cyan-400/15 shadow-lg shadow-cyan-500/20" />
            <TalentConsultingWordmark className="w-[min(360px,72vw)]" />
          </motion.div>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
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
          <div
            className={`absolute inset-0 bg-gradient-to-br ${suite.gradient} opacity-0 group-hover:opacity-10 blur-3xl transition-opacity duration-500 rounded-3xl`}
          />
          <motion.button
            onClick={handleSelect}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="relative w-full h-full text-left overflow-hidden rounded-3xl border border-white/10 glass-card hover:border-[var(--theme-border-hover)] transition-all duration-300 flex flex-col"
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

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
                  <h2 className="text-3xl font-bold text-white mb-1">{suite.name}</h2>
                  <p className={`text-sm font-medium ${suite.taglineColor}`}>
                    {suite.tagline}
                  </p>
                </div>
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${suite.gradient} flex items-center justify-center opacity-50 group-hover:opacity-100 transition-opacity`}>
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
              </div>

              <p className="text-slate-400 mb-8">{suite.description}</p>

              <div className="grid grid-cols-2 gap-3 mb-8 flex-1">
                {suite.features.map((feature) => (
                  <div
                    key={feature.name}
                    className="flex items-center gap-3 p-3 rounded-xl bg-[var(--theme-bg-elevated)] border border-white/10 hover:bg-[var(--theme-bg-hover)] transition-colors"
                  >
                    <span className="text-xl">{feature.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-white">{feature.name}</p>
                      <p className="text-xs text-silver">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-6 border-t border-white/10 mt-auto">
                <div>
                  <p className="text-xs text-silver uppercase tracking-wider">{suite.stats.label}</p>
                  <p className={`text-2xl font-bold ${suite.statColor}`}>
                    {suite.stats.value}
                  </p>
                </div>
                <div className={`px-6 py-3 rounded-xl ${suite.buttonStyle} font-semibold opacity-90 group-hover:opacity-100 transition-opacity`}>
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
