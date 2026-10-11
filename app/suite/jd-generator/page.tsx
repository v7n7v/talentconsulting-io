'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { authFetch } from '@/lib/auth-fetch';
import { useAuthGate } from '@/hooks/useAuthGate';
import { saveJDTemplate, getJDTemplates, type JDTemplate } from '@/lib/database-suite';
import { useStore } from '@/lib/store';
import { showToast } from '@/components/Toast';
import { SuiteToolHeader, SuiteUnmeasured } from '@/components/suite/SuiteToolChrome';
import AssistantThinkingTile from '@/components/assistant/AssistantThinkingTile';
import { downloadJDPDF } from '@/lib/pdf-templates';

// JD Structure
interface GeneratedJD {
  roleTitle: string;
  missionStatement: string;
  overview: string;
  first90Days: { day: string; milestone: string }[];
  coreRequirements: string[];
  niceToHave: string[];
  culturePulse: { trait: string; description: string }[];
  talentDensity: string;
  growthPath: string[];
  compensation?: string;
  benefits?: string[];
}

// Bias detection patterns
const BIAS_PATTERNS = [
  { pattern: /\bninja\b/gi, issue: 'Gendered/Age-biased term', suggestion: 'expert' },
  { pattern: /\brockstar\b/gi, issue: 'Informal/Exclusionary', suggestion: 'high-performer' },
  { pattern: /\bguru\b/gi, issue: 'Cultural appropriation', suggestion: 'specialist' },
  { pattern: /\bhustler\b/gi, issue: 'Exclusionary language', suggestion: 'driven professional' },
  { pattern: /\byoung\b/gi, issue: 'Age discrimination', suggestion: 'energetic' },
  { pattern: /\bhe\/she\b/gi, issue: 'Binary language', suggestion: 'they' },
  { pattern: /\bmanpower\b/gi, issue: 'Gendered term', suggestion: 'workforce' },
  { pattern: /\bman hours\b/gi, issue: 'Gendered term', suggestion: 'work hours' },
  { pattern: /\bchairman\b/gi, issue: 'Gendered term', suggestion: 'chairperson' },
  { pattern: /\bfreshman\b/gi, issue: 'Gendered term', suggestion: 'first-year' },
  { pattern: /\bnative speaker\b/gi, issue: 'Potentially exclusionary', suggestion: 'fluent in English' },
  { pattern: /\bculture fit\b/gi, issue: 'Can enable bias', suggestion: 'values alignment' },
  { pattern: /\bagressive\b/gi, issue: 'Gendered connotation', suggestion: 'ambitious' },
  { pattern: /\bseamless\b/gi, issue: 'Ableist language', suggestion: 'smooth' },
];

// JD Styles
const JD_STYLES = [
  { id: 'startup', name: 'Startup Vibe', icon: <span className="material-symbols-rounded">rocket_launch</span>, description: 'Energetic, mission-driven' },
  { id: 'corporate', name: 'Corporate Pro', icon: <span className="material-symbols-rounded">business</span>, description: 'Formal, structured' },
  { id: 'technical', name: 'Tech-Forward', icon: <span className="material-symbols-rounded">terminal</span>, description: 'Skills-focused, detailed' },
  { id: 'creative', name: 'Creative Agency', icon: <span className="material-symbols-rounded">palette</span>, description: 'Bold, inspiring' },
];

// Seniority levels
const SENIORITY_LEVELS = ['Entry Level', 'Junior', 'Mid-Level', 'Senior', 'Lead', 'Principal', 'Director', 'VP', 'C-Level'];

// Departments
const DEPARTMENTS = ['Engineering', 'Product', 'Design', 'Marketing', 'Sales', 'Operations', 'Finance', 'HR', 'Legal', 'Customer Success', 'Data Science', 'DevOps', 'Security'];

