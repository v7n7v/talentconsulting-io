'use client';

import { motion, AnimatePresence } from 'framer-motion';

interface LogoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function LogoutModal({ isOpen, onClose, onConfirm }: LogoutModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="w-full max-w-xs rounded-2xl overflow-hidden shadow-xl"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {/* Content */}
              <div className="p-6 text-center">
                {/* Icon */}
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mx-auto mb-4"
                  style={{ background: 'rgba(239,68,68,0.1)' }}
                >
                  <span className="material-symbols-rounded icon-status-danger text-[22px]">logout</span>
                </div>

                <h2 className="text-base font-bold text-[var(--text-primary)] mb-1.5">
                  Sign out?
                </h2>
                <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
                  You'll need to sign back in to access your suite.
                </p>

                <div className="flex gap-2.5">
                  <button
                    onClick={onClose}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ border: '1px solid var(--border-subtle)' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onConfirm}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
