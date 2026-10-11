'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/lib/store';
import { authFetch } from '@/lib/auth-fetch';
import { showToast } from '@/components/Toast';
import { SuiteToolHeader, SuiteEmptyState } from '@/components/suite/SuiteToolChrome';
import { type ResumeVersion } from '@/lib/database-suite';
import ResumeLibraryPicker from '@/components/ResumeLibraryPicker';
import { useApplicationKitContext } from '@/hooks/useApplicationKitContext';
import { resumeVersionToApplicationKitContext } from '@/lib/application-kit';

// ── Types ──
interface ResumeData {
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  linkedin?: string;
  website?: string;
  summary: string;
  experience: { company: string; role: string; duration: string; achievements: string[] }[];
  education: { degree: string; institution: string; year: string; details?: string }[];
  skills: { category: string; items: string[] }[];
  certifications?: string[];
}

interface ATSField {
  label: string;
  value: string;
  confidence: 'high' | 'medium' | 'low' | 'missing';
  warning?: string;
}

interface ATSIssue {
  severity: 'critical' | 'warning' | 'info';
  field: string;
  message: string;
  fix: string;
  autoFixId?: string;
}

const ATS_SYSTEMS = [
  { id: 'greenhouse', name: 'Greenhouse', icon: 'eco', description: 'Used by Stripe, Airbnb, Coinbase' },
  { id: 'lever', name: 'Lever', icon: 'bolt', description: 'Used by Netflix, Twitch, Shopify' },
  { id: 'workday', name: 'Workday', icon: 'domain', description: 'Used by Amazon, JPMorgan, Walmart' },
];

