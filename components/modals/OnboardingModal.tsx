'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { completeOnboarding, type UserProfile } from '@/lib/database-suite';
import { normalizeResume, type CanonicalResume } from '@/lib/resume-normalizer';
import { runPostOnboardingPipeline } from '@/lib/onboarding-pipeline';
import { useStore } from '@/lib/store';
import { showToast } from '@/components/Toast';
import { ResumeUploadError, uploadAndParseResume, validateResumeFile } from '@/lib/resume-upload';

// ── Career field options ──
const CAREER_FIELDS = [
  'Software Engineering', 'Data Science', 'Product Management', 'UX/UI Design',
  'Marketing', 'Finance', 'Healthcare', 'Education', 'Legal', 'Operations',
  'Sales', 'Human Resources', 'Consulting', 'Research', 'Government',
  'Media & Content', 'Construction', 'Real Estate', 'Non-Profit', 'Supply Chain',
];

const SENIORITY_LEVELS = [
  { value: 'junior', label: 'Junior', desc: '0-2 years' },
  { value: 'mid', label: 'Mid', desc: '2-5 years' },
  { value: 'senior', label: 'Senior', desc: '5-10 years' },
  { value: 'lead', label: 'Lead', desc: '10+ years' },
  { value: 'director', label: 'Director+', desc: 'Executive' },
] as const;

const SEARCH_STATUS = [
  { value: 'active', label: 'Actively searching', icon: 'search' },
  { value: 'passive', label: 'Open to offers', icon: 'notifications' },
  { value: 'employed_exploring', label: 'Employed, exploring', icon: 'explore' },
  { value: 'student', label: 'Student / New grad', icon: 'school' },
] as const;

interface OnboardingModalProps {
  onComplete: (profile: UserProfile) => void;
  onClose?: () => void;
  onDismissPermanently?: () => void;
  userName?: string;
}

