'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/components/ThemeProvider';
import { useStore } from '@/lib/store';
import { authFetch } from '@/lib/auth-fetch';
import { showToast } from '@/components/Toast';
import { SuiteToolHeader } from '@/components/suite/SuiteToolChrome';
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
  { id: 'greenhouse', name: 'Greenhouse', icon: 'eco', description: 'Used by Stripe, Airbnb, Coinbase', share: '28%' },
  { id: 'lever', name: 'Lever', icon: 'bolt', description: 'Used by Netflix, Twitch, Shopify', share: '22%' },
  { id: 'workday', name: 'Workday', icon: 'domain', description: 'Used by Amazon, JPMorgan, Walmart', share: '35%' },
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
function ConfidenceBadge({ level }: { level: ATSField['confidence'] }) {
  const config = {
    high: { color: '#22c55e', bg: '#22c55e12', label: 'Parsed ✓' },
    medium: { color: '#f59e0b', bg: '#f59e0b12', label: 'Partial' },
    low: { color: '#ef4444', bg: '#ef444412', label: 'Risky' },
    missing: { color: '#6b7280', bg: '#6b728012', label: 'Missing' },
  }[level];
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider" style={{ color: config.color, background: config.bg }}>
      {config.label}
    </span>
  );
}

// ── Main Page ──
export function ATSPreviewContent() {
  const { theme } = useTheme();
  const isLight = theme === 'light';
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
    if (!user) return;
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

  const cardBg = isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)';
  const cardBorder = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';

  const getScoreColor = (score: number) => {
    if (score >= 90) return '#22c55e';
    if (score >= 75) return '#3b82f6';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div className="mobile-app-content min-h-dvh max-w-6xl mx-auto space-y-5 px-4 py-3 md:space-y-6 md:p-6">
      <SuiteToolHeader
        tool="ats-preview"
        title="ATS Preview Simulator"
        subtitle="See exactly what recruiters see after ATS parsing."
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
                background: isActive ? `${isLight ? 'rgba(6,182,212,0.06)' : 'rgba(6,182,212,0.08)'}` : cardBg,
                border: `1px solid ${isActive ? 'rgba(6,182,212,0.3)' : cardBorder}`,
              }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="material-symbols-rounded text-[18px]" style={{ color: isActive ? '#06b6d4' : 'var(--text-muted)' }}>{ats.icon}</span>
                <span className="text-sm font-semibold text-[var(--text-primary)]">{ats.name}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{
                  background: isActive ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.05)',
                  color: isActive ? '#06b6d4' : 'var(--text-muted)',
                }}>{ats.share}</span>
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
          className="w-full py-3.5 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #06b6d4, #0891b2)' }}
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
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-12">
          <div className="max-w-sm mx-auto rounded-2xl p-8 relative overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-blue-500/5" />
            <div className="relative">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                <span className="material-symbols-rounded text-3xl text-cyan-500">description</span>
              </div>
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">No Resume Found</h3>
              <p className="text-sm text-[var(--text-tertiary)] mb-5">
                Upload a resume first to simulate ATS parsing.
              </p>
              <a href="/suite/resume"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #06b6d4, #3b82f6)', boxShadow: '0 4px 16px rgba(6,182,212,0.3)' }}>
                <span className="material-symbols-rounded text-sm">upload</span>
                Go to Resume Builder
              </a>
            </div>
          </div>
        </motion.div>
      )}

      {/* Scanning Animation */}
      <AnimatePresence>
        {scanning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-xl p-8 flex flex-col items-center gap-4"
            style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
          >
            <div className="relative w-20 h-20">
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-cyan-500/20"
                animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <div className="absolute inset-0 rounded-full border-2 border-cyan-500/30 flex items-center justify-center">
                <span className="material-symbols-rounded text-3xl text-cyan-500">scanner</span>
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
            <div className="flex items-center justify-between p-5 rounded-xl" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
              <div className="flex items-center gap-4">
                <div className="relative w-16 h-16">
                  <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                    <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" stroke={isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'} />
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
                    <span className="text-lg font-bold" style={{ color: getScoreColor(result.score) }}>{result.score}</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    {result.score >= 90 ? 'Excellent — ATS Ready' : result.score >= 75 ? 'Good — Minor Issues' : result.score >= 60 ? 'Needs Work' : 'Critical Issues'}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {selectedATS.name} compatibility score • {result.issues.filter(i => i.severity === 'critical').length} critical, {result.issues.filter(i => i.severity === 'warning').length} warnings
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowRawView(!showRawView)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{
                  background: showRawView ? 'rgba(6,182,212,0.1)' : cardBg,
                  color: showRawView ? '#06b6d4' : 'var(--text-secondary)',
                  border: `1px solid ${showRawView ? 'rgba(6,182,212,0.3)' : cardBorder}`,
                }}
              >
                <span className="material-symbols-rounded text-sm">{showRawView ? 'visibility_off' : 'visibility'}</span>
                {showRawView ? 'Hide Raw' : 'Show Raw View'}
              </button>
            </div>

            {/* Split View */}
            <div className={`grid ${showRawView ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
              {/* Parsed Fields */}
              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${cardBorder}` }}>
                <div className="px-4 py-3 flex items-center gap-2" style={{
                  background: isLight ? 'rgba(6,182,212,0.04)' : 'rgba(6,182,212,0.06)',
                  borderBottom: `1px solid ${cardBorder}`,
                }}>
                  <span className="material-symbols-rounded text-sm text-cyan-500">table_rows</span>
                  <span className="text-xs font-bold text-[var(--text-primary)]">What {selectedATS.name} Extracted</span>
                </div>
                <div className="divide-y" style={{ borderColor: cardBorder }}>
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
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{field.label}</span>
                          <ConfidenceBadge level={field.confidence} />
                        </div>
                        <p className={`text-sm ${field.confidence === 'missing' ? 'text-[var(--text-muted)] italic' : 'text-[var(--text-primary)]'} truncate`}>
                          {field.value || '— Not detected —'}
                        </p>
                        {field.warning && (
                          <p className="text-[10px] text-amber-500 mt-0.5 flex items-center gap-1">
                            <span className="material-symbols-rounded text-[10px]">warning</span>
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
                  className="rounded-xl overflow-hidden"
                  style={{ border: `1px solid ${cardBorder}` }}
                >
                  <div className="px-4 py-3 flex items-center gap-2" style={{
                    background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
                    borderBottom: `1px solid ${cardBorder}`,
                  }}>
                    <span className="material-symbols-rounded text-sm text-[var(--text-muted)]">raw_on</span>
                    <span className="text-xs font-bold text-[var(--text-primary)]">Raw ATS Data (what recruiter sees)</span>
                  </div>
                  <div className="p-4 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)] max-h-[600px] overflow-y-auto" style={{ background: isLight ? 'rgba(0,0,0,0.01)' : 'rgba(0,0,0,0.2)' }}>
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
              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${cardBorder}` }}>
                <div className="px-4 py-3 flex items-center justify-between" style={{
                  background: isLight ? 'rgba(239,68,68,0.03)' : 'rgba(239,68,68,0.06)',
                  borderBottom: `1px solid ${cardBorder}`,
                }}>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-rounded text-sm text-red-500">bug_report</span>
                    <span className="text-xs font-bold text-[var(--text-primary)]">Parsing Issues ({result.issues.length})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {result.issues.filter(i => i.severity === 'critical').length > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 font-bold">
                        {result.issues.filter(i => i.severity === 'critical').length} Critical
                      </span>
                    )}
                    {result.issues.filter(i => i.severity === 'warning').length > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-bold">
                        {result.issues.filter(i => i.severity === 'warning').length} Warnings
                      </span>
                    )}
                  </div>
                </div>
                <div className="divide-y" style={{ borderColor: cardBorder }}>
                  {result.issues.map((issue, i) => {
                    const severityConfig = {
                      critical: { color: '#ef4444', icon: 'error', bg: '#ef444408' },
                      warning: { color: '#f59e0b', icon: 'warning', bg: '#f59e0b08' },
                      info: { color: '#3b82f6', icon: 'info', bg: '#3b82f608' },
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
                              <span className="text-[9px] px-1 py-0.5 rounded font-bold uppercase" style={{
                                color: severityConfig.color, background: `${severityConfig.color}15`,
                              }}>{issue.severity}</span>
                            </div>
                            <p className="text-[11px] text-[var(--text-secondary)]">{issue.message}</p>
                            {!issue.autoFixId && (
                              <p className="text-[11px] text-cyan-500 mt-1 flex items-center gap-1">
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
                              className="ml-auto flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:scale-[1.03] active:scale-[0.97]"
                              style={{
                                color: '#10b981',
                                background: '#10b98112',
                                border: '1px solid #10b98125',
                              }}
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
              <div className="text-center py-8 rounded-xl" style={{ background: '#22c55e08', border: '1px solid #22c55e20' }}>
                <span className="material-symbols-rounded text-4xl text-green-500 block mb-2">verified</span>
                <p className="text-sm font-semibold text-green-500">Perfect ATS Compatibility</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">No parsing issues detected for {selectedATS.name}.</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