// ── ATS Simulation Engine ──
function simulateATSParse(resume: ResumeData, atsId: string): { fields: ATSField[]; issues: ATSIssue[]; score: number } {
  const fields: ATSField[] = [];
  const issues: ATSIssue[] = [];
  let score = 100;

  // Name parsing
  if (resume.name) {
    const parts = resume.name.trim().split(/\s+/);
    if (parts.length >= 2) {
      fields.push({ label: 'First Name', value: parts[0], confidence: 'high' });
      fields.push({ label: 'Last Name', value: parts.slice(1).join(' '), confidence: 'high' });
    } else {
      fields.push({ label: 'Full Name', value: resume.name, confidence: 'medium', warning: 'Could not split into first/last name' });
      issues.push({ severity: 'warning', field: 'Name', message: 'Single-word name detected', fix: 'Use "First Last" format for reliable parsing' });
      score -= 5;
    }
  } else {
    fields.push({ label: 'Name', value: '', confidence: 'missing' });
    issues.push({ severity: 'critical', field: 'Name', message: 'No name detected', fix: 'Add your full name at the top of the resume' });
    score -= 15;
  }

  // Email
  if (resume.email) {
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resume.email);
    fields.push({ label: 'Email', value: resume.email, confidence: emailValid ? 'high' : 'low', warning: emailValid ? undefined : 'Email format may not parse correctly' });
    if (!emailValid) { score -= 10; issues.push({ severity: 'critical', field: 'Email', message: 'Invalid email format', fix: 'Use standard email format: name@domain.com' }); }
  } else {
    fields.push({ label: 'Email', value: '', confidence: 'missing' });
    issues.push({ severity: 'critical', field: 'Email', message: 'No email detected', fix: 'Add your email address — many ATS systems require it' });
    score -= 15;
  }

  // Phone
  if (resume.phone) {
    fields.push({ label: 'Phone', value: resume.phone, confidence: 'high' });
  } else {
    fields.push({ label: 'Phone', value: '', confidence: 'missing' });
    issues.push({ severity: 'warning', field: 'Phone', message: 'No phone number detected', fix: 'Add a phone number for recruiter contact' });
    score -= 5;
  }

  // Location
  if (resume.location) {
    fields.push({ label: 'Location', value: resume.location, confidence: 'high' });
  } else {
    fields.push({ label: 'Location', value: '', confidence: 'low', warning: 'Location helps with job matching' });
    score -= 3;
  }

  // LinkedIn
  if (resume.linkedin) {
    fields.push({ label: 'LinkedIn', value: resume.linkedin, confidence: 'high' });
  }

  // Title / Current Role
  if (resume.title) {
    fields.push({ label: 'Current Title', value: resume.title, confidence: 'high' });
  } else if (resume.experience?.[0]?.role) {
    fields.push({ label: 'Current Title', value: resume.experience[0].role, confidence: 'medium', warning: 'Inferred from latest experience' });
  } else {
    fields.push({ label: 'Current Title', value: '', confidence: 'missing' });
    score -= 5;
  }

  // Summary
  if (resume.summary) {
    const wordCount = resume.summary.split(/\s+/).length;
    if (wordCount > 150) {
      fields.push({ label: 'Summary', value: `${resume.summary.slice(0, 120)}...`, confidence: 'medium', warning: `${wordCount} words — may be truncated by ATS` });
      issues.push({ severity: 'warning', field: 'Summary', message: `Summary is ${wordCount} words — some ATS truncate at 100`, fix: 'Keep summary under 100 words for safety', autoFixId: 'trim_summary' });
      score -= 3;
    } else {
      fields.push({ label: 'Summary', value: `${resume.summary.slice(0, 120)}...`, confidence: 'high' });
    }
  }

  // Experience
  if (resume.experience?.length > 0) {
    resume.experience.forEach((exp, i) => {
      const conf = (exp.role && exp.company && exp.duration) ? 'high' : 'medium';
      fields.push({
        label: `Experience ${i + 1}`,
        value: `${exp.role || '?'} at ${exp.company || '?'} (${exp.duration || '?'})`,
        confidence: conf,
        warning: conf === 'medium' ? 'Missing role, company, or duration' : undefined,
      });

      // ATS-specific parsing quirks
      if (atsId === 'workday' && exp.achievements?.length > 6) {
        issues.push({ severity: 'info', field: `Experience ${i + 1}`, message: `${exp.achievements.length} bullets — Workday may truncate after 6`, fix: 'Limit to 4-6 bullets per role for Workday', autoFixId: `cap_bullets_${i}` });
      }
    });
  } else {
    fields.push({ label: 'Experience', value: '', confidence: 'missing' });
    issues.push({ severity: 'critical', field: 'Experience', message: 'No work experience detected', fix: 'Add your work history with clear role, company, and dates' });
    score -= 20;
  }

  // Education
  if (resume.education?.length > 0) {
    resume.education.forEach((edu, i) => {
      fields.push({
        label: `Education ${i + 1}`,
        value: `${edu.degree || '?'} — ${edu.institution || '?'} (${edu.year || '?'})`,
        confidence: (edu.degree && edu.institution) ? 'high' : 'medium',
      });
    });
  } else {
    fields.push({ label: 'Education', value: '', confidence: 'missing' });
    score -= 5;
  }

  // Skills
  const allSkills = (resume.skills || []).flatMap(s => s.items || []);
  if (allSkills.length > 0) {
    fields.push({ label: 'Skills', value: allSkills.slice(0, 15).join(', ') + (allSkills.length > 15 ? ` (+${allSkills.length - 15} more)` : ''), confidence: 'high' });

    // Check for Unicode issues
    const unicodeSkills = allSkills.filter(s => /[^\x00-\x7F]/.test(s));
    if (unicodeSkills.length > 0) {
      issues.push({ severity: 'warning', field: 'Skills', message: `${unicodeSkills.length} skills contain special characters that ATS may misread`, fix: 'Use ASCII-only characters in skill names', autoFixId: 'fix_unicode_skills' });
      score -= 5;
    }
  } else {
    fields.push({ label: 'Skills', value: '', confidence: 'missing' });
    issues.push({ severity: 'critical', field: 'Skills', message: 'No skills section detected', fix: 'Add a skills section — ATS uses this for keyword matching' });
    score -= 15;
  }

  // Certifications
  if (resume.certifications?.length) {
    fields.push({ label: 'Certifications', value: resume.certifications.join(', '), confidence: 'high' });
  }

  // ATS-specific quirks
  if (atsId === 'greenhouse') {
    if (!resume.linkedin) {
      issues.push({ severity: 'info', field: 'LinkedIn', message: 'Greenhouse prioritizes LinkedIn profiles for auto-fill', fix: 'Add your LinkedIn URL for better Greenhouse parsing' });
    }
  }
  if (atsId === 'lever') {
    if (resume.experience?.some(e => !e.duration || !/\d{4}/.test(e.duration))) {
      issues.push({ severity: 'warning', field: 'Dates', message: 'Lever expects explicit year ranges (e.g., "2021 - 2024")', fix: 'Use "Month Year - Month Year" format for all roles', autoFixId: 'fix_lever_dates' });
      score -= 5;
    }
  }
  if (atsId === 'workday') {
    if (resume.experience?.length > 8) {
      issues.push({ severity: 'info', field: 'Experience', message: 'Workday has a maximum of 10 experience entries', fix: 'Focus on your last 8-10 years of experience' });
    }
  }

  return { fields, issues: issues.sort((a, b) => { const o = { critical: 0, warning: 1, info: 2 }; return o[a.severity] - o[b.severity]; }), score: Math.max(0, Math.min(100, score)) };
}

