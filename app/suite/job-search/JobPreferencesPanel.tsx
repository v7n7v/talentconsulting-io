'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/components/ThemeProvider';
import { useStore } from '@/lib/store';
import { analytics } from '@/lib/analytics';
import { useUserTier } from '@/hooks/use-user-tier';
import { resolveAlertConsentHandoff } from '@/lib/sona/alert-consent-handoff';

interface JobPreferences {
  targetRoles: string[];
  preferredCities: string[];
  remotePref: 'remote' | 'hybrid' | 'onsite' | 'any';
  salaryMin: number;
  industries: string[];
  emailNotifications: boolean;
  agentEnabled?: boolean;
  agentMaxPerNight?: number;
  agentMinMatchScore?: number;
  agentExcludeCompanies?: string[];
  agentAutonomyLevel?: 'scout' | 'prepare' | 'review' | 'assist';
  agentDigestEmailEnabled?: boolean;
  agentDigestFrequency?: 'daily' | 'weekly';
  jobAlertsEnabled?: boolean;
  jobAlertsFrequency?: 'daily' | 'weekly' | 'biweekly';
}

const INDUSTRIES = [
  { name: 'Technology', icon: 'code' },
  { name: 'Healthcare', icon: 'health_and_safety' },
  { name: 'Finance', icon: 'account_balance' },
  { name: 'Education', icon: 'school' },
  { name: 'Marketing', icon: 'campaign' },
  { name: 'Consulting', icon: 'handshake' },
  { name: 'Government', icon: 'assured_workload' },
  { name: 'Retail', icon: 'storefront' },
  { name: 'Manufacturing', icon: 'precision_manufacturing' },
  { name: 'Media', icon: 'movie' },
  { name: 'Cybersecurity', icon: 'shield' },
  { name: 'Data Science', icon: 'analytics' },
  { name: 'Legal', icon: 'gavel' },
  { name: 'Real Estate', icon: 'apartment' },
  { name: 'Nonprofit', icon: 'volunteer_activism' },
];

const SALARY_STEPS = [
  { value: 0, label: 'Any' },
  { value: 40, label: '$40k' },
  { value: 60, label: '$60k' },
  { value: 80, label: '$80k' },
  { value: 100, label: '$100k' },
  { value: 120, label: '$120k' },
  { value: 150, label: '$150k' },
  { value: 200, label: '$200k+' },
];

const WORK_STYLES = [
  { value: 'any' as const, label: 'Any', icon: 'language', desc: 'All types' },
  { value: 'remote' as const, label: 'Remote', icon: 'home', desc: 'Work from anywhere' },
  { value: 'hybrid' as const, label: 'Hybrid', icon: 'sync_alt', desc: 'Mix of both' },
  { value: 'onsite' as const, label: 'On-site', icon: 'apartment', desc: 'In office' },
];

const SONA_PICK_CADENCES = [
  { value: 'weekly' as const, label: 'Weekly', icon: 'calendar_month', desc: 'Curated Sona Picks arrive every Monday.' },
  { value: 'daily' as const, label: 'Daily (weekdays)', icon: 'today', desc: 'Fresh Sona Picks arrive Monday through Friday.' },
];

interface Props {
  onPrefsLoaded: (prefs: JobPreferences | null) => void;
  onClose: () => void;
  visible: boolean;
  suggestedTargetRole?: string;
}

type JobAlertDeliveryStatus = 'consent_required' | 'pending' | 'ready' | 'sending' | 'accepted' | 'delivered' | 'delayed' | 'failed';

function formatJobAlertDeliveryTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function PreferenceSwitch({
  id,
  checked,
  label,
  onChange,
  isLight,
  disabled = false,
}: {
  id?: string;
  checked: boolean;
  label: string;
  onChange: () => void;
  isLight: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className="relative grid h-11 min-w-[44px] w-12 shrink-0 place-items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-45"
    >
      <span
        className="absolute h-6 w-11 rounded-full transition-colors duration-200"
        style={{
          background: checked
            ? 'linear-gradient(135deg, #2563eb, #06b6d4)'
            : isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)',
        }}
        aria-hidden="true"
      />
      <motion.span
        className="absolute left-0 h-4 w-4 rounded-full bg-white shadow-sm"
        animate={{ x: checked ? 28 : 4 }}
        transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }}
        aria-hidden="true"
      />
    </button>
  );
}

