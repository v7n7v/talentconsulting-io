'use client';

import { motion, AnimatePresence } from 'framer-motion';

interface SkillGapWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  newSkills: { skill: string; category: 'technical' | 'soft' | 'domain' }[];
  matchScore?: number;
}

export default function SkillGapWarningModal({ isOpen, onClose, newSkills, matchScore }: SkillGapWarningModalProps) {
  const handleBridgeGap = () => {
    // Open Skill Bridge in a NEW TAB so morphing progress is preserved
    window.open('/suite/skill-bridge', '_blank');
    onClose();
  };

  if (newSkills.length === 0) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 backdrop-blur-sm z-[100]"
            style={{ background: 'var(--modal-backdrop)' }}
            onClick={onClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="relative w-full max-w-md rounded-2xl overflow-hidden elevation-raised"
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border-subtle)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="relative px-6 pt-6 pb-4">
                <div className="relative flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                    style={{ background: 'color-mix(in srgb, var(--warning) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 24%, transparent)' }}
                  >
                    🌉
                  </div>
                  <div>
                    <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                      New Skills Detected
                    </h3>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Your morphed resume includes {newSkills.length} skill{newSkills.length > 1 ? 's' : ''} you haven't listed before
                    </p>
                  </div>
                </div>
              </div>

              {/* Score bar — guarded with != null so a real measured 0 is shown, not dropped as falsy */}
              {matchScore != null && (
                <div
                  className="mx-6 mb-3 flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{ background: 'color-mix(in srgb, var(--success) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--success) 24%, transparent)' }}
                >
                  <span className="material-symbols-rounded text-sm icon-status-success">check_circle</span>
                  <span className="text-xs font-medium" style={{ color: 'var(--success)' }}>
                    Resume match score: {matchScore}%
                  </span>
                </div>
              )}

              {/* Skills list */}
              <div className="px-6 pb-4">
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {newSkills.map((s, i) => (
                    <motion.div
                      key={s.skill}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                      style={{ background: 'color-mix(in srgb, var(--warning) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 16%, transparent)' }}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="material-symbols-rounded text-sm icon-status-warning">
                          {s.category === 'technical' ? 'computer' : s.category === 'soft' ? 'handshake' : 'domain'}
                        </span>
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {s.skill}
                        </span>
                      </div>
                      <span
                        className="inline-flex items-center gap-0.5 text-[11px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: 'color-mix(in srgb, var(--warning) 12%, transparent)', color: 'var(--warning)', border: '1px solid color-mix(in srgb, var(--warning) 24%, transparent)' }}
                      >
                        <span className="material-symbols-rounded align-middle text-[12px]">warning</span>AI-Added
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Message */}
              <div
                className="mx-6 mb-5 p-3 rounded-xl text-xs leading-relaxed"
                style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
              >
                <strong><span className="material-symbols-rounded align-middle mr-1 text-sm" style={{ color: 'var(--accent)' }}>lightbulb</span>Pro Tip:</strong> These skills strengthen your resume match, but you should learn the basics before your interview. Skill Bridge creates a <strong>7-day crash course</strong> to get you ready.
              </div>

              {/* Actions */}
              <div className="px-6 pb-6 flex gap-2.5">
                <button
                  onClick={handleBridgeGap}
                  className="flex-1 min-h-[44px] py-2.5 rounded-xl text-sm font-semibold transition-all btn-primary"
                >
                  🌉 Bridge the Gap
                </button>
                <button
                  onClick={onClose}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-medium transition-colors btn-secondary"
                >
                  Got it
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
