'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Shortcut {
    keys: string[];
    description: string;
    category: string;
}

const shortcuts: Shortcut[] = [
    // Navigation
    { keys: ['keyboard_command_key', 'K'], description: 'Open Quick Jump', category: 'Navigation' },
    { keys: ['?'], description: 'Show this help', category: 'Navigation' },
    { keys: ['Esc'], description: 'Close modal / Cancel', category: 'Navigation' },

    // Actions
    { keys: ['keyboard_command_key', 'S'], description: 'Save current work', category: 'Actions' },
    { keys: ['keyboard_command_key', 'Enter'], description: 'Submit / Confirm', category: 'Actions' },

    // Talent Suite
    { keys: ['G', 'R'], description: 'Go to Resume Builder', category: 'Quick Navigation' },
    { keys: ['G', 'J'], description: 'Go to JD Generator', category: 'Quick Navigation' },
    { keys: ['G', 'O'], description: 'Go to Market Oracle', category: 'Quick Navigation' },
    { keys: ['G', 'H'], description: 'Go to Hub', category: 'Quick Navigation' },
];

export default function KeyboardShortcuts() {
    const [isOpen, setIsOpen] = useState(false);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
            // Check if not typing in an input
            const target = e.target as HTMLElement;
            if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                setIsOpen(true);
            }
        }
        if (e.key === 'Escape') {
            setIsOpen(false);
        }
    }, []);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
        if (!acc[shortcut.category]) acc[shortcut.category] = [];
        acc[shortcut.category].push(shortcut);
        return acc;
    }, {} as Record<string, Shortcut[]>);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsOpen(false)}
                        className="fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--bg-deep)_82%,transparent)] backdrop-blur-sm"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -20 }}
                        className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-lg z-50"
                    >
                        <div className="elevation-raised mx-4 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)]">
                            {/* Header */}
                            <div className="flex items-center justify-between p-6 border-b border-[var(--border-subtle)]">
                                <div className="flex items-center gap-3">
                                    <span className="icon-shell-neutral inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl border">
                                        <span className="material-symbols-rounded icon-neutral text-xl">keyboard</span>
                                    </span>
                                    <div>
                                        <h2 className="text-lg font-bold text-[var(--text-primary)]">Keyboard Shortcuts</h2>
                                        <p className="text-sm text-[var(--text-secondary)]">Navigate like a pro</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                                    aria-label="Close keyboard shortcuts"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Shortcuts List */}
                            <div className="p-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                                {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
                                    <div key={category} className="mb-6 last:mb-0">
                                        <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3 px-2">
                                            {category}
                                        </h3>
                                        <div className="space-y-1">
                                            {categoryShortcuts.map((shortcut, i) => (
                                                <div
                                                    key={i}
                                                    className="flex items-center justify-between p-3 rounded-xl transition-colors hover:bg-[var(--bg-hover)]"
                                                >
                                                    <span className="text-sm text-[var(--text-secondary)]">{shortcut.description}</span>
                                                    <div className="flex items-center gap-1">
                                                        {shortcut.keys.map((key, j) => (
                                                            <kbd
                                                                key={j}
                                                                className="min-w-[28px] h-7 px-2 flex items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-xs font-mono text-[var(--text-secondary)]"
                                                            >
                                                                {key}
                                                            </kbd>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Footer */}
                            <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                                <p className="text-xs text-[var(--text-muted)] text-center">
                                    Press <kbd className="px-1.5 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]">?</kbd> anytime to show this menu
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
