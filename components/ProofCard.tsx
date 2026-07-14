'use client';

import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import type { ProofResult } from '@/lib/tfidf-proof';

interface ProofCardProps {
  proof: ProofResult;
  isLight: boolean;
}

const VERDICT = (score: number) =>
  score >= 80 ? { label: 'Excellent', color: '#22c55e' }
  : score >= 60 ? { label: 'Strong', color: '#06d6a0' }
  : score >= 40 ? { label: 'Moderate', color: '#f59e0b' }
  : { label: 'Needs Work', color: '#ef4444' };

export default function ProofCard({ proof, isLight }: ProofCardProps) {
  const baseVerdict = VERDICT(proof.baselineScore);
  const optVerdict = VERDICT(proof.optimizedScore);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-2xl overflow-hidden"
      style={{
        background: isLight ? '#fff' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{
          background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
          borderBottom: `1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}`,
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="icon-shell-neutral w-8 h-8 rounded-lg border flex items-center justify-center">
            <span className="material-symbols-rounded text-[18px]">science</span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">ATS Proof Engine</h3>
            <p className="text-[10px] text-[var(--text-muted)]">TF-IDF Cosine Similarity Analysis</p>
          </div>
        </div>

        {/* Delta Badge */}
        {proof.delta > 0 && (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.6, type: 'spring' }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{
              background: 'rgba(6,214,160,0.1)',
              border: '1px solid rgba(6,214,160,0.2)',
            }}
          >
            <span className="material-symbols-rounded icon-status-success text-[14px]">trending_up</span>
            <span className="text-xs font-bold text-emerald-400">+{proof.delta} pts</span>
          </motion.div>
        )}
      </div>

      <div className="p-5 space-y-5">
        {/* Score Comparison */}
        <div className="grid grid-cols-2 gap-4">
          {/* Baseline */}
          <div className="text-center p-4 rounded-xl" style={{
            background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'}`,
          }}>
            <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-2">Original Resume</p>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-3xl font-bold"
              style={{ color: baseVerdict.color }}
            >
              {proof.baselineScore}
            </motion.div>
            <p className="text-[10px] font-medium mt-1" style={{ color: baseVerdict.color }}>{baseVerdict.label}</p>
          </div>

          {/* Optimized */}
          <div className="text-center p-4 rounded-xl" style={{
            background: `${optVerdict.color}08`,
            border: `1px solid ${optVerdict.color}20`,
          }}>
            <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-2">Morphed Resume</p>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-3xl font-bold"
              style={{ color: optVerdict.color }}
            >
              {proof.optimizedScore}
            </motion.div>
            <p className="text-[10px] font-medium mt-1" style={{ color: optVerdict.color }}>{optVerdict.label}</p>
          </div>
        </div>

        {/* Improvement Statement */}
        <div className="text-center">
          <p className="text-xs text-[var(--text-secondary)]">
            TF-IDF cosine similarity improved by{' '}
            <span className="font-bold text-emerald-400">{proof.improvement}</span>
          </p>
        </div>

        {/* Bar Chart */}
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={proof.chartData} layout="vertical" barGap={4}>
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: isLight ? '#fff' : '#1a1a1e',
                  border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 12,
                  fontSize: 11,
                }}
              />
              <Bar dataKey="baseline" name="Original" radius={[0, 4, 4, 0]} barSize={12}>
                {proof.chartData.map((_, i) => (
                  <Cell key={i} fill={isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'} />
                ))}
              </Bar>
              <Bar dataKey="optimized" name="Morphed" radius={[0, 4, 4, 0]} barSize={12}>
                {proof.chartData.map((_, i) => (
                  <Cell key={i} fill="#06d6a0" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 text-[10px] text-[var(--text-muted)]">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm" style={{ background: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)' }} />
            Original
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm bg-emerald-400" />
            Morphed
          </span>
        </div>

        {/* Gaps Closed */}
        {proof.gapsClosed.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-1.5">
              <span className="material-symbols-rounded icon-status-success text-[14px]">check_circle</span>
              Skills Gap Closed ({proof.gapsClosed.length})
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {proof.gapsClosed.slice(0, 10).map((gap, i) => (
                <motion.span
                  key={gap.term}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.7 + i * 0.05 }}
                  className="text-[10px] px-2 py-1 rounded-full font-medium"
                  style={{
                    background: 'rgba(6,214,160,0.1)',
                    border: '1px solid rgba(6,214,160,0.2)',
                    color: '#06d6a0',
                  }}
                >
                  + {gap.term}
                </motion.span>
              ))}
            </div>
          </div>
        )}

        {/* Top JD Terms */}
        {proof.topJDTerms.length > 0 && (
          <details className="group">
            <summary className="text-[11px] font-medium text-[var(--text-secondary)] cursor-pointer flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors">
              <span className="material-symbols-rounded text-[14px] group-open:rotate-90 transition-transform">chevron_right</span>
              Top JD Terms Analysis ({proof.topJDTerms.length})
            </summary>
            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
              {proof.topJDTerms.map(term => (
                <div key={term.term} className="flex items-center justify-between px-2 py-1 rounded-lg text-[10px]" style={{
                  background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
                }}>
                  <span className="text-[var(--text-primary)] font-mono">{term.term}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-muted)]">w: {term.weight}</span>
                    <span className={`font-medium ${
                      term.matchedIn === 'both' ? 'text-emerald-400' :
                      term.matchedIn === 'morphed_only' ? 'text-cyan-400' :
                      term.matchedIn === 'original_only' ? 'text-amber-400' :
                      'text-red-400'
                    }`}>
                      {term.matchedIn === 'both' ? '✓ Both' :
                       term.matchedIn === 'morphed_only' ? '+ Added' :
                       term.matchedIn === 'original_only' ? '○ Original' :
                       '✗ Missing'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Footer */}
        <p className="text-[9px] text-[var(--text-muted)] text-center pt-2" style={{
          borderTop: `1px solid ${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'}`,
        }}>
          Deterministic scoring via TF-IDF vectorization · Not AI-generated · Reproducible results
        </p>
      </div>
    </motion.div>
  );
}
