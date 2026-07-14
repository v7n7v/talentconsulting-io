'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/components/ThemeProvider';
import { useStore } from '@/lib/store';
import { authFetch } from '@/lib/auth-fetch';
import { showToast } from '@/components/Toast';
import { SuiteToolHeader } from '@/components/suite/SuiteToolChrome';

// ── Types ──
interface DebriefEntry {
  id: string;
  company: string;
  role: string;
  roundType: string;
  date: string;
  questions: { text: string; confidence: number; category: string }[];
  overallFeeling: number;
  strengths: string;
  weaknesses: string;
  surprises: string;
  wouldChange: string;
  interviewerVibe: 'warm' | 'neutral' | 'tough';
  followUpSent: boolean;
  outcome?: 'passed' | 'rejected' | 'pending' | 'ghosted';
  createdAt: string;
}

const ROUND_TYPES = [
  { id: 'phone', label: 'Phone Screen', icon: 'call' },
  { id: 'technical', label: 'Technical', icon: 'code' },
  { id: 'behavioral', label: 'Behavioral', icon: 'psychology' },
  { id: 'system_design', label: 'System Design', icon: 'architecture' },
  { id: 'hiring_manager', label: 'Hiring Manager', icon: 'person' },
  { id: 'panel', label: 'Panel', icon: 'groups' },
  { id: 'final', label: 'Final/Onsite', icon: 'business' },
  { id: 'culture', label: 'Culture Fit', icon: 'diversity_3' },
];

const QUESTION_CATEGORIES = [
  'Behavioral', 'Technical', 'System Design', 'Situational',
  'Culture Fit', 'Experience Deep-Dive', 'Brain Teaser', 'Case Study',
];

const OUTCOME_CONFIG = {
  passed: { label: 'Passed ✓', color: '#22c55e', icon: 'check_circle' },
  rejected: { label: 'Rejected', color: '#ef4444', icon: 'cancel' },
  pending: { label: 'Pending', color: '#f59e0b', icon: 'hourglass_top' },
  ghosted: { label: 'Ghosted', color: '#6b7280', icon: 'visibility_off' },
};