export default function OnboardingModal({ onComplete, onClose, onDismissPermanently, userName }: OnboardingModalProps) {
  const { setUserProfile } = useStore();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Step 1: Resume
  const [resumeText, setResumeText] = useState('');
  const [resumeParsed, setResumeParsed] = useState<CanonicalResume | null>(null);
  const [resumeFileName, setResumeFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2: Career goals
  const [careerFields, setCareerFields] = useState<string[]>([]);
  const [customField, setCustomField] = useState('');
  const [targetRoles, setTargetRoles] = useState('');
  const [seniority, setSeniority] = useState<UserProfile['seniority_level']>('mid');
  const [searchStatus, setSearchStatus] = useState<UserProfile['job_search_status']>('active');

  // Step 3: Preferences
  const [location, setLocation] = useState('');
  // Null until the user types a number. These were 50 and 150, which the modal
  // rendered as "$50k – $150k / year" and then persisted to the profile as the
  // user's stated target - a figure nobody had entered, written across a
  // persistence boundary.
  const [salaryMin, setSalaryMin] = useState<number | null>(null);
  const [salaryMax, setSalaryMax] = useState<number | null>(null);

  const firstName = userName?.split(' ')[0] || 'there';

  // ── Resume upload handler ──
  const handleFileUpload = useCallback(async (file: File) => {
    try {
      validateResumeFile(file);
    } catch (error: any) {
      showToast(error.message || 'Please upload a PDF, Word, or TXT file', 'error');
      return;
    }

    setParsing(true);
    try {
      const data = await uploadAndParseResume(file);

      setResumeText(data.text);
      setResumeFileName(file.name);

      // Try to normalize into canonical structure
      try {
        const normalized = normalizeResume(data.text);
        setResumeParsed(normalized);
      } catch {
        // Raw text is still valuable even without structured parsing
        setResumeParsed(null);
      }

      showToast('Resume uploaded successfully!', 'check_circle');

      // Auto-advance to Step 2 after a brief pause
      setTimeout(() => {
        setDirection(1);
        setStep(s => Math.min(s + 1, 3));
      }, 1200);
    } catch (err: any) {
      if (err instanceof ResumeUploadError && err.code === 'SCANNED_PDF') {
        showToast('This looks like a scanned PDF. Please upload a text-based PDF or Word file.', 'error');
      } else {
        showToast(err.message || 'Failed to process resume', 'error');
      }
    } finally {
      setParsing(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  // ── Field toggle ──
  const toggleField = (field: string) => {
    setCareerFields(prev =>
      prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]
    );
  };

  const addCustomField = () => {
    const trimmed = customField.trim();
    if (trimmed && !careerFields.includes(trimmed)) {
      setCareerFields(prev => [...prev, trimmed]);
      setCustomField('');
    }
  };

  // ── Complete onboarding ──
  const handleComplete = async () => {
    // No hard requirement on career fields any more: step 2 now offers "Skip
    // for now", and the only way to leave with an empty list is to have chosen
    // to. An empty array is the honest record of that; a default would not be.
    setLoading(true);
    try {
      const roles = targetRoles
        .split(',')
        .map(r => r.trim())
        .filter(Boolean);

      const onboardingData = {
        career_fields: careerFields,
        seniority_level: seniority,
        job_search_status: searchStatus,
        target_roles: roles.length > 0 ? roles : undefined,
        location_preference: location || undefined,
        // Explicit null checks, not truthiness: a stated minimum of 0 is a real
        // answer and must not be dropped the way `salaryMin &&` dropped it.
        salary_range:
          salaryMin !== null && salaryMax !== null ? { min: salaryMin, max: salaryMax } : undefined,
        base_resume_text: resumeText || undefined,
        base_resume_parsed: resumeParsed || undefined,
      };

      const result = await completeOnboarding(onboardingData);

      if (result.success && result.data) {
        // Run background pipeline (vault seeding, skill extraction)
        runPostOnboardingPipeline(result.data).catch(console.error);

        setUserProfile(result.data);
        showToast('Welcome aboard! Taco is ready for you.', 'rocket_launch');
        onComplete(result.data);
      } else {
        showToast(result.error || 'Something went wrong — you can retry from settings.', 'error');
        // Still close the modal so the user isn't stuck
        onClose?.();
      }
    } catch (err) {
      showToast('Failed to complete onboarding — you can retry from settings.', 'error');
      // Still close the modal so the user isn't stuck
      onClose?.();
    } finally {
      setLoading(false);
    }
  };

  const slideVariants = {
    enter: (direction: number) => ({ x: direction > 0 ? 300 : -300, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (direction: number) => ({ x: direction > 0 ? -300 : 300, opacity: 0 }),
  };

  const [direction, setDirection] = useState(1);

  const goNext = () => { setDirection(1); setStep(s => Math.min(s + 1, 3)); };
  const goBack = () => { setDirection(-1); setStep(s => Math.max(s - 1, 1)); };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start gap-3 mb-1">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--accent-dim)' }}
            >
              <span className="material-symbols-rounded text-xl" style={{ color: 'var(--accent)' }}>
                auto_awesome
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                {step === 1 && `Hey ${firstName}, let's set you up`}
                {step === 2 && 'What are you looking for?'}
                {step === 3 && 'Almost there — quick preferences'}
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Step {step} of 3 — {step === 1 ? 'Upload resume' : step === 2 ? 'Career goals' : 'Preferences'}
              </p>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                title="Close"
              >
                <span className="material-symbols-rounded text-lg">close</span>
              </button>
            )}
          </div>

          {/* Progress bar */}
          <div className="flex gap-1.5 mt-4">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="h-1 flex-1 rounded-full transition-all duration-300"
                style={{
                  background: i <= step ? 'var(--accent)' : 'var(--border-subtle)',
                }}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-6 max-h-[60vh] overflow-y-auto relative">
          <AnimatePresence mode="wait" custom={direction}>
            {/* ── STEP 1: Resume Upload ── */}
            {step === 1 && (
              <motion.div
                key="step1"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: 'easeInOut' }}
              >
                {!resumeText ? (
                  <div
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${dragOver ? 'scale-[1.02]' : ''}`}
                    style={{
                      borderColor: dragOver ? 'var(--accent)' : 'var(--border-subtle)',
                      background: dragOver ? 'var(--accent-dim)' : 'transparent',
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                  >
                    {parsing ? (
                      <div className="flex flex-col items-center gap-3">
                        <span className="material-symbols-rounded text-3xl animate-spin" style={{ color: 'var(--accent)' }}>
                          progress_activity
                        </span>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Parsing your resume...</p>
                      </div>
                    ) : (
                      <>
                        <span className="material-symbols-rounded text-4xl mb-3 block" style={{ color: 'var(--text-muted)' }}>
                          upload_file
                        </span>
                        <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                          Drop your resume here or click to browse
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          PDF, Word (.docx), or TXT — max 10MB
                        </p>
                      </>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,.doc,.txt"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                    />
                  </div>
                ) : (
                  <div
                    className="rounded-xl p-4"
                    style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-rounded text-lg" style={{ color: 'var(--success)' }}>
                          check_circle
                        </span>
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {resumeFileName}
                        </span>
                      </div>
                      <button
                        onClick={() => { setResumeText(''); setResumeParsed(null); setResumeFileName(''); }}
                        className="text-xs px-2 py-1 rounded-lg transition-colors"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Replace
                      </button>
                    </div>
                    <div
                      className="text-xs leading-relaxed max-h-32 overflow-y-auto rounded-lg p-3"
                      style={{ color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}
                    >
                      {resumeText.substring(0, 500)}
                      {resumeText.length > 500 && '...'}
                    </div>
                    {resumeParsed && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {resumeParsed.skills?.slice(0, 3).map((g, i) => (
                          <span
                            key={i}
                            className="text-[10px] px-2 py-0.5 rounded-full"
                            style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
                          >
                            {g.category}: {g.items.slice(0, 3).join(', ')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-between items-center mt-6">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={goNext}
                      className="text-sm font-medium transition-colors hover:underline"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Skip for now →
                    </button>
                    {onDismissPermanently && (
                      <>
                        <span className="text-[10px]" style={{ color: 'var(--border)' }}>·</span>
                        <button
                          onClick={onDismissPermanently}
                          className="text-xs transition-colors hover:underline"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          Don&apos;t show again
                        </button>
                      </>
                    )}
                  </div>
                  {resumeText && (
                    <button
                      onClick={goNext}
                      className="px-5 py-2.5 text-sm transition-all flex items-center gap-2 btn-primary"
                    >
                      Continue
                      <span className="material-symbols-rounded text-sm">arrow_forward</span>
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── STEP 2: Career Goals ── */}
            {step === 2 && (
              <motion.div
                key="step2"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: 'easeInOut' }}
              >
                {/* Career fields */}
                <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>
                  Career fields (select all that apply)
                </label>
                <div className="flex flex-wrap gap-1.5 mb-4 max-h-28 overflow-y-auto">
                  {CAREER_FIELDS.map(field => (
                    <button
                      key={field}
                      onClick={() => toggleField(field)}
                      className="text-xs px-3 py-1.5 rounded-full transition-all"
                      style={{
                        background: careerFields.includes(field) ? 'var(--accent)' : 'var(--bg-hover)',
                        color: careerFields.includes(field) ? 'var(--accent-on, #000)' : 'var(--text-secondary)',
                        border: `1px solid ${careerFields.includes(field) ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      }}
                    >
                      {field}
                    </button>
                  ))}
                </div>

                {/* Custom field input */}
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={customField}
                    onChange={e => setCustomField(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCustomField()}
                    placeholder="Don't see your field? Type it"
                    className="flex-1 text-xs px-3 py-2 rounded-lg outline-none"
                    style={{
                      background: 'var(--bg-input, var(--bg-hover))',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    onClick={addCustomField}
                    disabled={!customField.trim()}
                    className="text-xs px-3 py-2 rounded-lg font-medium disabled:opacity-30"
                    style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
                  >
                    Add
                  </button>
                </div>

                {/* Seniority */}
                <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>
                  Experience level
                </label>
                <div className="flex gap-1 mb-4">
                  {SENIORITY_LEVELS.map(level => (
                    <button
                      key={level.value}
                      onClick={() => setSeniority(level.value)}
                      className="flex-1 text-center py-2 rounded-lg transition-all"
                      style={{
                        background: seniority === level.value ? 'var(--accent)' : 'var(--bg-hover)',
                        color: seniority === level.value ? 'var(--accent-on, #000)' : 'var(--text-secondary)',
                        border: `1px solid ${seniority === level.value ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      }}
                    >
                      <div className="text-xs font-medium">{level.label}</div>
                      <div className="text-[9px] opacity-60">{level.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Job search status */}
                <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>
                  Job search status
                </label>
                <div className="grid grid-cols-2 gap-1.5 mb-4">
                  {SEARCH_STATUS.map(status => (
                    <button
                      key={status.value}
                      onClick={() => setSearchStatus(status.value)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-left"
                      style={{
                        background: searchStatus === status.value ? 'var(--accent-dim)' : 'var(--bg-hover)',
                        border: `1px solid ${searchStatus === status.value ? 'var(--accent)' : 'var(--border-subtle)'}`,
                        color: searchStatus === status.value ? 'var(--accent)' : 'var(--text-secondary)',
                      }}
                    >
                      <span className="material-symbols-rounded text-sm">{status.icon}</span>
                      <span className="text-xs">{status.label}</span>
                    </button>
                  ))}
                </div>

                {/* Target roles */}
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                  Target roles (comma-separated)
                </label>
                <input
                  type="text"
                  value={targetRoles}
                  onChange={e => setTargetRoles(e.target.value)}
                  placeholder="e.g. Backend Engineer, ML Engineer"
                  className="w-full text-xs px-3 py-2 rounded-lg outline-none mb-4"
                  style={{
                    background: 'var(--bg-input, var(--bg-hover))',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />

                <div className="flex justify-between items-center gap-3 mt-2">
                  <div className="flex min-w-0 items-center gap-4">
                    <button onClick={goBack} className="text-sm font-medium transition-colors hover:underline" style={{ color: 'var(--text-secondary)' }}>
                      ← Back
                    </button>
                    {/* Continue stays disabled until a career field is chosen,
                        and this is the only other way off the step. Without it
                        the modal is a dead end for anyone who does not want to
                        answer, which is how a default answer gets invented. */}
                    <button
                      type="button"
                      onClick={goNext}
                      className="min-h-11 whitespace-nowrap text-sm font-medium transition-colors hover:underline"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Skip for now
                    </button>
                  </div>
                  <button
                    onClick={goNext}
                    disabled={careerFields.length === 0}
                    className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                      careerFields.length > 0
                        ? 'btn-primary shadow-md'
                        : 'text-[var(--text-muted)] opacity-40'
                    }`}
                    style={careerFields.length === 0 ? { background: 'var(--border-subtle)' } : undefined}
                  >
                    Continue
                    <span className="material-symbols-rounded text-sm">arrow_forward</span>
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── STEP 3: Preferences ── */}
            {step === 3 && (
              <motion.div
                key="step3"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: 'easeInOut' }}
              >
                <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                  These help Taco give better recommendations. You can always change them later.
                </p>

                {/* Location */}
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                  Location preference
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="e.g. San Francisco, Remote, Hybrid NYC"
                  className="w-full text-xs px-3 py-2.5 rounded-lg outline-none mb-5"
                  style={{
                    background: 'var(--bg-input, var(--bg-hover))',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />

                {/* Salary range */}
                <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>
                  Target salary range
                </label>
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1">
                    <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-muted)' }}>Min ($k)</label>
                    <input
                      type="number"
                      value={salaryMin ?? ''}
                      onChange={e => setSalaryMin(e.target.value === '' ? null : Number(e.target.value))}
                      placeholder="—"
                      min={0}
                      max={500}
                      className="w-full text-xs px-3 py-2 rounded-lg outline-none"
                      style={{
                        background: 'var(--bg-input, var(--bg-hover))',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                  <span className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>—</span>
                  <div className="flex-1">
                    <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-muted)' }}>Max ($k)</label>
                    <input
                      type="number"
                      value={salaryMax ?? ''}
                      onChange={e => setSalaryMax(e.target.value === '' ? null : Number(e.target.value))}
                      placeholder="—"
                      min={0}
                      max={1000}
                      className="w-full text-xs px-3 py-2 rounded-lg outline-none"
                      style={{
                        background: 'var(--bg-input, var(--bg-hover))',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                </div>
                {/* The wrapper keeps the gap below the inputs constant, so the
                    step does not reflow the moment a first digit is typed. */}
                <div className="mb-6 min-h-[14px]">
                  {salaryMin !== null && salaryMax !== null && (
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      ${salaryMin}k – ${salaryMax}k / year
                    </p>
                  )}
                </div>

                {/* Summary of selections */}
                <div
                  className="rounded-xl p-3 mb-5"
                  style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)20' }}
                >
                  <p className="text-[10px] font-medium mb-1" style={{ color: 'var(--accent)' }}>Your profile summary</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {careerFields.length > 0 && `${careerFields.join(', ')} · `}
                    {SENIORITY_LEVELS.find(l => l.value === seniority)?.label} level ·{' '}
                    {SEARCH_STATUS.find(s => s.value === searchStatus)?.label}
                    {targetRoles && ` · Targeting: ${targetRoles}`}
                    {resumeFileName && ` · Resume: ${resumeFileName}`}
                  </p>
                </div>

                <div className="flex justify-between items-center">
                  <button onClick={goBack} className="text-sm font-medium transition-colors hover:underline" style={{ color: 'var(--text-secondary)' }}>
                    ← Back
                  </button>
                  <button
                    onClick={handleComplete}
                    disabled={loading}
                    className="px-6 py-2.5 text-sm transition-all flex items-center gap-2 disabled:opacity-70 btn-primary"
                  >
                    {loading ? (
                      <>
                        <span className="material-symbols-rounded text-sm animate-spin">progress_activity</span>
                        Setting up...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-rounded text-sm">rocket_launch</span>
                        Launch with Taco
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
