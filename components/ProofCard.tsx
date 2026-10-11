'use client';

import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import type { ProofResult } from '@/lib/tfidf-proof';

interface ProofCardProps {
  proof: ProofResult;
  // Retained for API compatibility. Colour now flows from the [data-theme]
  // token cascade, so this is no longer read for styling.
  isLight?: boolean;
}

// Verdict bands map onto the shared status tokens — success (positive),
// warning (caution), danger (weak) — kept distinct from the blue accent so
// hue still carries evidence meaning. Labels/thresholds are unchanged.
const VERDICT = (score: number) =>
  score >= 80 ? { label: 'Excellent', color: 'var(--success)' }
  : score >= 60 ? { label: 'Strong', color: 'var(--success)' }
  : score >= 40 ? { label: 'Moderate', color: 'var(--warning)' }
  : { label: 'Needs Work', color: 'var(--danger)' };

export default function ProofCard({ proof }: ProofCardProps) {
  const baseVerdict = VERDICT(proof.baselineScore);
  const optVerdict = VERDICT(proof.optimizedScore);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-2xl overflow-hidden elevation-card"
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="icon-shell-neutral w-8 h-8 rounded-lg border flex items-center justify-center">
            <span className="material-symbols-rounded text-[18px]">science</span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">ATS Proof Engine</h3>
            <p className="text-[11px] text-[var(--text-muted)]">TF-IDF Cosine Similarity Analysis</p>
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
              background: 'color-mix(in srgb, var(--success) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--success) 26%, transparent)',
            }}
          >
            <span className="material-symbols-rounded icon-status-success text-[14px]">trending_up</span>
            <span className="text-xs font-bold text-[var(--success)]">+{proof.delta} pts</span>
          </motion.div>
        )}
      </div>

      <div className="p-5 space-y-5">
        {/* Score Comparison */}
        <div className="grid grid-cols-2 gap-4">
          {/* Baseline */}
          <div className="text-center p-4 rounded-xl" style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
          }}>
            <p className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] mb-2">Original Resume</p>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-3xl font-bold"
              style={{ color: baseVerdict.color }}
            >
              {proof.baselineScore}
            </motion.div>
            <p className="text-[11px] font-medium mt-1" style={{ color: baseVerdict.color }}>{baseVerdict.label}</p>
          </div>

          {/* Optimized */}
          <div className="text-center p-4 rounded-xl" style={{
            background: `color-mix(in srgb, ${optVerdict.color} 8%, transparent)`,
            border: `1px solid color-mix(in srgb, ${optVerdict.color} 22%, transparent)`,
          }}>
            <p className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] mb-2">Morphed Resume</p>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-3xl font-bold"
              style={{ color: optVerdict.color }}
            >
              {proof.optimizedScore}
            </motion.div>
            <p className="text-[11px] font-medium mt-1" style={{ color: optVerdict.color }}>{optVerdict.label}</p>
          </div>
        </div>

        {/* Improvement Statement */}
        <div className="text-center">
          <p className="text-xs text-[var(--text-secondary)]">
            TF-IDF cosine similarity improved by{' '}
            <span className="font-bold text-[var(--success)]">{proof.improvement}</span>
          </p>
        </div>

        {/* Bar Chart */}
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={proof.chartData} layout="vertical" barGap={4}>
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 12,
                  fontSize: 11,
                  color: 'var(--text-primary)',
                }}
              />
              <Bar dataKey="baseline" name="Original" radius={[0, 4, 4, 0]} barSize={12}>
                {proof.chartData.map((_, i) => (
                  <Cell key={i} fill="color-mix(in srgb, var(--text-primary) 18%, transparent)" />
                ))}
              </Bar>
              <Bar dataKey="optimized" name="Morphed" radius={[0, 4, 4, 0]} barSize={12}>
                {proof.chartData.map((_, i) => (
                  <Cell key={i} fill="var(--success)" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 text-[11px] text-[var(--text-muted)]">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm" style={{ background: 'color-mix(in srgb, var(--text-primary) 18%, transparent)' }} />
            Original
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm" style={{ background: 'var(--success)' }} />
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
                  className="text-[11px] px-2 py-1 rounded-full font-medium text-[var(--success)]"
                  style={{
                    background: 'color-mix(in srgb, var(--success) 12%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--success) 26%, transparent)',
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
                <div key={term.term} className="flex items-center justify-between px-2 py-1 rounded-lg text-[11px]" style={{
                  background: 'var(--bg-surface)',
                }}>
                  <span className="text-[var(--text-primary)] font-mono">{term.term}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-muted)]">w: {term.weight}</span>
                    <span className={`font-medium ${
                      term.matchedIn === 'both' ? 'text-[var(--success)]' :
                      term.matchedIn === 'morphed_only' ? 'text-[var(--success)]' :
                      term.matchedIn === 'original_only' ? 'text-[var(--warning)]' :
                      'text-[var(--danger)]'
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
        <p className="text-[11px] text-[var(--text-muted)] text-center pt-2" style={{
          borderTop: '1px solid var(--border-subtle)',
        }}>
          Deterministic scoring via TF-IDF vectorization · Not AI-generated · Reproducible results
        </p>
      </div>
    </motion.div>
  );
}
