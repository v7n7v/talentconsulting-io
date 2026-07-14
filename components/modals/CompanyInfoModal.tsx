'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CompanyInfoModalProps {
    isOpen: boolean;
    onSubmit: (info: { companyName: string; jobTitle?: string; applicationLink?: string }) => void;
    onCancel: () => void;
    jobDescription?: string;
}

export default function CompanyInfoModal({ isOpen, onSubmit, onCancel, jobDescription }: CompanyInfoModalProps) {
    const [companyName, setCompanyName] = useState('');
    const [jobTitle, setJobTitle] = useState('');
    const [applicationLink, setApplicationLink] = useState('');
    const [isExtracting, setIsExtracting] = useState(false);

    const handleExtractFromJD = async () => {
        if (!jobDescription) return;

        setIsExtracting(true);
        try {
            const companyMatch = jobDescription.match(/(?:at|with|join)\s+([A-Z][a-zA-Z\s&]+?)(?:\s|,|\.|\n)/);
            if (companyMatch) setCompanyName(companyMatch[1].trim());

            const titleMatch = jobDescription.match(/^(.+?)(?:\n|$)/) ||
                jobDescription.match(/(?:Position|Role|Title):\s*(.+?)(?:\n|$)/i);
            if (titleMatch) setJobTitle(titleMatch[1].trim());
        } catch (error) {
            console.error('Extraction error:', error);
        } finally {
            setIsExtracting(false);
        }
    };

    const handleSubmit = () => {
        if (!companyName.trim()) return;
        onSubmit({
            companyName: companyName.trim(),
            jobTitle: jobTitle.trim() || undefined,
            applicationLink: applicationLink.trim() || undefined,
        });
        setCompanyName('');
        setJobTitle('');
        setApplicationLink('');
    };

    if (!isOpen) return null;

    const inputClass = "w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all";
    const inputStyle = {
        background: 'var(--bg-input, var(--bg-hover))',
        border: '1px solid var(--border-subtle)',
        color: 'var(--text-primary)',
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onCancel}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
                    />

                    {/* Modal */}
                    <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 12 }}
                            transition={{ duration: 0.18, ease: 'easeOut' }}
                            className="relative w-full max-w-lg rounded-2xl overflow-hidden shadow-xl"
                            style={{
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border-subtle)',
                            }}
                        >
                            <div className="p-6">
                                {/* Header */}
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="icon-shell-neutral w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0">
                                        <span className="material-symbols-rounded text-lg">domain</span>
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Company Information</h2>
                                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                            Which company are you tailoring this resume for?
                                        </p>
                                    </div>
                                    <button
                                        onClick={onCancel}
                                        className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
                                        style={{ color: 'var(--text-muted)' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        <span className="material-symbols-rounded text-lg">close</span>
                                    </button>
                                </div>

                                {/* Form */}
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                            Company Name <span style={{ color: 'var(--danger)' }}>*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={companyName}
                                            onChange={(e) => setCompanyName(e.target.value)}
                                            placeholder="e.g., Google, Microsoft, Tesla"
                                            className={inputClass}
                                            style={inputStyle}
                                            autoFocus
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                            Job Title <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>(optional)</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={jobTitle}
                                            onChange={(e) => setJobTitle(e.target.value)}
                                            placeholder="e.g., Senior Software Engineer"
                                            className={inputClass}
                                            style={inputStyle}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                            Application URL <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>(optional)</span>
                                        </label>
                                        <input
                                            type="url"
                                            value={applicationLink}
                                            onChange={(e) => setApplicationLink(e.target.value)}
                                            placeholder="https://company.com/careers/job-123"
                                            className={inputClass}
                                            style={inputStyle}
                                        />
                                    </div>

                                    {/* AI Extract Button */}
                                    {jobDescription && (
                                        <button
                                            onClick={handleExtractFromJD}
                                            disabled={isExtracting}
                                            className="w-full px-4 py-2 rounded-xl text-xs font-medium disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                                            style={{
                                                background: 'var(--accent-dim)',
                                                color: 'var(--accent)',
                                                border: '1px solid transparent',
                                            }}
                                            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                                            onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
                                        >
                                            {isExtracting ? (
                                                <>
                                                    <span className="material-symbols-rounded text-sm animate-spin">progress_activity</span>
                                                    Extracting...
                                                </>
                                            ) : (
                                                <>
                                                    <span className="material-symbols-rounded text-sm">auto_awesome</span>
                                                    Extract from Job Description
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex gap-2.5 mt-6">
                                    <button
                                        onClick={onCancel}
                                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                                        style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSubmit}
                                        disabled={!companyName.trim()}
                                        className="flex-1 px-4 py-2.5 text-sm transition-all disabled:opacity-40 btn-primary"
                                    >
                                        Continue
                                    </button>
                                </div>

                                {/* Helper text */}
                                <p className="text-[10px] mt-3 text-center" style={{ color: 'var(--text-muted)' }}>
                                    <span className="material-symbols-rounded align-middle mr-0.5 text-[12px]">lightbulb</span>
                                    Your resume will be auto-saved as "Resume_{companyName}_{jobTitle}_{new Date().getFullYear()}"
                                </p>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}