function DebriefContent() {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const { user } = useStore();

  const [debriefs, setDebriefs] = useState<DebriefEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'insights'>('list');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Form state
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [roundType, setRoundType] = useState('behavioral');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [questions, setQuestions] = useState<{ text: string; confidence: number; category: string }[]>([
    { text: '', confidence: 50, category: 'Behavioral' },
  ]);
  const [overallFeeling, setOverallFeeling] = useState(3);
  const [strengths, setStrengths] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [surprises, setSurprises] = useState('');
  const [wouldChange, setWouldChange] = useState('');
  const [interviewerVibe, setInterviewerVibe] = useState<'warm' | 'neutral' | 'tough'>('neutral');
  const idempotencyKeyRef = useRef('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadDebriefs();
  }, [user]);

  const loadDebriefs = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/agent/debriefs');
      if (res.ok) {
        const data = await res.json();
        setDebriefs(data.debriefs || []);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  const saveDebrief = async () => {
    if (!company.trim() || !role.trim()) return;
    setSaving(true);
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
    try {
      const res = await authFetch('/api/agent/debriefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company, role, roundType, date, idempotencyKey: idempotencyKeyRef.current,
          questions: questions.filter(q => q.text.trim()),
          overallFeeling, strengths, weaknesses, surprises, wouldChange,
          interviewerVibe, followUpSent: false, outcome: 'pending',
        }),
      });
      if (res.ok) {
        idempotencyKeyRef.current = '';
        showToast('Debrief saved! Your Story Bank will be updated.', 'check_circle');
        setShowForm(false);
        resetForm();
        loadDebriefs();
      } else {
        showToast('Failed to save debrief', 'cancel');
      }
    } catch {
      showToast('Error saving debrief', 'cancel');
    } finally {
      setSaving(false);
    }
  };

  const updateOutcome = async (id: string, outcome: string) => {
    try {
      await authFetch('/api/agent/debriefs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, outcome }),
      });
      setDebriefs(prev => prev.map(d => d.id === id ? { ...d, outcome: outcome as DebriefEntry['outcome'] } : d));
      showToast('Outcome updated', 'check_circle');
    } catch { showToast('Failed to update', 'cancel'); }
  };

  const deleteDebrief = async (id: string) => {
    try {
      const res = await authFetch('/api/agent/debriefs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setDebriefs(prev => prev.filter(d => d.id !== id));
        setConfirmDeleteId(null);
        setExpandedId(null);
        showToast('Debrief deleted', 'check_circle');
      } else {
        showToast('Failed to delete', 'cancel');
      }
    } catch { showToast('Error deleting debrief', 'cancel'); }
  };

  const resetForm = () => {
    idempotencyKeyRef.current = '';
    setCompany(''); setRole(''); setRoundType('behavioral');
    setDate(new Date().toISOString().split('T')[0]);
    setQuestions([{ text: '', confidence: 50, category: 'Behavioral' }]);
    setOverallFeeling(3); setStrengths(''); setWeaknesses('');
    setSurprises(''); setWouldChange(''); setInterviewerVibe('neutral');
  };

  const addQuestion = () => {
    setQuestions(prev => [...prev, { text: '', confidence: 50, category: 'Behavioral' }]);
  };

  // ── Insights computation ──
  const totalDebriefs = debriefs.length;
  const avgConfidence = totalDebriefs > 0
    ? Math.round(debriefs.flatMap(d => d.questions).reduce((a, q) => a + q.confidence, 0) / Math.max(debriefs.flatMap(d => d.questions).length, 1))
    : 0;
  const avgFeeling = totalDebriefs > 0
    ? (debriefs.reduce((a, d) => a + d.overallFeeling, 0) / totalDebriefs).toFixed(1)
    : '0';
  const passRate = totalDebriefs > 0
    ? Math.round(debriefs.filter(d => d.outcome === 'passed').length / Math.max(debriefs.filter(d => d.outcome !== 'pending').length, 1) * 100)
    : 0;

  // Category weakness analysis
  const categoryScores: Record<string, { total: number; count: number }> = {};
  debriefs.forEach(d => d.questions.forEach(q => {
    if (!categoryScores[q.category]) categoryScores[q.category] = { total: 0, count: 0 };
    categoryScores[q.category].total += q.confidence;
    categoryScores[q.category].count += 1;
  }));
  const weakCategories = Object.entries(categoryScores)
    .map(([cat, data]) => ({ category: cat, avg: Math.round(data.total / data.count), count: data.count }))
    .sort((a, b) => a.avg - b.avg);

  const cardBg = isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)';
  const cardBorder = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
  const inputBg = isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)';
  const inputBorder = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';

  return (
    <div className="mobile-app-content min-h-dvh max-w-4xl mx-auto space-y-5 px-4 py-3 md:space-y-6 md:p-6">
      <SuiteToolHeader
        tool="interview-debrief"
        title="Interview Debrief"
        subtitle="Log every interview. Track patterns. Get better."
        icon="rate_review"
        pageHelpId="interview-debrief"
        actions={
          <>
            <div className="flex overflow-hidden rounded-xl" style={{ border: `1px solid ${cardBorder}` }}>
              {(['list', 'insights'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className="px-3 py-1.5 text-xs font-medium capitalize transition-all"
                  style={{
                    background: viewMode === mode ? 'rgba(139,92,246,0.1)' : 'transparent',
                    color: viewMode === mode ? '#8b5cf6' : 'var(--text-muted)',
                  }}
                >{mode}</button>
              ))}
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                if (showForm) resetForm();
                setShowForm(!showForm);
              }}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}
            >
              <span className="material-symbols-rounded text-sm">{showForm ? 'close' : 'add'}</span>
              {showForm ? 'Cancel' : 'New Debrief'}
            </motion.button>
          </>
        }
      />

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Debriefs', value: totalDebriefs, icon: 'rate_review', color: '#8b5cf6' },
          { label: 'Avg Confidence', value: `${avgConfidence}%`, icon: 'trending_up', color: '#3b82f6' },
          { label: 'Avg Feeling', value: `${avgFeeling}/5`, icon: 'mood', color: '#f59e0b' },
          { label: 'Pass Rate', value: `${passRate}%`, icon: 'emoji_events', color: '#22c55e' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="rounded-xl p-3.5"
            style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className="material-symbols-rounded text-[14px]" style={{ color: stat.color }}>{stat.icon}</span>
              <span className="text-[10px] text-[var(--text-muted)]">{stat.label}</span>
            </div>
            <p className="text-xl font-bold text-[var(--text-primary)]">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* New Debrief Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl p-5 space-y-5" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <span className="material-symbols-rounded text-base" style={{ color: '#8b5cf6' }}>edit_note</span>
                Post-Interview Debrief
              </h3>

              {/* Row 1: Company + Role + Date */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-1">Company</label>
                  <input value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Google"
                    className="w-full px-3 py-2 rounded-lg text-sm text-[var(--text-primary)] outline-none"
                    style={{ background: inputBg, border: `1px solid ${inputBorder}` }} />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-1">Role</label>
                  <input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Senior SWE"
                    className="w-full px-3 py-2 rounded-lg text-sm text-[var(--text-primary)] outline-none"
                    style={{ background: inputBg, border: `1px solid ${inputBorder}` }} />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-1">Date</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm text-[var(--text-primary)] outline-none"
                    style={{ background: inputBg, border: `1px solid ${inputBorder}` }} />
                </div>
              </div>

              {/* Round Type */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-2">Round Type</label>
                <div className="flex flex-wrap gap-2">
                  {ROUND_TYPES.map(rt => (
                    <button key={rt.id} onClick={() => setRoundType(rt.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: roundType === rt.id ? 'rgba(139,92,246,0.1)' : inputBg,
                        border: `1px solid ${roundType === rt.id ? '#8b5cf640' : inputBorder}`,
                        color: roundType === rt.id ? '#8b5cf6' : 'var(--text-secondary)',
                      }}
                    >
                      <span className="material-symbols-rounded text-sm">{rt.icon}</span>
                      {rt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Questions Asked */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Questions Asked</label>
                  <button onClick={addQuestion} className="text-[10px] text-[#8b5cf6] font-medium flex items-center gap-0.5">
                    <span className="material-symbols-rounded text-sm">add</span> Add Question
                  </button>
                </div>
                <div className="space-y-3">
                  {questions.map((q, i) => (
                    <div key={i} className="p-3 rounded-lg" style={{ background: inputBg, border: `1px solid ${inputBorder}` }}>
                      <input
                        value={q.text}
                        onChange={e => setQuestions(prev => prev.map((p, j) => j === i ? { ...p, text: e.target.value } : p))}
                        placeholder="What question was asked?"
                        className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none mb-2"
                      />
                      <div className="flex items-center gap-3">
                        <select
                          value={q.category}
                          onChange={e => setQuestions(prev => prev.map((p, j) => j === i ? { ...p, category: e.target.value } : p))}
                          className="px-2 py-1 rounded text-[10px] text-[var(--text-secondary)] outline-none"
                          style={{ background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)', border: `1px solid ${inputBorder}` }}
                        >
                          {QUESTION_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <div className="flex-1 flex items-center gap-2">
                          <span className="text-[10px] text-[var(--text-muted)]">Confidence:</span>
                          <input type="range" min="0" max="100" value={q.confidence}
                            onChange={e => setQuestions(prev => prev.map((p, j) => j === i ? { ...p, confidence: Number(e.target.value) } : p))}
                            className="flex-1 h-1 accent-purple-500" />
                          <span className="text-[10px] font-bold" style={{ color: q.confidence >= 70 ? '#22c55e' : q.confidence >= 40 ? '#f59e0b' : '#ef4444' }}>
                            {q.confidence}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Overall Feeling */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-2">
                  Overall Feeling (1 = terrible, 5 = crushed it)
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setOverallFeeling(n)}
                      className="w-12 h-12 rounded-xl text-lg font-bold transition-all"
                      style={{
                        background: overallFeeling === n ? 'rgba(139,92,246,0.15)' : inputBg,
                        border: `2px solid ${overallFeeling === n ? '#8b5cf6' : inputBorder}`,
                        color: overallFeeling === n ? '#8b5cf6' : 'var(--text-muted)',
                      }}
                    >
                      <span className="material-symbols-rounded text-[18px]">{['sentiment_very_dissatisfied', 'sentiment_dissatisfied', 'sentiment_neutral', 'sentiment_satisfied', 'sentiment_very_satisfied'][n - 1]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Interviewer Vibe */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-2">Interviewer Vibe</label>
                <div className="flex gap-2">
                  {(['warm', 'neutral', 'tough'] as const).map(v => (
                    <button key={v} onClick={() => setInterviewerVibe(v)}
                      className="px-4 py-2 rounded-lg text-xs font-medium capitalize transition-all"
                      style={{
                        background: interviewerVibe === v ? 'rgba(139,92,246,0.1)' : inputBg,
                        border: `1px solid ${interviewerVibe === v ? '#8b5cf640' : inputBorder}`,
                        color: interviewerVibe === v ? '#8b5cf6' : 'var(--text-secondary)',
                      }}
                    >
                      <span className="material-symbols-rounded text-[14px] mr-0.5 align-middle">{v === 'warm' ? 'thermostat' : v === 'neutral' ? 'balance' : 'ac_unit'}</span> {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reflection Fields */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'What went well?', value: strengths, setter: setStrengths, icon: 'thumb_up' },
                  { label: 'What was weak?', value: weaknesses, setter: setWeaknesses, icon: 'trending_down' },
                  { label: 'Any surprises?', value: surprises, setter: setSurprises, icon: 'priority_high' },
                  { label: 'What would you change?', value: wouldChange, setter: setWouldChange, icon: 'sync' },
                ].map(field => (
                  <div key={field.label}>
                    <label className="text-[10px] font-bold text-[var(--text-muted)] block mb-1 flex items-center gap-1"><span className="material-symbols-rounded text-[12px]">{field.icon}</span> {field.label}</label>
                    <textarea value={field.value} onChange={e => field.setter(e.target.value)} rows={2}
                      className="w-full px-3 py-2 rounded-lg text-xs text-[var(--text-primary)] outline-none resize-none"
                      style={{ background: inputBg, border: `1px solid ${inputBorder}` }} />
                  </div>
                ))}
              </div>

              {/* Save */}
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={saveDebrief}
                disabled={saving || !company.trim() || !role.trim()}
                className="w-full py-3 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}
              >
                {saving ? <span className="material-symbols-rounded animate-spin">progress_activity</span> : <span className="material-symbols-rounded text-sm">save</span>}
                {saving ? 'Saving...' : 'Save Debrief'}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Insights View */}
      {viewMode === 'insights' && totalDebriefs > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Weak Categories */}
          <div className="rounded-xl p-5" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
            <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <span className="material-symbols-rounded text-base text-amber-500">insights</span>
              Your Weakest Question Categories
            </h3>
            <p className="text-[11px] text-[var(--text-muted)] mb-4">Focus your prep on these areas — they&apos;re where you scored lowest.</p>
            <div className="space-y-3">
              {weakCategories.slice(0, 5).map((cat, i) => (
                <div key={cat.category} className="flex items-center gap-3">
                  <span className="text-xs font-medium w-32 text-[var(--text-secondary)]">{cat.category}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)' }}>
                    <motion.div
                      className="h-full rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${cat.avg}%` }}
                      transition={{ delay: i * 0.1, duration: 0.5 }}
                      style={{ background: cat.avg >= 70 ? '#22c55e' : cat.avg >= 50 ? '#f59e0b' : '#ef4444' }}
                    />
                  </div>
                  <span className="text-xs font-bold w-10 text-right" style={{ color: cat.avg >= 70 ? '#22c55e' : cat.avg >= 50 ? '#f59e0b' : '#ef4444' }}>
                    {cat.avg}%
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">({cat.count}q)</span>
                </div>
              ))}
            </div>
          </div>

          {/* Trend */}
          <div className="rounded-xl p-5" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
            <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <span className="material-symbols-rounded text-base text-blue-500">show_chart</span>
              Confidence Trend
            </h3>
            <div className="flex items-end gap-1 h-24">
              {debriefs.slice(-12).map((d, i) => {
                const avg = d.questions.length > 0
                  ? Math.round(d.questions.reduce((a, q) => a + q.confidence, 0) / d.questions.length)
                  : 0;
                return (
                  <motion.div
                    key={d.id}
                    initial={{ height: 0 }}
                    animate={{ height: `${avg}%` }}
                    transition={{ delay: i * 0.05, duration: 0.4 }}
                    className="flex-1 rounded-t-sm min-w-[8px]"
                    title={`${d.company} — ${avg}%`}
                    style={{ background: avg >= 70 ? '#22c55e' : avg >= 50 ? '#f59e0b' : '#ef4444', opacity: 0.8 }}
                  />
                );
              })}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] text-[var(--text-muted)]">First</span>
              <span className="text-[9px] text-[var(--text-muted)]">Latest</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Debriefs List */}
      {viewMode === 'list' && (
        <>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                  <div className="flex items-center gap-3 px-5 py-4">
                    <div className="w-10 h-10 rounded-xl bg-[var(--bg-elevated)]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-48 rounded bg-[var(--bg-elevated)]" />
                      <div className="h-3 w-32 rounded bg-[var(--bg-elevated)]" />
                    </div>
                    <div className="h-5 w-16 rounded-full bg-[var(--bg-elevated)]" />
                  </div>
                </div>
              ))}
            </div>
          ) : debriefs.length === 0 && !showForm ? (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-12">
              <div className="max-w-sm mx-auto rounded-2xl p-8 relative overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-purple-500/5" />
                <div className="relative">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                    <span className="material-symbols-rounded text-3xl text-violet-500">rate_review</span>
                  </div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">No Debriefs Yet</h3>
                  <p className="text-sm text-[var(--text-tertiary)] mb-5">
                    After each interview, log a debrief here. Sona will identify your weak spots and help you prepare smarter.
                  </p>
                  <button onClick={() => setShowForm(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                    style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', boxShadow: '0 4px 16px rgba(139,92,246,0.3)' }}>
                    <span className="material-symbols-rounded text-sm">add</span>
                    Log Your First Debrief
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="space-y-3">
              {debriefs.map((d, i) => {
                const isExpanded = expandedId === d.id;
                const avgConf = d.questions.length > 0
                  ? Math.round(d.questions.reduce((a, q) => a + q.confidence, 0) / d.questions.length) : 0;
                const outcomeData = d.outcome ? OUTCOME_CONFIG[d.outcome] : null;
                return (
                  <motion.div
                    key={d.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-xl overflow-hidden"
                    style={{ background: cardBg, border: `1px solid ${isExpanded ? '#8b5cf630' : cardBorder}` }}
                  >
                    <div className="flex items-center justify-between px-5 py-4 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : d.id)}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
                          background: '#8b5cf615', border: '1px solid #8b5cf620',
                        }}>
                          <span className="material-symbols-rounded text-[18px]" style={{ color: '#8b5cf6' }}>
                            {ROUND_TYPES.find(r => r.id === d.roundType)?.icon || 'quiz'}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{d.company} — {d.role}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-[var(--text-muted)]">
                              {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)]">•</span>
                            <span className="text-[10px] text-[var(--text-muted)] capitalize">{d.roundType.replace('_', ' ')}</span>
                            <span className="text-[10px] text-[var(--text-muted)]">•</span>
                            <span className="text-[10px] font-bold" style={{ color: avgConf >= 70 ? '#22c55e' : avgConf >= 50 ? '#f59e0b' : '#ef4444' }}>
                              {avgConf}% conf
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {outcomeData && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{
                            background: `${outcomeData.color}15`, color: outcomeData.color, border: `1px solid ${outcomeData.color}25`,
                          }}>{outcomeData.label}</span>
                        )}
                        <span className="material-symbols-rounded text-[20px]" style={{ color: ['#ef4444', '#f59e0b', '#6b7280', '#22c55e', '#10b981'][d.overallFeeling - 1] }}>{['sentiment_very_dissatisfied', 'sentiment_dissatisfied', 'sentiment_neutral', 'sentiment_satisfied', 'sentiment_very_satisfied'][d.overallFeeling - 1]}</span>
                        <span className="material-symbols-rounded text-[18px] text-[var(--text-muted)] transition-transform"
                          style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>expand_more</span>
                      </div>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden">
                          <div className="px-5 pb-5 pt-2 space-y-4" style={{ borderTop: `1px solid ${cardBorder}` }}>
                            {/* Questions */}
                            {d.questions.length > 0 && (
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-2">Questions ({d.questions.length})</span>
                                <div className="space-y-2">
                                  {d.questions.map((q, qi) => (
                                    <div key={qi} className="flex items-center gap-3 p-2.5 rounded-lg" style={{ background: inputBg }}>
                                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{
                                        background: `${q.confidence >= 70 ? '#22c55e' : q.confidence >= 50 ? '#f59e0b' : '#ef4444'}15`,
                                        color: q.confidence >= 70 ? '#22c55e' : q.confidence >= 50 ? '#f59e0b' : '#ef4444',
                                      }}>{q.confidence}%</span>
                                      <span className="text-xs text-[var(--text-primary)] flex-1">{q.text}</span>
                                      <span className="text-[9px] text-[var(--text-muted)]">{q.category}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Reflections */}
                            <div className="grid grid-cols-2 gap-3">
                              {[
                                { label: 'Strengths', value: d.strengths, icon: 'thumb_up' },
                                { label: 'Weaknesses', value: d.weaknesses, icon: 'trending_down' },
                                { label: 'Surprises', value: d.surprises, icon: 'priority_high' },
                                { label: 'Would Change', value: d.wouldChange, icon: 'sync' },
                              ].filter(f => f.value).map(f => (
                                <div key={f.label}>
                                  <span className="text-[10px] font-bold text-[var(--text-muted)] mb-0.5 flex items-center gap-1"><span className="material-symbols-rounded text-[11px]">{f.icon}</span> {f.label}</span>
                                  <p className="text-xs text-[var(--text-secondary)]">{f.value}</p>
                                </div>
                              ))}
                            </div>

                            {/* Update Outcome */}
                            <div className="flex items-center gap-2 pt-2">
                              <span className="text-[10px] font-bold text-[var(--text-muted)]">Outcome:</span>
                              {Object.entries(OUTCOME_CONFIG).map(([key, cfg]) => (
                                <button key={key} onClick={() => updateOutcome(d.id, key)}
                                  className="text-[10px] px-2 py-1 rounded-lg font-medium transition-all"
                                  style={{
                                    background: d.outcome === key ? `${cfg.color}15` : 'transparent',
                                    color: d.outcome === key ? cfg.color : 'var(--text-muted)',
                                    border: `1px solid ${d.outcome === key ? `${cfg.color}30` : inputBorder}`,
                                  }}>
                                  {cfg.label}
                                </button>
                              ))}
                            </div>

                            {/* Actions Row */}
                            <div className="flex items-center justify-between pt-3" style={{ borderTop: `1px solid ${cardBorder}` }}>
                              <div className="flex items-center gap-2">
                                {/* Story saved badge */}
                                {d.questions?.some(q => q.confidence >= 60) && (
                                  <span className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-full font-medium"
                                    style={{ background: '#f59e0b10', color: '#f59e0b', border: '1px solid #f59e0b20' }}>
                                    <span className="material-symbols-rounded text-[10px]">auto_stories</span>
                                    Story saved ✓
                                  </span>
                                )}
                                {/* Prep link */}
                                {(d.outcome === 'pending' || d.outcome === 'passed') && (
                                  <a href={`/suite/agent?prompt=${encodeURIComponent(`Prep me for my next ${d.roundType?.replace('_', ' ') || ''} interview at ${d.company} for ${d.role}`)}`}
                                    className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-full font-medium hover:opacity-80 transition-opacity"
                                    style={{ background: '#3b82f610', color: '#3b82f6', border: '1px solid #3b82f620' }}
                                    onClick={e => e.stopPropagation()}>
                                    <span className="material-symbols-rounded text-[10px]">school</span>
                                    Prep for Next Round →
                                  </a>
                                )}
                              </div>
                              {/* Delete */}
                              {confirmDeleteId === d.id ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-[var(--text-muted)]">Delete?</span>
                                  <button onClick={(e) => { e.stopPropagation(); deleteDebrief(d.id); }}
                                    className="text-[10px] px-2 py-1 rounded-lg font-bold text-red-500 hover:bg-red-500/10 transition-colors"
                                    style={{ border: '1px solid rgba(239,68,68,0.2)' }}>
                                    Yes, delete
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                                    className="text-[10px] px-2 py-1 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors">
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(d.id); }}
                                  className="text-[10px] flex items-center gap-0.5 px-2 py-1 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/5 transition-all">
                                  <span className="material-symbols-rounded text-[12px]">delete</span>
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Redirect standalone route to Interview Studio debrief review
import { redirect } from 'next/navigation';
export default function InterviewDebriefPage() {
  redirect('/suite/interview-sim?mode=debrief_review');
}
