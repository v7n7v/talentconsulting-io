'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';

/**
 * Suite-level error boundary — catches crashes in any tool page
 * without losing the sidebar/navigation. Users stay oriented
 * and can recover with a single click.
 */
export default function SuiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Suite Error Boundary]', error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="text-center max-w-md"
      >
        {/* Error icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
          className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center"
          style={{
            background: 'rgba(242, 139, 130, 0.08)',
            border: '1px solid rgba(242, 139, 130, 0.2)',
          }}
        >
          <span className="material-symbols-rounded text-4xl" style={{ color: 'var(--danger)' }}>
            error_outline
          </span>
        </motion.div>

        <h2 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          Something broke
        </h2>

        <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          This tool encountered an unexpected error. Your data is safe — the issue has been logged.
        </p>

        {error.digest && (
          <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
            Reference: {error.digest}
          </p>
        )}

        <div className="flex gap-3 justify-center mt-6">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={reset}
            className="px-6 py-3 rounded-xl font-semibold text-sm transition-all"
            style={{
              background: 'linear-gradient(135deg, var(--accent), var(--accent-active))',
              color: 'var(--accent-on)',
              boxShadow: '0 2px 12px rgba(168, 199, 250, 0.15)',
            }}
          >
            <span className="flex items-center gap-2">
              <span className="material-symbols-rounded text-lg">refresh</span>
              Try Again
            </span>
          </motion.button>

          <motion.a
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            href="/suite"
            className="px-6 py-3 rounded-xl font-medium text-sm transition-all"
            style={{
              background: 'var(--accent-dim)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <span className="flex items-center gap-2">
              <span className="material-symbols-rounded text-lg">dashboard</span>
              Dashboard
            </span>
          </motion.a>
        </div>

        {/* Decorative pulse ring */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(242, 139, 130, 0.04) 0%, transparent 70%)',
            }}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}