// A qualitative reading of how specific THIS job description is, from its own
// requirement count and the selected seniority. It is NOT a market measurement
// of candidate rarity — there is no such data source here — so it renders as a
// named band, never a measured integer or percentage.
function requirementBand(score: number): { label: string; hint: string } {
  if (score < 40) return { label: 'Broad', hint: 'A generalist search — few required qualifications.' };
  if (score < 70) return { label: 'Focused', hint: 'A moderately specific set of requirements.' };
  return { label: 'Highly specialized', hint: 'Many requirements and/or senior scope.' };
}

export default function JDGeneratorPage() {
  const { user } = useStore();
  const { handleApiError, renderAuthModal } = useAuthGate();
  const [step, setStep] = useState<'input' | 'generating' | 'result'>('input');
  
  // Input state
  const [roleTitle, setRoleTitle] = useState('');
  const [department, setDepartment] = useState('Engineering');
  const [seniority, setSeniority] = useState('Senior');
  const [teamContext, setTeamContext] = useState('');
  const [companyInfo, setCompanyInfo] = useState('');
  const [selectedStyle, setSelectedStyle] = useState(JD_STYLES[0]);
  const [includeCompensation, setIncludeCompensation] = useState(false);
  const [salaryRange, setSalaryRange] = useState('');
  
  // Result state
  const [generatedJD, setGeneratedJD] = useState<GeneratedJD | null>(null);
  const [talentDensityScore, setTalentDensityScore] = useState<number | null>(null);
  const [biasFlags, setBiasFlags] = useState<{ text: string; issue: string; suggestion: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<JDTemplate[]>([]);
  const [editableJD, setEditableJD] = useState('');
  const [showBiasPanel, setShowBiasPanel] = useState(false);
  


  useEffect(() => { if (user) loadTemplates(); }, [user]);

  const loadTemplates = async () => {
    const result = await getJDTemplates();
    if (result.success && result.data) setSavedTemplates(result.data);
  };

  // Detect bias in text
  const detectBias = (text: string) => {
    const flags: { text: string; issue: string; suggestion: string }[] = [];
    BIAS_PATTERNS.forEach(({ pattern, issue, suggestion }) => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          if (!flags.find(f => f.text.toLowerCase() === match.toLowerCase())) {
            flags.push({ text: match, issue, suggestion });
          }
        });
      }
    });
    return flags;
  };

  // Generate JD with AI
  const generateJD = async () => {
    if (!roleTitle.trim()) {
      showToast('Enter a role title', 'cancel');
      return;
    }

    setIsLoading(true);
    setStep('generating');

    const systemPrompt = `You are a world-class Silicon Valley talent acquisition expert. Create a compelling "Mission Blueprint" job description that attracts exceptional talent.

Style: ${selectedStyle.name} - ${selectedStyle.description}

Return a JSON object with this EXACT structure:
{
  "roleTitle": "Full role title",
  "missionStatement": "One inspiring sentence about the role's impact",
  "overview": "2-3 paragraph compelling description of the role and its importance",
  "first90Days": [
    { "day": "Day 1-30", "milestone": "What they'll accomplish" },
    { "day": "Day 31-60", "milestone": "What they'll accomplish" },
    { "day": "Day 61-90", "milestone": "What they'll accomplish" }
  ],
  "coreRequirements": ["Requirement 1", "Requirement 2", ...],
  "niceToHave": ["Bonus skill 1", "Bonus skill 2", ...],
  "culturePulse": [
    { "trait": "Trait name", "description": "What this means at our company" }
  ],
  "talentDensity": "Description of what exceptional looks like in this role",
  "growthPath": ["Year 1 potential", "Year 2-3 potential", "Long-term trajectory"],
  "compensation": "${includeCompensation && salaryRange ? salaryRange : 'Competitive salary + equity'}",
  "benefits": ["Benefit 1", "Benefit 2", ...]
}

Make it compelling, specific, and free of bias. Use inclusive language.`;

    const userPrompt = `Create a Mission Blueprint JD for:
Role: ${seniority} ${roleTitle}
Department: ${department}
Team Context: ${teamContext || 'Growing team focused on innovation'}
Company Info: ${companyInfo || 'Fast-growing tech company'}
${includeCompensation ? `Salary Range: ${salaryRange}` : ''}

Generate a professional, compelling job description that would attract top-tier talent.`;

    try {
      const response = await authFetch('/api/ai', {
        method: 'POST',
        body: JSON.stringify({
          action: 'json',
          systemPrompt,
          prompt: userPrompt,
          options: { temperature: 0.7, maxTokens: 4000 },
          usageFeature: 'jdGenerations',
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Request failed' }));
        if (handleApiError(err)) { setIsLoading(false); setStep('input'); return; }
        throw new Error(err.error || `Server error ${response.status}`);
      }

      const { result } = await response.json() as { result: GeneratedJD };

      setGeneratedJD(result);
      
      // Read this JD's requirement profile: a specificity band derived from its
      // own requirement count + selected seniority. Not a market measure of how
      // rare candidates are — rendered as a named band, never as an integer/%.
      const reqCount = (result.coreRequirements?.length || 0) + (result.niceToHave?.length || 0) * 0.5;
      const score = Math.min(100, Math.round(30 + reqCount * 5 + (seniority.includes('Senior') || seniority.includes('Lead') ? 20 : 0)));
      setTalentDensityScore(score);

      // Convert to editable text
      setEditableJD(formatJDToText(result));
      
      // Detect initial bias
      setBiasFlags(detectBias(formatJDToText(result)));

      showToast('JD Generated!', 'check_circle');
      setStep('result');
    } catch (error) {
      console.error('Generation error:', error);
      showToast('Failed to generate JD', 'cancel');
      setStep('input');
    } finally {
      setIsLoading(false);
    }
  };

  // Format JD to plain text
  const formatJDToText = (jd: GeneratedJD): string => {
    return `${jd.roleTitle}

${jd.missionStatement}

ABOUT THE ROLE
${jd.overview}

FIRST 90 DAYS
${jd.first90Days?.map(m => `• ${m.day}: ${m.milestone}`).join('\n') || ''}

WHAT YOU'LL BRING
${jd.coreRequirements?.map(r => `• ${r}`).join('\n') || ''}

NICE TO HAVE
${jd.niceToHave?.map(r => `• ${r}`).join('\n') || ''}

OUR CULTURE
${jd.culturePulse?.map(c => `• ${c.trait}: ${c.description}`).join('\n') || ''}

WHAT EXCEPTIONAL LOOKS LIKE
${jd.talentDensity}

GROWTH PATH
${jd.growthPath?.map(g => `• ${g}`).join('\n') || ''}

${jd.compensation ? `COMPENSATION\n${jd.compensation}` : ''}

${jd.benefits?.length ? `BENEFITS\n${jd.benefits.map(b => `• ${b}`).join('\n')}` : ''}`;
  };

  // Update bias detection when editable JD changes
  useEffect(() => {
    if (editableJD) {
      setBiasFlags(detectBias(editableJD));
    }
  }, [editableJD]);

  // Copy to clipboard
  const copyToClipboard = () => {
    navigator.clipboard.writeText(editableJD);
    showToast('Copied to clipboard!', 'content_paste');
  };

  // Download as PDF
  const downloadPDF = async () => {
    setIsLoading(true);
    try {
      await downloadJDPDF(generatedJD || undefined, editableJD);
      showToast('PDF downloaded!', 'check_circle');
    } catch { showToast('Failed to generate PDF', 'cancel'); }
    finally { setIsLoading(false); }
  };

  // Save template
  const saveTemplate = async () => {
    if (!generatedJD) return;
    const name = prompt('Template name:', generatedJD.roleTitle);
    if (!name) return;
    try {
      const result = await saveJDTemplate(name, editableJD, {
        talent_density_score: talentDensityScore ?? undefined,
        first_90_days: generatedJD.first90Days,
        culture_pulse: generatedJD.culturePulse,
        bias_flags: biasFlags,
      });
      if (result.success) {
        showToast('Template saved!', 'check_circle');
        loadTemplates();
      }
    } catch { showToast('Failed to save', 'cancel'); }
  };

  // Fix bias
  const fixBias = (biasItem: { text: string; suggestion: string }) => {
    const newText = editableJD.replace(new RegExp(biasItem.text, 'gi'), biasItem.suggestion);
    setEditableJD(newText);
    showToast('Bias fixed!', 'check_circle');
  };

  // Fix all bias
  const fixAllBias = () => {
    let newText = editableJD;
    biasFlags.forEach(flag => {
      newText = newText.replace(new RegExp(flag.text, 'gi'), flag.suggestion);
    });
    setEditableJD(newText);
    showToast('All bias fixed!', 'check_circle');
  };


  return (
    <div className="mobile-app-content min-h-dvh px-4 py-3 md:p-6 lg:p-8">
      <div className="mx-auto max-w-4xl">
        {/* First child, not last: UsageLimitGate renders in flow, so calling
            this at the bottom of the page put the cap block below the fold. */}
        {renderAuthModal()}
        <SuiteToolHeader
          tool="jd-generator"
          title="Mission Blueprint Generator"
          subtitle="Create compelling job descriptions that attract exceptional talent with AI-powered bias detection."
          eyebrow="Persona-JD Engine"
          icon="assignment"
          pageHelpId="jd-generator"
          className="mb-4 md:mb-6"
          actions={step !== 'input' ? (
            <button
              onClick={() => { setStep('input'); setGeneratedJD(null); }}
              className="btn-secondary inline-flex min-h-[44px] items-center rounded-[12px] px-4 py-2 text-sm font-medium"
            >
              New JD
            </button>
          ) : undefined}
        />
      </div>

      <AnimatePresence mode="wait">
        {/* INPUT STEP */}
        {step === 'input' && (
          <motion.div key="input" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="max-w-4xl mx-auto"
          >
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Main Form */}
              <div className="lg:col-span-2 space-y-6">
                <div className="elevation-card overflow-hidden rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)]">
                  <div className="border-b border-[var(--border-subtle)] p-6">
                    <h3 className="text-xl font-bold text-[var(--text-primary)]">Role Details</h3>
                  </div>
                  <div className="space-y-4 p-6">
                    <div>
                      <label className="mb-2 block text-sm text-[var(--text-secondary)]">Role Title *</label>
                      <input type="text" value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)}
                        className="w-full rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-input)] px-4 py-3 text-lg text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                        placeholder="e.g., Software Engineer, Product Manager"
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm text-[var(--text-secondary)]">Department</label>
                        <select value={department} onChange={(e) => setDepartment(e.target.value)}
                          className="w-full rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-input)] px-4 py-3 text-base text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                        >
                          {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-sm text-[var(--text-secondary)]">Seniority Level</label>
                        <select value={seniority} onChange={(e) => setSeniority(e.target.value)}
                          className="w-full rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-input)] px-4 py-3 text-base text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                        >
                          {SENIORITY_LEVELS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm text-[var(--text-secondary)]">Team Context</label>
                      <textarea rows={3} value={teamContext} onChange={(e) => setTeamContext(e.target.value)}
                        className="w-full resize-none rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-input)] px-4 py-3 text-base text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                        placeholder="Describe the team, projects, and what makes it special..."
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm text-[var(--text-secondary)]">Company Info (optional)</label>
                      <textarea rows={2} value={companyInfo} onChange={(e) => setCompanyInfo(e.target.value)}
                        className="w-full resize-none rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-input)] px-4 py-3 text-base text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                        placeholder="Brief company description, mission, stage..."
                      />
                    </div>
                    <div className="flex items-center gap-4 pt-2">
                      <label className="flex min-h-[44px] cursor-pointer items-center gap-2 py-2">
                        <input type="checkbox" checked={includeCompensation} onChange={(e) => setIncludeCompensation(e.target.checked)}
                          className="h-5 w-5 rounded border border-[var(--border)] bg-[var(--bg-input)] accent-[var(--accent)]"
                        />
                        <span className="text-sm text-[var(--text-secondary)]">Include compensation</span>
                      </label>
                      {includeCompensation && (
                        <input type="text" value={salaryRange} onChange={(e) => setSalaryRange(e.target.value)}
                          className="flex-1 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-input)] px-4 py-2 text-base text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                          placeholder="e.g., $150K - $200K + equity"
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* JD Style */}
                <div className="elevation-card rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-6">
                  <h3 className="mb-4 font-bold text-[var(--text-primary)]">JD Style</h3>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {JD_STYLES.map((style) => (
                      <button key={style.id} onClick={() => setSelectedStyle(style)}
                        className={`rounded-[12px] border-2 p-4 text-left transition-all ${
                          selectedStyle.id === style.id ? 'border-[var(--accent)] bg-[var(--accent-dim)]' : 'border-[var(--border-subtle)] hover:border-[var(--border)]'
                        }`}
                      >
                        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--accent-dim)] text-[var(--accent)]">{style.icon}</span>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{style.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">{style.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Generate Button */}
                <button onClick={generateJD} disabled={isLoading || !roleTitle.trim()}
                  className="btn-primary flex w-full items-center justify-center gap-2 rounded-[16px] py-4 text-lg font-bold"
                >
                  <span className="material-symbols-rounded">{isLoading ? 'psychology' : 'flare'}</span>
                  {isLoading ? 'Generating Mission Blueprint...' : 'Generate Mission Blueprint'}
                </button>
	                {isLoading && (
	                  <AssistantThinkingTile
	                    variant="jobs"
	                    icon="clinical_notes"
	                    title="Taco is drafting the mission blueprint"
	                    description="Balancing role clarity, requirements, culture, and inclusive language."
	                    activeStage="generating"
	                    stages={['Role brief', 'Requirements', 'Bias check', 'Roadmap']}
	                    compact
	                  />
	                )}
	              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                {/* What You Get */}
                <div className="elevation-card rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-6">
                  <h3 className="mb-4 flex items-center gap-2 font-bold text-[var(--text-primary)]"><span className="material-symbols-rounded text-[var(--accent)]">auto_awesome</span> What You'll Get</h3>
                  <ul className="space-y-3">
                    {[
                      { icon: <span className="material-symbols-rounded text-[16px]">my_location</span>, text: 'Mission Statement' },
                      { icon: <span className="material-symbols-rounded text-[16px]">calendar_month</span>, text: 'First 90 Days Roadmap' },
                      { icon: <span className="material-symbols-rounded text-[16px]">check_circle</span>, text: 'Core Requirements' },
                      { icon: <span className="material-symbols-rounded text-[16px]">diamond</span>, text: 'Nice-to-Have Skills' },
                      { icon: <span className="material-symbols-rounded text-[16px]">favorite</span>, text: 'Culture Pulse Section' },
                      { icon: <span className="material-symbols-rounded text-[16px]">rocket_launch</span>, text: 'Growth Path' },
                      { icon: <span className="material-symbols-rounded text-[16px]">balance</span>, text: 'Bias-Free Language' },
                    ].map((item, i) => (
                      <li key={i} className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
                        <span className="flex h-6 w-6 items-center justify-center rounded bg-[var(--bg-elevated)] text-[var(--accent)]">{item.icon}</span>{item.text}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Saved Templates */}
                {savedTemplates.length > 0 && (
                  <div className="elevation-card rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-6">
                    <h3 className="mb-3 flex items-center gap-2 font-bold text-[var(--text-primary)]"><span className="material-symbols-rounded text-[var(--accent)]">folder</span> Saved Templates</h3>
                    <div className="max-h-48 space-y-2 overflow-y-auto">
                      {savedTemplates.slice(0, 5).map((t) => (
                        <button key={t.id} onClick={() => {
                          setEditableJD(t.content);
                          setTalentDensityScore(t.talent_density_score ?? null);
                          setBiasFlags([]);
                          setStep('result');
                        }}
                          className="w-full rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-left transition-colors hover:bg-[var(--bg-hover)]"
                        >
                          <p className="truncate text-sm font-medium text-[var(--text-primary)]">{t.title}</p>
                          <p className="text-xs text-[var(--text-muted)]">{new Date(t.created_at).toLocaleDateString()}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* GENERATING STEP */}
        {step === 'generating' && (
          <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="max-w-2xl mx-auto text-center py-20"
          >
            <div className="relative mx-auto mb-8 h-32 w-32">
              <div className="absolute inset-0 rounded-full border-4 border-[var(--accent-dim)]" />
              <div className="absolute inset-0 animate-spin rounded-full border-4 border-[var(--accent)] border-t-transparent" />
              <div className="absolute inset-4 flex items-center justify-center rounded-full bg-[var(--accent-dim)]">
                <span className="material-symbols-rounded animate-pulse text-4xl text-[var(--accent)]">model_training</span>
              </div>
            </div>
            <h2 className="mb-4 text-2xl font-bold text-[var(--text-primary)]">Crafting Your Mission Blueprint</h2>
            <p className="mb-8 text-[var(--text-secondary)]">AI is creating a compelling job description optimized for top talent...</p>
            <div className="flex justify-center gap-2">
              {['Mission', 'Requirements', 'Culture', 'Growth'].map((item, i) => (
                <motion.span key={item}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.3 }}
                  className="rounded-full bg-[var(--accent-dim)] px-3 py-1.5 text-sm text-[var(--accent)]"
                >{item}</motion.span>
              ))}
            </div>
          </motion.div>
        )}

        {/* RESULT STEP */}
        {step === 'result' && (
          <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="max-w-6xl mx-auto"
          >
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Main JD */}
              <div className="lg:col-span-2 space-y-4">
                {/* JD Requirement Profile — a qualitative reading of THIS JD's
                    specificity (its own requirement count + selected seniority),
                    not a market measurement of candidate rarity. No integer, no
                    %-bar: a discrete band plus the factors it was read from, or a
                    labelled absence when there is no stored reading. */}
                <div className="elevation-card rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-6">
                  <div className="mb-1">
                    <h3 className="font-bold text-[var(--text-primary)]">JD Requirement Profile</h3>
                    <p className="text-sm text-[var(--text-secondary)]">A reading of this JD&apos;s specificity — not a measure of how rare candidates are.</p>
                  </div>
                  {talentDensityScore == null ? (
                    <SuiteUnmeasured
                      label="Requirement profile not recorded"
                      reason="This saved template has no stored reading, so there is nothing to show. Regenerate the JD to read its requirement profile."
                      className="mt-4"
                    />
                  ) : (
                    <div className="mt-4">
                      <p className="text-2xl font-bold text-[var(--text-primary)]">{requirementBand(talentDensityScore).label}</p>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">{requirementBand(talentDensityScore).hint}</p>
                      {generatedJD ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1 text-xs text-[var(--text-secondary)]">{generatedJD.coreRequirements?.length || 0} core requirements</span>
                          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1 text-xs text-[var(--text-secondary)]">{generatedJD.niceToHave?.length || 0} nice-to-have</span>
                          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1 text-xs text-[var(--text-secondary)]">{seniority} seniority</span>
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-[var(--text-muted)]">Read from the saved JD&apos;s requirement count and seniority.</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Editable JD */}
                <div className="elevation-card overflow-hidden rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] p-6">
                    <h3 className="text-xl font-bold text-[var(--text-primary)]">Generated Job Description</h3>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={copyToClipboard} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[12px] bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-on)] transition-opacity hover:opacity-90"><span className="material-symbols-rounded text-[18px]">content_copy</span> Copy</button>
                      <button onClick={downloadPDF} disabled={isLoading} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"><span className="material-symbols-rounded text-[18px]">picture_as_pdf</span> PDF</button>
                      <button onClick={saveTemplate} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"><span className="material-symbols-rounded text-[18px]">save</span> Save</button>
                    </div>
                  </div>
                  <div className="p-6">
                    <textarea
                      value={editableJD}
                      onChange={(e) => setEditableJD(e.target.value)}
                      rows={25}
                      className="w-full resize-none rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-input)] px-4 py-3 font-mono text-base leading-relaxed text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>
                </div>


              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                {/* Bias Detector */}
                <div className={`elevation-card overflow-hidden rounded-[20px] border bg-[var(--card-bg)] transition-all ${
                  biasFlags.length > 0 ? 'border-[var(--warning)]' : 'border-[var(--success)]'
                }`}>
                  <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] p-5">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-[12px] ${
                        biasFlags.length > 0 ? 'bg-[var(--tag-amber-bg)] text-[var(--tag-amber-text)]' : 'bg-[var(--tag-green-bg)] text-[var(--tag-green-text)]'
                      }`}>
                        <span className="material-symbols-rounded">{biasFlags.length > 0 ? 'warning' : 'check_circle'}</span>
                      </div>
                      <div>
                        <h3 className="font-bold text-[var(--text-primary)]">Bias Detector</h3>
                        <p className="text-xs text-[var(--text-muted)]">{biasFlags.length} issues found</p>
                      </div>
                    </div>
                    {biasFlags.length > 0 && (
                      <button onClick={fixAllBias}
                        className="inline-flex min-h-[44px] items-center rounded-[12px] bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[var(--accent-on)] transition-opacity hover:opacity-90"
                      >Fix All</button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto p-4">
                    {biasFlags.length === 0 ? (
                      <p className="py-4 text-center text-[var(--success)]">✓ No bias detected!</p>
                    ) : (
                      <div className="space-y-2">
                        {biasFlags.map((flag, i) => (
                          <div key={i} className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm">
                                  <span className="font-semibold text-[var(--warning)]">"{flag.text}"</span>
                                </p>
                                <p className="text-xs text-[var(--text-muted)]">{flag.issue}</p>
                                <p className="text-xs text-[var(--success)]">→ Use: "{flag.suggestion}"</p>
                              </div>
                              <button onClick={() => fixBias(flag)}
                                className="inline-flex min-h-[44px] items-center rounded-[10px] bg-[var(--accent)] px-3 py-2 text-xs font-medium text-[var(--accent-on)] transition-opacity hover:opacity-90"
                              >Fix</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="elevation-card rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5">
                  <h3 className="mb-4 flex items-center gap-2 font-bold text-[var(--text-primary)]"><span className="material-symbols-rounded text-[var(--text-muted)]">bolt</span> Quick Actions</h3>
                  <div className="space-y-2">
                    <button onClick={copyToClipboard}
                      className="btn-primary flex w-full items-center justify-center gap-2 rounded-[12px] py-3 font-semibold"
                    ><span className="material-symbols-rounded">content_copy</span> Copy to Clipboard</button>
                    <button onClick={downloadPDF} disabled={isLoading}
                      className="btn-secondary flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] py-3 font-semibold disabled:opacity-50"
                    ><span className="material-symbols-rounded">picture_as_pdf</span> Download PDF</button>
                    <button onClick={saveTemplate}
                      className="btn-secondary flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] py-3 font-semibold"
                    ><span className="material-symbols-rounded">save</span> Save to Library</button>
                    <button onClick={() => setStep('input')}
                      className="btn-secondary flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] py-3 font-semibold"
                    ><span className="material-symbols-rounded">add_circle</span> Generate New JD</button>
                  </div>
                </div>

                {/* Tips */}
                <div className="elevation-card rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5">
                  <h3 className="mb-3 flex items-center gap-2 font-bold text-[var(--text-primary)]"><span className="material-symbols-rounded text-[var(--warning)]">lightbulb</span> Pro Tips</h3>
                  <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
                    <li>• Keep requirements focused (5-7 core items)</li>
                    <li>• Use inclusive, bias-free language</li>
                    <li>• Be specific about the First 90 Days</li>
                    <li>• Highlight growth opportunities</li>
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
