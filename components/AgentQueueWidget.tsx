'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '@/lib/store';
import { getAgentQueue, type AgentQueueItem } from '@/lib/database-suite';
import Link from 'next/link';

function scoreColor(s: number) {
  return s >= 80 ? '#10b981' : s >= 60 ? '#3b82f6' : '#f59e0b';
}

export default function AgentQueueWidget() {
  const user = useStore((s) => s.user);
  const [items, setItems] = useState<AgentQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!user || fetchedRef.current) return;
    fetchedRef.current = true;

    getAgentQueue('pending')
      .then(res => {
        if (res.success && res.data && res.data.length > 0) {
          setItems(res.data.slice(0, 3));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  if (!user || loading || items.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="mb-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center">
            <span className="material-symbols-rounded text-white text-[13px]">smart_toy</span>
          </div>
          <h2 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
            Agent Queue
          </h2>
          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-cyan-500/10 text-cyan-500">
            {items.length} pending
          </span>
        </div>
        <Link
          href="/suite/agent/queue"
          className="text-[11px] font-medium text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1"
        >
          Review all
          <span className="material-symbols-rounded text-[13px]">arrow_forward</span>
        </Link>
      </div>

      {/* Item cards */}
      <div className="space-y-2">
        {items.map((item, i) => (
          <Link key={item.id || `agent-queue-item-${i}`} href="/suite/agent/queue">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
              className="flex items-center gap-3 p-3 rounded-xl border transition-all hover:shadow-md cursor-pointer group"
              style={{
                background: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 border"
                style={{
                  background: `${scoreColor(item.match_score)}10`,
                  borderColor: `${scoreColor(item.match_score)}25`,
                  color: scoreColor(item.match_score),
                }}
              >
                {item.match_score}%
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-[var(--text-primary)] truncate">
                  {item.company}
                </p>
                <p className="text-[11px] text-[var(--text-muted)] truncate">
                  {item.job_title}
                </p>
              </div>
              <span className="material-symbols-rounded text-[14px] text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity">
                chevron_right
              </span>
            </motion.div>
          </Link>
        ))}
      </div>
    </motion.div>
  );
}