export default function JobPreferencesPanel({ onPrefsLoaded, onClose, visible, suggestedTargetRole }: Props) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const user = useStore((s) => s.user);
  const { tier } = useUserTier();

  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [roleInput, setRoleInput] = useState('');
  const [preferredCities, setPreferredCities] = useState<string[]>([]);
  const [cityInput, setCityInput] = useState('');
  const [remotePref, setRemotePref] = useState<'remote' | 'hybrid' | 'onsite' | 'any'>('any');
  const [salaryMin, setSalaryMin] = useState(0);
  const [industries, setIndustries] = useState<string[]>([]);
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [agentMaxPerNight, setAgentMaxPerNight] = useState(5);
  const [agentMinMatchScore, setAgentMinMatchScore] = useState(70);
  const [agentExcludeCompanies, setAgentExcludeCompanies] = useState<string[]>([]);
  const [agentAutonomyLevel, setAgentAutonomyLevel] = useState<'scout' | 'prepare' | 'review' | 'assist'>('prepare');
  const [agentDigestEmailEnabled, setAgentDigestEmailEnabled] = useState(false);
  const [agentDigestFrequency, setAgentDigestFrequency] = useState<'daily' | 'weekly'>('daily');
  const [excludeInput, setExcludeInput] = useState('');
  const [jobAlertsEnabled, setJobAlertsEnabled] = useState(false);
  const [jobAlertsFrequency, setJobAlertsFrequency] = useState<'daily' | 'weekly'>('weekly');
  const [jobAlertDeliveryStatus, setJobAlertDeliveryStatus] = useState<JobAlertDeliveryStatus>('consent_required');
  const [jobAlertDeliveryMessage, setJobAlertDeliveryMessage] = useState('Email delivery stays off until you enable Sona Picks.');
  const [providerPauseAt, setProviderPauseAt] = useState<string | null>(null);
  const [resumeProviderPausedEmail, setResumeProviderPausedEmail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [preferenceAccess, setPreferenceAccess] = useState<'loading' | 'ready' | 'sign_in' | 'unavailable'>('loading');
  const [preferenceLoadAttempt, setPreferenceLoadAttempt] = useState(0);
  const preferenceLoadRequestRef = useRef(0);
  const [focusedSection, setFocusedSection] = useState<string | null>(null);
  const roleRef = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);

  const AGENT_TIER_LIMITS: Record<string, number> = { free: 0, pro: 0, studio: 5, god: 50 };
  const isMaxPlan = tier === 'studio' || tier === 'god';
  const alertConsentHandoff = resolveAlertConsentHandoff({
    loaded,
    canPersist: preferenceAccess === 'ready',
    saving,
    targetRoles,
    roleInput,
    suggestedTargetRole,
  });

  // Load prefs from Firestore
  useEffect(() => {
    if (!user) {
      setPreferenceAccess('sign_in');
      setLoaded(true);
      return;
    }
    const token = (user as any).accessToken || (user as any).stsTokenManager?.accessToken;
    if (!token) {
      setPreferenceAccess('sign_in');
      setLoaded(true);
      return;
    }
    const requestId = preferenceLoadRequestRef.current + 1;
    preferenceLoadRequestRef.current = requestId;
    setLoaded(false);
    setPreferenceAccess('loading');

    fetch('/api/jobs/preferences', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (requestId !== preferenceLoadRequestRef.current) return;
        if (data.success && data.preferences) {
          const p = data.preferences;
          setTargetRoles(p.targetRoles || []);
          setPreferredCities(p.preferredCities || []);
          setRemotePref(p.remotePref || 'any');
          setSalaryMin(p.salaryMin || 0);
          setIndustries(p.industries || []);
          setEmailNotifications(p.emailNotifications === true);
          setAgentEnabled(p.agentEnabled || false);
          setAgentMaxPerNight(p.agentMaxPerNight || 5);
          setAgentMinMatchScore(p.agentMinMatchScore || 70);
          setAgentExcludeCompanies(p.agentExcludeCompanies || []);
          setAgentAutonomyLevel(p.agentAutonomyLevel || 'prepare');
          setAgentDigestEmailEnabled(p.agentDigestEmailEnabled === true);
          setAgentDigestFrequency(p.agentDigestFrequency || 'daily');
          setJobAlertsEnabled(p.jobAlertsEnabled || false);
          setJobAlertsFrequency(p.jobAlertsFrequency === 'daily' ? 'daily' : 'weekly');
          const delivery = data.delivery;
          const deliveryStatus = delivery?.status as JobAlertDeliveryStatus | undefined;
          if (deliveryStatus) setJobAlertDeliveryStatus(deliveryStatus);
          setProviderPauseAt(typeof delivery?.pausedAt === 'string' ? delivery.pausedAt : null);
          setResumeProviderPausedEmail(false);
          const lastAccepted = formatJobAlertDeliveryTime(delivery?.lastAcceptedAt || delivery?.lastSentAt);
          const lastDelivered = formatJobAlertDeliveryTime(delivery?.lastDeliveredAt);
          if (deliveryStatus === 'delivered' && lastDelivered) {
            setJobAlertDeliveryMessage(`Delivered to your email server ${lastDelivered} with ${delivery?.lastJobCount || 0} picks.`);
          } else if (deliveryStatus === 'accepted' && lastAccepted) {
            setJobAlertDeliveryMessage(`Accepted by the email provider ${lastAccepted}. Delivery confirmation is pending.`);
          } else if (deliveryStatus === 'delayed') {
            setJobAlertDeliveryMessage('Your email provider reports a delay. Your recommendations remain in Talent Studio.');
          } else if (deliveryStatus === 'failed') {
            setJobAlertDeliveryMessage(delivery?.error || delivery?.pausedReason || 'The last digest failed. Your recommendations stayed in Talent Studio.');
          } else if (deliveryStatus === 'ready') {
            setJobAlertDeliveryMessage('Email consent is active. Sona will use the cadence you choose.');
          } else if (deliveryStatus === 'sending') {
            setJobAlertDeliveryMessage('A Sona Picks digest is being sent now.');
          }
          setLoaded(true);
          setPreferenceAccess('ready');
          if (!data.isNew) onPrefsLoaded(p);
          else onPrefsLoaded(null);
        } else {
          setPreferenceAccess('unavailable');
          setJobAlertDeliveryMessage('Email controls could not be loaded. Nothing was changed or sent.');
          setLoaded(true);
        }
      })
      .catch(() => {
        if (requestId !== preferenceLoadRequestRef.current) return;
        setPreferenceAccess('unavailable');
        setJobAlertDeliveryMessage('Email controls could not be loaded. Nothing was changed or sent.');
        setLoaded(true);
      });
    return () => {
      if (preferenceLoadRequestRef.current === requestId) preferenceLoadRequestRef.current += 1;
    };
  }, [preferenceLoadAttempt, user]);

  useEffect(() => {
    if (!isMaxPlan && jobAlertsFrequency !== 'weekly') {
      setJobAlertsFrequency('weekly');
    }
  }, [isMaxPlan, jobAlertsFrequency]);

  useEffect(() => {
    if (alertConsentHandoff.suggestedRole) setRoleInput(alertConsentHandoff.suggestedRole);
  }, [alertConsentHandoff.suggestedRole]);

  const addRole = () => {
    const v = roleInput.trim();
    if (v && !targetRoles.includes(v) && targetRoles.length < 10) {
      setTargetRoles([...targetRoles, v]);
      setRoleInput('');
    }
  };

  const addCity = () => {
    const v = cityInput.trim();
    if (v && !preferredCities.includes(v) && preferredCities.length < 10) {
      setPreferredCities([...preferredCities, v]);
      setCityInput('');
    }
  };

  const toggleIndustry = (ind: string) => {
    setIndustries(prev =>
      prev.includes(ind) ? prev.filter(i => i !== ind) : [...prev, ind].slice(0, 10)
    );
  };

  const savePrefs = async () => {
    setSaving(true);
    try {
      // Auto-commit any pending role/city input
      let roles = targetRoles;
      const pendingRole = roleInput.trim();
      if (pendingRole && !roles.includes(pendingRole) && roles.length < 10) {
        roles = [...roles, pendingRole];
        setTargetRoles(roles);
        setRoleInput('');
      }
      let cities = preferredCities;
      const pendingCity = cityInput.trim();
      if (pendingCity && !cities.includes(pendingCity) && cities.length < 10) {
        cities = [...cities, pendingCity];
        setPreferredCities(cities);
        setCityInput('');
      }
      const prefs: JobPreferences = {
        targetRoles: roles, preferredCities: cities, remotePref, salaryMin, industries, emailNotifications,
        agentEnabled: isMaxPlan ? agentEnabled : false, agentMaxPerNight, agentMinMatchScore, agentExcludeCompanies,
        agentAutonomyLevel, agentDigestEmailEnabled: isMaxPlan ? agentDigestEmailEnabled : false, agentDigestFrequency,
        jobAlertsEnabled, jobAlertsFrequency: isMaxPlan ? jobAlertsFrequency : 'weekly',
      };
      const token = user ? ((user as any).accessToken || (user as any).stsTokenManager?.accessToken) : null;
      if (!token) {
        onPrefsLoaded(prefs);
        onClose();
        return;
      }
      const res = await fetch('/api/jobs/preferences', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...prefs,
          jobAlertsConsentAcknowledged: jobAlertsEnabled,
          jobAlertsConsentSource: 'job_preferences',
          agentDigestConsentAcknowledged: isMaxPlan && agentDigestEmailEnabled,
          agentDigestConsentSource: 'job_preferences',
          resumeAfterProviderPause: resumeProviderPausedEmail,
          providerPauseAt,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (resumeProviderPausedEmail) {
          setProviderPauseAt(null);
          setResumeProviderPausedEmail(false);
        }
        onPrefsLoaded(prefs);
        analytics.preferencesSaved(roles.length, cities.length);
        onClose();
      } else if (data.code === 'EMAIL_CONSENT_REQUIRED'
        || data.code === 'AGENT_DIGEST_CONSENT_REQUIRED'
        || data.code === 'EMAIL_RESUME_CONFIRMATION_REQUIRED') {
        setJobAlertDeliveryStatus('consent_required');
        setJobAlertDeliveryMessage(data.error || 'Confirm email delivery before enabling Sona Picks.');
      } else {
        setJobAlertDeliveryStatus('failed');
        setJobAlertDeliveryMessage(data.error || 'These controls could not be saved. Nothing was sent.');
      }
    } catch (e) {
      console.error('Failed to save preferences:', e);
      setJobAlertDeliveryStatus('failed');
      setJobAlertDeliveryMessage('These controls could not be saved. Nothing was sent.');
    } finally {
      setSaving(false);
    }
  };

  // Completion score
  const completionScore = [
    targetRoles.length > 0,
    preferredCities.length > 0,
    remotePref !== 'any',
    salaryMin > 0,
    industries.length > 0,
  ].filter(Boolean).length;

  if (!visible) return null;

  // Dynamic color based on salary position
  const salaryPct = salaryMin / 200;
  const salaryColor = salaryPct <= 0 ? { main: '#10b981', glow: 'rgba(16,185,129,0.4)', label: 'text-emerald-500', bg: 'bg-emerald-500' }
    : salaryPct <= 0.25 ? { main: '#10b981', glow: 'rgba(16,185,129,0.4)', label: 'text-emerald-500', bg: 'bg-emerald-500' }
    : salaryPct <= 0.40 ? { main: '#06b6d4', glow: 'rgba(6,182,212,0.4)', label: 'text-cyan-500', bg: 'bg-cyan-500' }
    : salaryPct <= 0.60 ? { main: '#3b82f6', glow: 'rgba(59,130,246,0.4)', label: 'text-blue-500', bg: 'bg-blue-500' }
    : salaryPct <= 0.75 ? { main: '#6366f1', glow: 'rgba(99,102,241,0.4)', label: 'text-indigo-500', bg: 'bg-indigo-500' }
    : { main: '#f59e0b', glow: 'rgba(245,158,11,0.4)', label: 'text-amber-500', bg: 'bg-amber-500' };
  const nearestSalaryStep = SALARY_STEPS.reduce((closest, step) =>
    Math.abs(step.value - salaryMin) < Math.abs(closest.value - salaryMin) ? step : closest
  , SALARY_STEPS[0]);
  const salaryStepIndex = Math.max(0, SALARY_STEPS.findIndex(step => step.value === nearestSalaryStep.value));
  const salaryProgress = salaryStepIndex / Math.max(1, SALARY_STEPS.length - 1);
  const salaryPersona = salaryMin === 0
    ? { label: 'Open to the right role', hint: 'Sona will rank fit before compensation.', icon: 'all_inclusive' }
    : salaryMin <= 60
      ? { label: 'Foundation range', hint: 'Good for early-career and growth searches.', icon: 'moving' }
      : salaryMin <= 100
        ? { label: 'Market-smart target', hint: 'Balanced for strong mid-level roles.', icon: 'query_stats' }
        : salaryMin <= 150
          ? { label: 'Senior compensation lane', hint: 'Prioritizes high-fit senior opportunities.', icon: 'workspace_premium' }
          : { label: 'Executive stretch filter', hint: 'Sona will be selective about compensation quality.', icon: 'diamond' };
  const salaryAnnualDisplay = salaryMin === 0 ? 'Open' : `$${salaryMin}k${salaryMin >= 200 ? '+' : '+'}`;
  const salaryMonthlyDisplay = salaryMin === 0 ? 'No floor' : `$${Math.round(salaryMin * 1000 / 12).toLocaleString()}/mo`;
  const salaryBiweeklyDisplay = salaryMin === 0 ? 'Flexible' : `$${Math.round(salaryMin * 1000 / 26).toLocaleString()}/paycheck`;

  const cardBg = isLight
    ? 'rgba(255,255,255,0.8)'
    : 'rgba(15,23,42,0.7)';
  const cardBorder = isLight
    ? 'rgba(6,182,212,0.12)'
    : 'rgba(6,182,212,0.15)';
  const sectionBg = isLight
    ? 'rgba(0,0,0,0.02)'
    : 'rgba(255,255,255,0.025)';
  const sectionBorder = isLight
    ? 'rgba(0,0,0,0.06)'
    : 'rgba(255,255,255,0.06)';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10, height: 0 }}
        animate={{ opacity: 1, y: 0, height: 'auto' }}
        exit={{ opacity: 0, y: -10, height: 0 }}
        transition={{ type: 'spring', bounce: 0.1, duration: 0.4 }}
        className="overflow-hidden mb-4"
      >
        <div
          className="rounded-2xl border backdrop-blur-xl overflow-hidden"
          style={{ background: cardBg, borderColor: cardBorder }}
        >
          {/* ── Header ── */}
          <div className="relative px-5 pt-5 pb-4">
            {/* Ambient glow */}
            <div className="absolute top-0 left-1/4 w-1/2 h-24 rounded-full blur-[60px] pointer-events-none" style={{
              background: isLight ? 'rgba(6,182,212,0.06)' : 'rgba(6,182,212,0.08)',
            }} />

            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                  <span className="material-symbols-rounded text-white text-xl">tune</span>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[var(--text-primary)] leading-tight">Search Profile</h3>
                  <p className="text-[11px] text-[var(--text-tertiary)]">Tell Sona what you're looking for</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Completion ring */}
                <div className="relative flex items-center gap-1.5">
                  <svg width="28" height="28" viewBox="0 0 28 28" className="transform -rotate-90">
                    <circle cx="14" cy="14" r="11" fill="none" stroke={isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'} strokeWidth="2.5" />
                    <circle cx="14" cy="14" r="11" fill="none" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round"
                      strokeDasharray={`${(completionScore / 5) * 69.1} 69.1`}
                      className="transition-all duration-500"
                    />
                  </svg>
                  <span className="text-[10px] font-bold text-[var(--text-tertiary)]">{completionScore}/5</span>
                </div>

                <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-[var(--bg-surface)] transition-colors">
                  <span className="material-symbols-rounded text-[var(--text-tertiary)] text-lg">close</span>
                </button>
              </div>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="px-5 pb-5 space-y-4">

            {/* Row 1: Roles + Cities — 2 column */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              {/* Target Roles */}
              <div
                className="rounded-xl p-3 transition-all duration-200"
                style={{
                  background: sectionBg,
                  border: `1px solid ${focusedSection === 'roles' ? 'rgba(6,182,212,0.35)' : sectionBorder}`,
                  boxShadow: focusedSection === 'roles' ? '0 0 0 3px rgba(6,182,212,0.08)' : 'none',
                }}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="material-symbols-rounded text-[14px] text-cyan-500">work</span>
                  <span className="text-xs font-semibold text-[var(--text-primary)]">Target Roles</span>
                  {targetRoles.length > 0 && (
                    <span className="ml-auto px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-cyan-500/10 text-cyan-500">{targetRoles.length}</span>
                  )}
                </div>

                {/* Tags inside input area */}
                <div
                  className="min-h-[36px] flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-text"
                  style={{
                    background: isLight ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'}`,
                  }}
                  onClick={() => roleRef.current?.focus()}
                >
                  <AnimatePresence mode="popLayout">
                    {targetRoles.map(r => (
                      <motion.span
                        key={r}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-cyan-500/12 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 shrink-0"
                      >
                        {r}
                        <button
                          onClick={(e) => { e.stopPropagation(); setTargetRoles(prev => prev.filter(x => x !== r)); }}
                          className="hover:text-red-400 transition-colors ml-0.5"
                        >
                          <span className="material-symbols-rounded text-[12px]">close</span>
                        </button>
                      </motion.span>
                    ))}
                  </AnimatePresence>
                  <input
                    ref={roleRef}
                    value={roleInput}
                    onChange={e => setRoleInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addRole())}
                    onFocus={() => setFocusedSection('roles')}
                    onBlur={() => { addRole(); setFocusedSection(null); }}
                    placeholder={targetRoles.length === 0 ? 'Software Engineer, PM...' : 'Add more...'}
                    className="flex-1 min-w-[80px] bg-transparent text-[12px] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none"
                  />
                </div>
              </div>

              {/* Preferred Cities */}
              <div
                className="rounded-xl p-3 transition-all duration-200"
                style={{
                  background: sectionBg,
                  border: `1px solid ${focusedSection === 'cities' ? 'rgba(16,185,129,0.35)' : sectionBorder}`,
                  boxShadow: focusedSection === 'cities' ? '0 0 0 3px rgba(16,185,129,0.08)' : 'none',
                }}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="material-symbols-rounded text-[14px] text-emerald-500">location_on</span>
                  <span className="text-xs font-semibold text-[var(--text-primary)]">Preferred Cities</span>
                  {preferredCities.length > 0 && (
                    <span className="ml-auto px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-emerald-500/10 text-emerald-500">{preferredCities.length}</span>
                  )}
                </div>

                <div
                  className="min-h-[36px] flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-text"
                  style={{
                    background: isLight ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'}`,
                  }}
                  onClick={() => cityRef.current?.focus()}
                >
                  <AnimatePresence mode="popLayout">
                    {preferredCities.map(c => (
                      <motion.span
                        key={c}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0"
                      >
                        {c}
                        <button
                          onClick={(e) => { e.stopPropagation(); setPreferredCities(prev => prev.filter(x => x !== c)); }}
                          className="hover:text-red-400 transition-colors ml-0.5"
                        >
                          <span className="material-symbols-rounded text-[12px]">close</span>
                        </button>
                      </motion.span>
                    ))}
                  </AnimatePresence>
                  <input
                    ref={cityRef}
                    value={cityInput}
                    onChange={e => setCityInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCity())}
                    onFocus={() => setFocusedSection('cities')}
                    onBlur={() => setFocusedSection(null)}
                    placeholder={preferredCities.length === 0 ? 'New York, Remote...' : 'Add more...'}
                    className="flex-1 min-w-[80px] bg-transparent text-[12px] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Row 2: Work Style */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="material-symbols-rounded text-[14px] text-cyan-500">laptop_mac</span>
                <span className="text-xs font-semibold text-[var(--text-primary)]">Work Style</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {WORK_STYLES.map(ws => {
                  const isActive = remotePref === ws.value;
                  return (
                    <motion.button
                      key={ws.value}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setRemotePref(ws.value)}
                      className="relative flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl text-center transition-all duration-200"
                      style={{
                        background: isActive
                          ? isLight ? 'rgba(6,182,212,0.08)' : 'rgba(6,182,212,0.12)'
                          : sectionBg,
                        border: `1.5px solid ${isActive ? 'rgba(6,182,212,0.4)' : sectionBorder}`,
                        boxShadow: isActive ? '0 0 0 3px rgba(6,182,212,0.08), 0 2px 8px rgba(6,182,212,0.1)' : 'none',
                      }}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="workStyleIndicator"
                          className="absolute inset-0 rounded-xl border-2 border-cyan-500/40"
                          transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                        />
                      )}
                      <span className={`material-symbols-rounded text-xl ${isActive ? 'text-cyan-500' : 'text-[var(--text-tertiary)]'}`}>
                        {ws.icon}
                      </span>
                      <span className={`text-[11px] font-semibold ${isActive ? 'text-cyan-500' : 'text-[var(--text-secondary)]'}`}>
                        {ws.label}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Row 3: Salary — Compensation Target Console */}
            <div
              className="rounded-2xl p-3.5 overflow-hidden"
              style={{
                background: isLight
                  ? 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(240,253,250,0.72))'
                  : 'linear-gradient(135deg, rgba(15,23,42,0.9), rgba(6,30,42,0.74))',
                border: `1px solid ${salaryMin > 0 ? 'rgba(16,185,129,0.24)' : sectionBorder}`,
                boxShadow: salaryMin > 0 ? `0 14px 34px ${salaryColor.glow.replace('0.4', '0.12')}` : 'none',
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{
                      background: salaryMin > 0 ? `${salaryColor.main}18` : 'rgba(16,185,129,0.1)',
                      color: salaryMin > 0 ? salaryColor.main : '#10b981',
                    }}
                  >
                    <span className="material-symbols-rounded text-[19px]">{salaryPersona.icon}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-semibold text-[var(--text-primary)]">Compensation Target</span>
                    <span className="block text-[10px] text-[var(--text-tertiary)]">Tap a band. No dragging needed.</span>
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={salaryAnnualDisplay}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="text-right"
                  >
                    <div className="text-[28px] leading-none font-semibold tracking-tight text-[var(--text-primary)] tabular-nums">
                      {salaryAnnualDisplay}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] mt-1">
                      minimum annual
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              <div
                className="grid grid-cols-2 gap-2 mb-3"
              >
                <div
                  className="rounded-xl px-3 py-2"
                  style={{
                    background: isLight ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.045)',
                    border: `1px solid ${isLight ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.07)'}`,
                  }}
                >
                  <span className="block text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Monthly</span>
                  <span className="block text-[12px] font-semibold text-[var(--text-primary)] mt-0.5">{salaryMonthlyDisplay}</span>
                </div>
                <div
                  className="rounded-xl px-3 py-2"
                  style={{
                    background: isLight ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.045)',
                    border: `1px solid ${isLight ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.07)'}`,
                  }}
                >
                  <span className="block text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Biweekly</span>
                  <span className="block text-[12px] font-semibold text-[var(--text-primary)] mt-0.5">{salaryBiweeklyDisplay}</span>
                </div>
              </div>

              <div className="relative mb-3 px-1.5">
                <div
                  className="absolute left-4 right-4 top-1/2 h-[2px] -translate-y-1/2 rounded-full"
                  style={{ background: isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.09)' }}
                />
                <motion.div
                  className="absolute left-4 top-1/2 h-[2px] -translate-y-1/2 rounded-full"
                  style={{ background: `linear-gradient(90deg, #10b981, ${salaryColor.main})` }}
                  animate={{ width: `calc((100% - 2rem) * ${salaryProgress})` }}
                  transition={{ type: 'spring', bounce: 0.16, duration: 0.45 }}
                />
                <div className="relative grid grid-cols-8 gap-1">
                  {SALARY_STEPS.map((step, index) => {
                    const isActive = nearestSalaryStep.value === step.value;
                    const isPast = index <= salaryStepIndex;
                    return (
                      <button
                        key={step.value}
                        type="button"
                        onClick={() => setSalaryMin(step.value)}
                        aria-pressed={isActive}
                        className="group flex flex-col items-center gap-1 focus:outline-none"
                      >
                        <motion.span
                          className="relative z-10 flex h-8 w-8 items-center justify-center rounded-xl text-[10px] font-semibold transition-colors"
                          animate={{
                            scale: isActive ? 1.06 : 1,
                            backgroundColor: isActive
                              ? salaryColor.main
                              : isPast
                                ? isLight ? 'rgba(16,185,129,0.13)' : 'rgba(16,185,129,0.16)'
                                : isLight ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.06)',
                            color: isActive ? '#ffffff' : isPast ? salaryColor.main : isLight ? '#6b7280' : '#94a3b8',
                          }}
                          transition={{ type: 'spring', bounce: 0.22, duration: 0.32 }}
                          style={{
                            border: `1px solid ${isActive ? salaryColor.main : isPast ? 'rgba(16,185,129,0.2)' : sectionBorder}`,
                            boxShadow: isActive ? `0 8px 20px ${salaryColor.glow}` : 'none',
                          }}
                        >
                          {step.value === 0 ? <span className="material-symbols-rounded text-[15px]">all_inclusive</span> : index}
                        </motion.span>
                        <span className={`text-[8px] font-semibold whitespace-nowrap transition-colors ${
                          isActive ? salaryColor.label : 'text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]'
                        }`}>
                          {step.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <motion.div
                key={salaryPersona.label}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 rounded-xl px-3 py-2"
                style={{
                  background: salaryMin > 0
                    ? isLight ? `${salaryColor.main}0f` : `${salaryColor.main}14`
                    : isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.1)',
                  border: `1px solid ${salaryMin > 0 ? `${salaryColor.main}2e` : 'rgba(16,185,129,0.18)'}`,
                }}
              >
                <span className="material-symbols-rounded text-[15px] mt-0.5" style={{ color: salaryColor.main }}>auto_awesome</span>
                <div>
                  <p className="text-[11px] font-semibold text-[var(--text-primary)]">{salaryPersona.label}</p>
                  <p className="text-[10px] leading-relaxed text-[var(--text-tertiary)]">{salaryPersona.hint}</p>
                </div>
              </motion.div>
            </div>

            {/* Row 4: Industries */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="material-symbols-rounded text-[14px] text-cyan-500">category</span>
                <span className="text-xs font-semibold text-[var(--text-primary)]">Industries</span>
                {industries.length > 0 && (
                  <span className="ml-1 text-[10px] text-[var(--text-tertiary)]">{industries.length} selected</span>
                )}
              </div>

              {/* Dropdown */}
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) toggleIndustry(e.target.value);
                }}
                className="w-full h-9 px-3 rounded-lg text-[12px] text-[var(--text-primary)] cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-all"
                style={{
                  background: isLight ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <option value="" disabled>Select industries...</option>
                {INDUSTRIES.filter(ind => !industries.includes(ind.name)).map(ind => (
                  <option key={ind.name} value={ind.name}>{ind.name}</option>
                ))}
                {INDUSTRIES.filter(ind => !industries.includes(ind.name)).length === 0 && (
                  <option value="" disabled>All industries selected</option>
                )}
              </select>

              {/* Selected Tags */}
              {industries.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <AnimatePresence mode="popLayout">
                    {industries.map(ind => {
                      const icon = INDUSTRIES.find(i => i.name === ind)?.icon || 'category';
                      return (
                        <motion.span
                          key={ind}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border shrink-0"
                          style={{
                            background: isLight ? 'rgba(6,182,212,0.08)' : 'rgba(6,182,212,0.12)',
                            borderColor: 'rgba(6,182,212,0.25)',
                            color: '#06b6d4',
                          }}
                        >
                          <span className="material-symbols-rounded text-[12px]">{icon}</span>
                          {ind}
                          <button
                            onClick={() => toggleIndustry(ind)}
                            className="hover:text-red-400 transition-colors ml-0.5"
                          >
                            <span className="material-symbols-rounded text-[12px]">close</span>
                          </button>
                        </motion.span>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Row 5: Email notifications */}
            <div
              className="flex items-center justify-between p-3 rounded-xl"
              style={{ background: sectionBg, border: `1px solid ${sectionBorder}` }}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{
                  background: isLight ? 'rgba(6,182,212,0.08)' : 'rgba(6,182,212,0.1)',
                }}>
                  <span className="material-symbols-rounded text-cyan-500 text-base">notifications_active</span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[var(--text-primary)]">Email Notifications</p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">Allow Sona Picks and digest emails to reach your inbox</p>
                </div>
              </div>
              <PreferenceSwitch
                checked={emailNotifications}
                label="Email notifications"
                isLight={isLight}
                disabled={alertConsentHandoff.controlsDisabled}
                onChange={() => {
                  const next = !emailNotifications;
                  setEmailNotifications(next);
                  if (!next && jobAlertsEnabled) {
                    setResumeProviderPausedEmail(false);
                    setJobAlertDeliveryStatus('consent_required');
                    setJobAlertDeliveryMessage('Email delivery is paused. Your recommendations remain in Talent Studio.');
                  } else if (next && jobAlertsEnabled) {
                    setResumeProviderPausedEmail(Boolean(providerPauseAt));
                    setJobAlertDeliveryStatus('pending');
                    setJobAlertDeliveryMessage(providerPauseAt
                      ? 'Email was paused by the provider. Saving will record a new consent before delivery resumes.'
                      : 'Email delivery will resume when you save these controls.');
                  }
                }}
              />
            </div>

            {/* ── Sona Agent Section ── */}
            <div
              className="p-4 rounded-xl border"
              style={{
                background: agentEnabled
                  ? (isLight ? 'rgba(6,182,212,0.04)' : 'rgba(6,182,212,0.06)')
                  : (isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)'),
                borderColor: agentEnabled
                  ? (isLight ? 'rgba(6,182,212,0.2)' : 'rgba(6,182,212,0.15)')
                  : (isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'),
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{
                    background: agentEnabled
                      ? 'linear-gradient(135deg, rgba(6,182,212,0.2), rgba(16,185,129,0.2))'
                      : (isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'),
                  }}>
                    <span className="material-symbols-rounded text-base" style={{ color: agentEnabled ? '#06b6d4' : 'var(--text-muted)' }}>smart_toy</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-primary)]">Sona Agent</p>
                    <p className="text-[10px] text-[var(--text-tertiary)]">
                      {!isMaxPlan ? 'Talent Max enables proactive scouting' : `${AGENT_TIER_LIMITS[tier] || 5}/night · Max workflow`}
                    </p>
                  </div>
                </div>
                <PreferenceSwitch
                  checked={isMaxPlan && agentEnabled}
                  label="Sona Agent"
                  isLight={isLight}
                  onChange={() => setAgentEnabled(!agentEnabled)}
                  disabled={!isMaxPlan}
                />
              </div>

              {!isMaxPlan && (
                <a
                  href="/suite/upgrade?plan=studio"
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)]"
                >
                  <span className="material-symbols-rounded text-[16px]" aria-hidden="true">workspace_premium</span>
                  Unlock proactive Sona
                </a>
              )}

              <AnimatePresence>
                {isMaxPlan && agentEnabled && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden space-y-3 pt-3 border-t" style={{ borderColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' }}
                  >
                    {/* Max per night */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[var(--text-secondary)]">Max per night</span>
                      <div className="flex items-center gap-1">
                        {[1, 3, 5].map(n => (
                          <button
                            key={n}
                            onClick={() => setAgentMaxPerNight(n)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all"
                            style={{
                              background: agentMaxPerNight === n ? 'rgba(6,182,212,0.15)' : 'transparent',
                              color: agentMaxPerNight === n ? '#06b6d4' : 'var(--text-muted)',
                              border: agentMaxPerNight === n ? '1px solid rgba(6,182,212,0.25)' : '1px solid transparent',
                            }}
                          >{n}</button>
                        ))}
                      </div>
                    </div>

                    {/* Min match score */}
	                    <div className="flex items-center justify-between">
	                      <span className="text-[11px] text-[var(--text-secondary)]">Min match score</span>
	                      <div className="flex items-center gap-1">
                        {[60, 70, 80, 90].map(n => (
                          <button
                            key={n}
                            onClick={() => setAgentMinMatchScore(n)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all"
                            style={{
                              background: agentMinMatchScore === n ? 'rgba(6,182,212,0.15)' : 'transparent',
                              color: agentMinMatchScore === n ? '#06b6d4' : 'var(--text-muted)',
                              border: agentMinMatchScore === n ? '1px solid rgba(6,182,212,0.25)' : '1px solid transparent',
                            }}
                          >{n}%</button>
                        ))}
	                      </div>
	                    </div>

	                    {/* Autonomy level */}
	                    <div>
	                      <span className="text-[11px] text-[var(--text-secondary)] block mb-1.5">Autonomy level</span>
	                      <div className="grid grid-cols-2 gap-1.5">
	                        {([
	                          ['scout', 'Scout'],
	                          ['prepare', 'Prepare'],
	                          ['review', 'Review'],
	                          ['assist', 'Assist apply'],
	                        ] as const).map(([value, label]) => (
	                          <button
	                            key={value}
	                            type="button"
	                            onClick={() => setAgentAutonomyLevel(value)}
	                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
	                            style={{
	                              background: agentAutonomyLevel === value ? 'rgba(6,182,212,0.15)' : (isLight ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.035)'),
	                              color: agentAutonomyLevel === value ? '#06b6d4' : 'var(--text-secondary)',
	                              border: `1px solid ${agentAutonomyLevel === value ? 'rgba(6,182,212,0.25)' : (isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)')}`,
	                            }}
	                          >
	                            {label}
	                          </button>
	                        ))}
	                      </div>
	                      <p className="mt-1.5 text-[10px] leading-4 text-[var(--text-tertiary)]">
	                        Sona prepares work for review. She never submits applications or sends external email automatically.
	                      </p>
	                    </div>

	                    {/* Digest email opt-in */}
	                    <div
	                      className="rounded-xl border p-3"
	                      style={{
	                        background: agentDigestEmailEnabled ? 'rgba(37,99,235,0.08)' : (isLight ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.035)'),
	                        borderColor: agentDigestEmailEnabled ? 'rgba(37,99,235,0.24)' : (isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'),
	                      }}
	                    >
	                      <div className="flex items-center justify-between gap-3">
	                        <div>
	                          <span className="text-[11px] font-semibold text-[var(--text-primary)]">Sona digest email</span>
	                          <p className="text-[10px] leading-4 text-[var(--text-tertiary)]">Get a structured review email when Sona prepares new packets.</p>
	                        </div>
		                        <PreferenceSwitch
		                          checked={agentDigestEmailEnabled}
		                          label="Sona agent digest email"
		                          isLight={isLight}
		                          onChange={() => {
		                            const next = !agentDigestEmailEnabled;
		                            setAgentDigestEmailEnabled(next);
		                            if (next) setEmailNotifications(true);
		                          }}
		                        />
	                      </div>
	                      {agentDigestEmailEnabled && (
	                        <div className="mt-3 flex gap-1.5">
	                          {(['daily', 'weekly'] as const).map(freq => (
	                            <button
	                              key={freq}
	                              type="button"
	                              onClick={() => setAgentDigestFrequency(freq)}
	                              className="px-2.5 py-1 rounded-lg text-[11px] font-medium capitalize transition-all"
	                              style={{
	                                background: agentDigestFrequency === freq ? 'rgba(37,99,235,0.15)' : 'transparent',
	                                color: agentDigestFrequency === freq ? '#2563eb' : 'var(--text-muted)',
	                                border: `1px solid ${agentDigestFrequency === freq ? 'rgba(37,99,235,0.25)' : 'transparent'}`,
	                              }}
	                            >
	                              {freq}
	                            </button>
	                          ))}
	                        </div>
	                      )}
	                    </div>

	                    {/* Exclude companies */}
	                    <div>
                      <span className="text-[11px] text-[var(--text-secondary)] block mb-1.5">Exclude companies</span>
                      <div className="flex gap-1.5 flex-wrap mb-2">
                        {agentExcludeCompanies.map(c => (
                          <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium" style={{
                            background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
                            color: 'var(--text-secondary)',
                          }}>
                            {c}
                            <button onClick={() => setAgentExcludeCompanies(prev => prev.filter(x => x !== c))} className="hover:text-red-400 transition-colors">
                              <span className="material-symbols-rounded text-[10px]">close</span>
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          value={excludeInput}
                          onChange={e => setExcludeInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const v = excludeInput.trim();
                              if (v && !agentExcludeCompanies.includes(v)) {
                                setAgentExcludeCompanies(prev => [...prev, v]);
                                setExcludeInput('');
                              }
                            }
                          }}
                          placeholder="Company name..."
                          className="flex-1 px-2.5 py-1.5 rounded-lg text-[11px] transition-all"
                          style={{
                            background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
                            color: 'var(--text-primary)',
                          }}
                        />
                        <button
                          onClick={() => {
                            const v = excludeInput.trim();
                            if (v && !agentExcludeCompanies.includes(v)) {
                              setAgentExcludeCompanies(prev => [...prev, v]);
                              setExcludeInput('');
                            }
                          }}
                          className="px-2 py-1.5 rounded-lg text-[11px] font-medium bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500/20 transition-all"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Sona Picks */}
            <div
              id="sona-picks-controls"
              tabIndex={-1}
              aria-labelledby="sona-picks-title"
              className="rounded-2xl p-4"
              style={{
                background: jobAlertsEnabled ? 'linear-gradient(135deg, rgba(6,182,212,0.08), rgba(16,185,129,0.08))' : sectionBg,
                border: `1px solid ${jobAlertsEnabled ? 'rgba(6,182,212,0.22)' : sectionBorder}`,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-500">
                    <span className="material-symbols-rounded text-[20px]">radar</span>
                  </div>
                  <div>
                    <span id="sona-picks-title" className="text-sm font-semibold text-[var(--text-primary)]">Sona Picks</span>
                    <p className="mt-1 text-[11px] leading-4 text-[var(--text-tertiary)]">
                      Crafted job matches by email with fit reasons, salary signals, and application prep links.
                    </p>
                  </div>
                </div>
                <div className="shrink-0">
                  <PreferenceSwitch
                    id="sona-picks-email-toggle"
                    checked={jobAlertsEnabled}
                    label="Sona Picks email"
                    isLight={isLight}
                    disabled={alertConsentHandoff.controlsDisabled}
                    onChange={() => {
                      setJobAlertsEnabled(prev => {
                        const next = !prev;
                        if (next) {
                          setEmailNotifications(true);
                          setResumeProviderPausedEmail(Boolean(providerPauseAt));
                          setJobAlertDeliveryStatus('pending');
                          setJobAlertDeliveryMessage(providerPauseAt
                            ? 'Email was paused by the provider. Saving will record a new consent before delivery resumes.'
                            : 'Email consent will be recorded when you save these controls.');
                        } else {
                          setResumeProviderPausedEmail(false);
                          setJobAlertDeliveryStatus('consent_required');
                          setJobAlertDeliveryMessage('Sona Picks email delivery will stop when you save.');
                        }
                        return next;
                      });
                    }}
                  />
                </div>
              </div>

              {jobAlertsEnabled && (
                <div className="mt-3">
                  {isMaxPlan ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {SONA_PICK_CADENCES.map(option => {
                        const selected = jobAlertsFrequency === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setJobAlertsFrequency(option.value)}
                            aria-pressed={selected}
                            className="rounded-xl border px-3 py-2 text-left transition-all"
                            style={{
                              background: selected
                                ? 'rgba(6,182,212,0.12)'
                                : isLight ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.035)',
                              borderColor: selected
                                ? 'rgba(6,182,212,0.28)'
                                : isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)',
                            }}
                          >
                            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-primary)]">
                              <span className="material-symbols-rounded text-[13px] text-cyan-500">{option.icon}</span>
                              {option.label}
                            </span>
                            <span className="mt-0.5 block text-[10px] leading-4 text-[var(--text-tertiary)]">{option.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div
                      className="rounded-xl border px-3 py-2"
                      style={{
                        background: isLight ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.035)',
                        borderColor: isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)',
                      }}
                    >
                      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-primary)]">
                        <span className="material-symbols-rounded text-[13px] text-cyan-500">calendar_month</span>
                        Weekly
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-4 text-[var(--text-tertiary)]">Curated Sona Picks arrive every Monday.</span>
                    </div>
                  )}
                </div>
              )}

              <div
                className={`mt-3 flex min-w-0 flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-[10px] leading-4 ${
                  jobAlertDeliveryStatus === 'failed'
                    ? 'border-rose-500/25 bg-rose-500/5 text-rose-700 dark:text-rose-300'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                }`}
                role="status"
                aria-live="polite"
              >
                <span className="material-symbols-rounded mt-0.5 shrink-0 text-[14px]" aria-hidden="true">
                  {!loaded
                    ? 'schedule'
                    : preferenceAccess === 'sign_in'
                      ? 'login'
                      : preferenceAccess === 'unavailable'
                        ? 'error'
                    : jobAlertDeliveryStatus === 'failed'
                    ? 'error'
                    : jobAlertDeliveryStatus === 'delivered'
                      ? 'mark_email_read'
                      : jobAlertDeliveryStatus === 'accepted'
                        ? 'outgoing_mail'
                        : jobAlertDeliveryStatus === 'delayed' || jobAlertDeliveryStatus === 'sending'
                        ? 'schedule'
                        : jobAlertDeliveryStatus === 'ready'
                          ? 'notifications_active'
                          : jobAlertDeliveryStatus === 'pending'
                            ? 'save'
                            : 'notifications_off'}
                </span>
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  {!loaded
                    ? 'Loading your email consent and delivery status...'
                    : preferenceAccess === 'sign_in'
                      ? 'Sign in to choose Sona Picks email delivery.'
                      : jobAlertDeliveryMessage}
                </span>
                {preferenceAccess === 'unavailable' && (
                  <button
                    type="button"
                    onClick={() => setPreferenceLoadAttempt(attempt => attempt + 1)}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 text-xs font-semibold text-[var(--text-primary)]"
                  >
                    <span className="material-symbols-rounded text-[15px]" aria-hidden="true">refresh</span>
                    Retry
                  </button>
                )}
              </div>
            </div>

            {/* Save Button */}
            <motion.button
              whileHover={{ scale: 1.005 }}
              whileTap={{ scale: 0.995 }}
              onClick={savePrefs}
              disabled={alertConsentHandoff.saveDisabled}
              className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed text-white relative overflow-hidden group"
              style={{
                background: 'linear-gradient(135deg, #06b6d4, #10b981)',
                boxShadow: '0 4px 20px rgba(6,182,212,0.2), 0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              {/* Hover shimmer */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />

              {saving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <span className="material-symbols-rounded text-lg">save</span>
              )}
              {saving ? 'Saving...' : (targetRoles.length === 0 && !roleInput.trim()) ? 'Add at least one target role' : 'Save Profile & Get Suggestions'}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