// ── Confidence badge ──
// Colour is the fourth channel: each state carries a text label; hue comes from
// tag tokens that hold their own 3:1 contrast in both themes.
function ConfidenceBadge({ level }: { level: ATSField['confidence'] }) {
  const config = {
    high: { className: 'bg-[var(--tag-green-bg)] text-[var(--tag-green-text)]', label: 'Parsed ✓' },
    medium: { className: 'bg-[var(--tag-amber-bg)] text-[var(--tag-amber-text)]', label: 'Partial' },
    low: { className: 'bg-[var(--tag-rose-bg)] text-[var(--tag-rose-text)]', label: 'Risky' },
    missing: { className: 'bg-[var(--bg-hover)] text-[var(--text-muted)]', label: 'Missing' },
  }[level];
  return (
    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${config.className}`}>
      {config.label}
    </span>
  );
}

// ── Main Page ──
export function ATSPreviewContent() {
  const { user } = useStore();
  const { context: kitContext, updateContext } = useApplicationKitContext();

  const [resume, setResume] = useState<ResumeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedATS, setSelectedATS] = useState(ATS_SYSTEMS[0]);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{ fields: ATSField[]; issues: ATSIssue[]; score: number } | null>(null);
  const [showRawView, setShowRawView] = useState(false);

  // Saved Resumes integration
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [selectedResumeName, setSelectedResumeName] = useState('');

  const handleSelectResume = (rv: ResumeVersion) => {
    const c = rv.content as any;
    setResume({
      name: c.name || '', title: c.title || '', email: c.email || '', phone: c.phone || '', location: c.location || '',
      linkedin: c.linkedin, website: c.website, summary: c.summary || '',
      experience: (c.experience || []).map((e: any) => ({ company: e.company || '', role: e.role || e.title || '', duration: e.duration || e.date || '', achievements: e.achievements || (e.description ? [e.description] : []) })),
      education: (c.education || []).map((e: any) => ({ degree: e.degree || '', institution: e.school || e.institution || '', year: e.date || e.year || '' })),
      skills: Array.isArray(c.skills) ? (typeof c.skills[0] === 'string' ? [{ category: 'Skills', items: c.skills }] : c.skills) : [],
      certifications: c.certifications || [],
    });
    setResult(null);
    setSelectedResumeId(rv.id);
    setSelectedResumeName(rv.version_name);
    updateContext(resumeVersionToApplicationKitContext(rv));
  };

  useEffect(() => {
    if (!resume && kitContext.resumeSnapshot) {
      const c = kitContext.resumeSnapshot as any;
      setResume({
        name: c.name || '', title: c.title || '', email: c.email || '', phone: c.phone || '', location: c.location || '',
        linkedin: c.linkedin, website: c.website, summary: c.summary || '',
        experience: (c.experience || []).map((e: any) => ({ company: e.company || '', role: e.role || e.title || '', duration: e.duration || e.date || '', achievements: e.achievements || (e.description ? [e.description] : []) })),
        education: (c.education || []).map((e: any) => ({ degree: e.degree || '', institution: e.school || e.institution || '', year: e.date || e.year || '' })),
        skills: Array.isArray(c.skills) ? (typeof c.skills[0] === 'string' ? [{ category: 'Skills', items: c.skills }] : c.skills) : [],
        certifications: c.certifications || [],
      });
      setSelectedResumeId(kitContext.resumeVersionId || null);
      setSelectedResumeName(kitContext.resumeVersionName || '');
      setLoading(false);
    }
  }, [kitContext.updatedAt]);

  // Load latest resume from vault
  useEffect(() => {
    /* Clear `loading` on the way out, not just in the fetch's `finally`.
       `loading` starts true and the only other writer is the kit-snapshot
       effect above, which needs a snapshot to fire. A signed-out visitor has
       neither, so this bare `return` left the skeleton at the bottom of this
       file as the entire page, forever. Reachable: /suite/ats-preview and the
       ATS Preview tab of /suite/ats-analyzer both render this signed out —
       WorkspaceFrame does not redirect. With the flag cleared the "No Resume
       Found" card renders instead, which is the truthful state and carries a
       route to the resume builder. */
    if (!user) { setLoading(false); return; }
    (async () => {
      try {
        const res = await authFetch('/api/resume/latest');
        if (res.ok) {
          const data = await res.json();
          if (data.resume) {
            setResume(data.resume);
            updateContext({ resumeSnapshot: data.resume, resumeSource: 'library' });
          }
        }
      } catch { /* silent */ }
      finally { setLoading(false); }
    })();
  }, [user]);

  const runSimulation = async () => {
    if (!resume) return;
    setScanning(true);
    setResult(null);

    // Simulate processing delay for UX
    await new Promise(r => setTimeout(r, 1500));
    const simResult = simulateATSParse(resume, selectedATS.id);
    setResult(simResult);
    updateContext({
      atsResult: {
        status: 'success',
        data: {
          ...(kitContext.atsResult?.data || {}),
          preview: { ...simResult, vendor: selectedATS.id },
        },
        updatedAt: new Date().toISOString(),
      },
    });
    setScanning(false);
    showToast(`${selectedATS.name} simulation complete — ${simResult.score}% compatibility`, 'smart_toy');
  };

  // ── Auto-Fix Handler ──
  const handleAutoFix = (fixId: string) => {
    if (!resume) return;
    const updated = { ...resume };
    let fixApplied = '';

    if (fixId === 'fix_unicode_skills') {
      const UNICODE_MAP: Record<string, string> = {
        '\u2014': '-', '\u2013': '-', '\u2018': "'", '\u2019': "'",
        '\u201C': '"', '\u201D': '"', '\u2026': '...', '\u2022': '',
        '\u00AE': '', '\u2122': '', '\u00A9': '',
      };
      updated.skills = updated.skills.map(group => ({
        ...group,
        items: group.items.map(skill =>
          skill.replace(/[^\x00-\x7F]/g, c => UNICODE_MAP[c] || '').trim()
        ).filter(s => s.length > 0),
      }));
      fixApplied = 'Replaced special characters in skills with ASCII equivalents';
    }

    if (fixId === 'trim_summary') {
      const words = updated.summary.split(/\s+/);
      if (words.length > 100) {
        updated.summary = words.slice(0, 95).join(' ') + '...';
        fixApplied = 'Trimmed summary to ~95 words';
      }
    }

    if (fixId.startsWith('cap_bullets_')) {
      const idx = parseInt(fixId.split('_')[2]);
      if (updated.experience[idx] && updated.experience[idx].achievements.length > 6) {
        updated.experience = [...updated.experience];
        updated.experience[idx] = {
          ...updated.experience[idx],
          achievements: updated.experience[idx].achievements.slice(0, 6),
        };
        fixApplied = `Capped Experience ${idx + 1} to 6 bullets`;
      }
    }

    if (fixApplied) {
      setResume(updated);
      const simResult = simulateATSParse(updated, selectedATS.id);
      setResult(simResult);
      updateContext({
        resumeSnapshot: updated,
        atsResult: {
          status: 'success',
          data: {
            ...(kitContext.atsResult?.data || {}),
            preview: { ...simResult, vendor: selectedATS.id },
          },
          updatedAt: new Date().toISOString(),
        },
      });
      showToast(`Fixed: ${fixApplied}`, 'auto_fix_high');
    }
  };

  // Score band colour — every branch resolves to a token, never a hex literal.
  const getScoreColor = (score: number) => {
    if (score >= 90) return 'var(--success)';
    if (score >= 75) return 'var(--accent)';
    if (score >= 60) return 'var(--warning)';
    return 'var(--danger)';
  };

  return (
    <div className="mobile-app-content min-h-dvh max-w-6xl mx-auto space-y-5 px-4 py-3 md:space-y-6 md:p-6">
      <SuiteToolHeader
        tool="ats-preview"
        title="ATS Preview Simulator"
        subtitle="A simulation of how an ATS may parse your resume — an estimate, not a guarantee."
        icon="scanner"
        pageHelpId="ats-preview"
        actions={
          <ResumeLibraryPicker
            onSelect={handleSelectResume}
            selectedId={selectedResumeId}
            selectedName={selectedResumeName}
          />
        }
      />

      {/* ATS System Selector */}
      <div className="grid grid-cols-3 gap-3">
        {ATS_SYSTEMS.map(ats => {
          const isActive = selectedATS.id === ats.id;
          return (
            <motion.button
              key={ats.id}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => { setSelectedATS(ats); setResult(null); }}
              className="p-4 rounded-xl text-left transition-all"
              style={{
                background: isActive ? 'var(--accent-dim)' : 'var(--card-bg)',
                border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border-subtle)'}`,
              }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="material-symbols-rounded text-[18px]" style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}>{ats.icon}</span>
                <span className="text-sm font-semibold text-[var(--text-primary)]">{ats.name}</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">{ats.description}</p>
            </motion.button>
          );
        })}
      </div>

      {/* Scan Button */}
      {resume && (
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={runSimulation}
          disabled={scanning}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {scanning ? (
            <>
              <span className="material-symbols-rounded text-lg animate-spin">progress_activity</span>
              Scanning through {selectedATS.name}...
            </>
          ) : (
            <>
              <span className="material-symbols-rounded text-lg">play_arrow</span>
              Simulate {selectedATS.name} Parse
            </>
          )}
        </motion.button>
      )}

      {/* Loading / No Resume */}
      {loading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} />
          ))}
        </div>
      )}

      {!loading && !resume && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <SuiteEmptyState
            icon="description"
            title="No Resume Found"
            description="Upload a resume first to simulate ATS parsing."
            action={
              <a href="/suite/resume" className="btn-primary inline-flex items-center gap-2 px-5">
                <span className="material-symbols-rounded text-sm">upload</span>
                Go to Resume Builder
              </a>
            }
          />
        </motion.div>
      )}

      {/* Scanning Animation */}
      <AnimatePresence>
        {scanning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-xl p-8 flex flex-col items-center gap-4 bg-[var(--card-bg)] border border-[var(--border-subtle)]"
          >
            <div className="relative w-20 h-20">
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-[var(--accent)]"
                animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <div className="absolute inset-0 rounded-full border-2 border-[var(--accent)] flex items-center justify-center">
                <span className="material-symbols-rounded text-3xl text-[var(--accent)]">scanner</span>
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-[var(--text-primary)]">Simulating {selectedATS.name} parser...</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Checking field extraction, format compatibility, and parsing accuracy</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <AnimatePresence>
        {result && !scanning && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Score Header */}
            <div className="flex items-center justify-between p-5 rounded-xl bg-[var(--card-bg)] border border-[var(--border-subtle)]">
              <div className="flex items-center gap-4">
                {result.score > 0 ? (
                  <div className="relative w-16 h-16">
                    <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                      <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" stroke="var(--border-subtle)" />
                      <motion.circle
                        cx="18" cy="18" r="15.5" fill="none" strokeWidth="3"
                        strokeLinecap="round"
                        stroke={getScoreColor(result.score)}
                        initial={{ strokeDasharray: '0 100' }}
                        animate={{ strokeDasharray: `${result.score} ${100 - result.score}` }}
                        transition={{ duration: 1.2, ease: 'easeOut' }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-lg font-bold tabular-nums" style={{ color: getScoreColor(result.score) }}>{result.score}</span>
                    </div>
                  </div>
                ) : (
                  /* Zero-guard: a floored-to-zero estimate must not render as an
                     empty ring reading as "no data". Draw the absence explicitly. */
                  <div className="relative w-16 h-16 rounded-full border border-dashed border-[var(--border-subtle)] flex items-center justify-center" title="No estimate">
                    <span className="material-symbols-rounded text-2xl text-[var(--text-muted)]">error</span>
                  </div>
                )}
                <div>
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    {result.score === 0 ? 'Critical Issues' : result.score >= 90 ? 'Excellent — ATS Ready' : result.score >= 75 ? 'Good — Minor Issues' : result.score >= 60 ? 'Needs Work' : 'Critical Issues'}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {result.score === 0
                      ? `No compatible fields parsed for ${selectedATS.name} — see issues below`
                      : `${selectedATS.name} estimated compatibility • ${result.issues.filter(i => i.severity === 'critical').length} critical, ${result.issues.filter(i => i.severity === 'warning').length} warnings`}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Simulated estimate — not a guarantee of how a real ATS will parse.</p>
                </div>
              </div>
              <button
                onClick={() => setShowRawView(!showRawView)}
                className="flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] rounded-lg text-xs font-medium transition-colors"
                style={{
                  background: showRawView ? 'var(--accent-dim)' : 'var(--card-bg)',
                  color: showRawView ? 'var(--accent)' : 'var(--text-secondary)',
                  border: `1px solid ${showRawView ? 'var(--accent)' : 'var(--border-subtle)'}`,
                }}
              >
                <span className="material-symbols-rounded text-sm">{showRawView ? 'visibility_off' : 'visibility'}</span>
                {showRawView ? 'Hide Raw' : 'Show Raw View'}
              </button>
            </div>

            {/* Split View */}
            <div className={`grid ${showRawView ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
              {/* Parsed Fields */}
              <div className="rounded-xl overflow-hidden border border-[var(--border-subtle)]">
                <div className="px-4 py-3 flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--accent-dim)]">
                  <span className="material-symbols-rounded text-sm text-[var(--accent)]">table_rows</span>
                  <span className="text-xs font-bold text-[var(--text-primary)]">What {selectedATS.name} Extracted</span>
                </div>
                <div className="divide-y divide-[var(--border-subtle)]">
                  {result.fields.map((field, i) => (
                    <motion.div
                      key={`${field.label}-${i}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex items-start justify-between px-4 py-3 gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{field.label}</span>
                          <ConfidenceBadge level={field.confidence} />
                        </div>
                        <p className={`text-sm ${field.confidence === 'missing' ? 'text-[var(--text-muted)] italic' : 'text-[var(--text-primary)]'} truncate`}>
                          {field.value || '— Not detected —'}
                        </p>
                        {field.warning && (
                          <p className="text-[11px] text-[var(--warning)] mt-0.5 flex items-center gap-1">
                            <span className="material-symbols-rounded text-[11px]">warning</span>
                            {field.warning}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Raw Text View */}
              {showRawView && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="rounded-xl overflow-hidden border border-[var(--border-subtle)]"
                >
                  <div className="px-4 py-3 flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                    <span className="material-symbols-rounded text-sm text-[var(--text-muted)]">raw_on</span>
                    <span className="text-xs font-bold text-[var(--text-primary)]">Raw ATS Data (what recruiter sees)</span>
                  </div>
                  <div className="p-4 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)] max-h-[600px] overflow-y-auto bg-[var(--bg-input)]">
                    {resume && (
                      <pre className="whitespace-pre-wrap">
{`CANDIDATE_NAME: ${resume.name || '[EMPTY]'}
CANDIDATE_TITLE: ${resume.title || '[EMPTY]'}
EMAIL: ${resume.email || '[EMPTY]'}
PHONE: ${resume.phone || '[EMPTY]'}
LOCATION: ${resume.location || '[EMPTY]'}
LINKEDIN: ${resume.linkedin || '[EMPTY]'}
WEBSITE: ${resume.website || '[EMPTY]'}

--- SUMMARY ---
${resume.summary || '[NO SUMMARY DETECTED]'}

--- WORK EXPERIENCE ---
${(resume.experience || []).map((exp, i) => `
[${i + 1}] ROLE: ${exp.role || '[EMPTY]'}
    COMPANY: ${exp.company || '[EMPTY]'}
    DATES: ${exp.duration || '[EMPTY]'}
    BULLETS:
${(exp.achievements || []).map(a => `      • ${a}`).join('\n') || '      [NO BULLETS]'}`).join('\n')}

--- EDUCATION ---
${(resume.education || []).map((edu, i) => `[${i + 1}] ${edu.degree || '?'} | ${edu.institution || '?'} | ${edu.year || '?'}`).join('\n') || '[NO EDUCATION]'}

--- SKILLS ---
${(resume.skills || []).map(cat => `${cat.category}: ${cat.items.join(', ')}`).join('\n') || '[NO SKILLS]'}

--- CERTIFICATIONS ---
${(resume.certifications || []).join('\n') || '[NONE]'}`}
                      </pre>
                    )}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Issues Panel */}
            {result.issues.length > 0 && (
              <div className="rounded-xl overflow-hidden border border-[var(--border-subtle)]">
                <div className="px-4 py-3 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--tag-rose-bg)]">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-rounded text-sm text-[var(--danger)]">bug_report</span>
                    <span className="text-xs font-bold text-[var(--text-primary)]">Parsing Issues ({result.issues.length})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {result.issues.filter(i => i.severity === 'critical').length > 0 && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded font-bold bg-[var(--tag-rose-bg)] text-[var(--tag-rose-text)]">
                        {result.issues.filter(i => i.severity === 'critical').length} Critical
                      </span>
                    )}
                    {result.issues.filter(i => i.severity === 'warning').length > 0 && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded font-bold bg-[var(--tag-amber-bg)] text-[var(--tag-amber-text)]">
                        {result.issues.filter(i => i.severity === 'warning').length} Warnings
                      </span>
                    )}
                  </div>
                </div>
                <div className="divide-y divide-[var(--border-subtle)]">
                  {result.issues.map((issue, i) => {
                    const severityConfig = {
                      critical: { color: 'var(--danger)', icon: 'error', bg: 'var(--tag-rose-bg)' },
                      warning: { color: 'var(--warning)', icon: 'warning', bg: 'var(--tag-amber-bg)' },
                      info: { color: 'var(--accent)', icon: 'info', bg: 'var(--tag-blue-bg)' },
                    }[issue.severity];
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="px-4 py-3"
                        style={{ background: severityConfig.bg }}
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="material-symbols-rounded text-base mt-0.5" style={{ color: severityConfig.color }}>{severityConfig.icon}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-semibold text-[var(--text-primary)]">{issue.field}</span>
                              <span className="text-[11px] px-1 py-0.5 rounded font-bold uppercase" style={{
                                color: severityConfig.color, background: severityConfig.bg,
                              }}>{issue.severity}</span>
                            </div>
                            <p className="text-[11px] text-[var(--text-secondary)]">{issue.message}</p>
                            {!issue.autoFixId && (
                              <p className="text-[11px] text-[var(--accent)] mt-1 flex items-center gap-1">
                                <span className="material-symbols-rounded text-[11px]">lightbulb</span>
                                {issue.fix}
                              </p>
                            )}
                            {issue.autoFixId && (
                              <p className="text-[11px] text-[var(--text-muted)] mt-1">{issue.fix}</p>
                            )}
                          </div>
                          {issue.autoFixId && (
                            <button
                              onClick={() => handleAutoFix(issue.autoFixId!)}
                              className="ml-auto flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 min-h-[44px] rounded-lg text-[11px] font-semibold transition-all hover:scale-[1.03] active:scale-[0.97] bg-[var(--tag-green-bg)] text-[var(--tag-green-text)] border border-[var(--tag-green-text)]"
                            >
                              <span className="material-symbols-rounded text-[13px]">auto_fix_high</span>
                              Fix Now
                            </button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* No Issues */}
            {result.issues.length === 0 && (
              <div className="text-center py-8 rounded-xl bg-[var(--tag-green-bg)] border border-[var(--tag-green-text)]">
                <span className="material-symbols-rounded text-4xl text-[var(--success)] block mb-2">verified</span>
                <p className="text-sm font-semibold text-[var(--success)]">Perfect ATS Compatibility</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">No parsing issues detected for {selectedATS.name}.</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
