'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { authFetch } from '@/lib/auth-fetch';
import { useAuthGate } from '@/hooks/useAuthGate';
import { saveJDTemplate, getJDTemplates, type JDTemplate } from '@/lib/database-suite';
import { useStore } from '@/lib/store';
import { showToast } from '@/components/Toast';
import { SuiteToolHeader } from '@/components/suite/SuiteToolChrome';
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
  const [talentDensityScore, setTalentDensityScore] = useState(0);
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
      
      // Calculate talent density score based on requirements
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
        talent_density_score: talentDensityScore,
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
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
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
                <div className="rounded-2xl glass-card border border-cyan-500/20 overflow-hidden">
                  <div className="p-6 border-b border-white/10">
                    <h3 className="text-xl font-bold text-white">Role Details</h3>
                  </div>
                  <div className="p-6 space-y-4">
                    <div>
                      <label className="text-sm text-silver block mb-2">Role Title *</label>
                      <input type="text" value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white text-lg focus:border-cyan-500/50 focus:outline-none"
                        placeholder="e.g., Software Engineer, Product Manager"
                      />
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-silver block mb-2">Department</label>
                        <select value={department} onChange={(e) => setDepartment(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white focus:border-cyan-500/50 focus:outline-none"
                        >
                          {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-sm text-silver block mb-2">Seniority Level</label>
                        <select value={seniority} onChange={(e) => setSeniority(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white focus:border-cyan-500/50 focus:outline-none"
                        >
                          {SENIORITY_LEVELS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm text-silver block mb-2">Team Context</label>
                      <textarea rows={3} value={teamContext} onChange={(e) => setTeamContext(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-silver focus:border-cyan-500/50 focus:outline-none resize-none"
                        placeholder="Describe the team, projects, and what makes it special..."
                      />
                    </div>
                    <div>
                      <label className="text-sm text-silver block mb-2">Company Info (optional)</label>
                      <textarea rows={2} value={companyInfo} onChange={(e) => setCompanyInfo(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-silver focus:border-cyan-500/50 focus:outline-none resize-none"
                        placeholder="Brief company description, mission, stage..."
                      />
                    </div>
                    <div className="flex items-center gap-4 pt-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={includeCompensation} onChange={(e) => setIncludeCompensation(e.target.checked)}
                          className="w-5 h-5 rounded bg-black/30 border border-white/20 checked:bg-cyan-500"
                        />
                        <span className="text-sm text-silver">Include compensation</span>
                      </label>
                      {includeCompensation && (
                        <input type="text" value={salaryRange} onChange={(e) => setSalaryRange(e.target.value)}
                          className="flex-1 px-4 py-2 rounded-xl bg-black/30 border border-white/10 text-white text-sm focus:outline-none"
                          placeholder="e.g., $150K - $200K + equity"
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* JD Style */}
                <div className="rounded-2xl glass-card p-6">
                  <h3 className="font-bold text-white mb-4">JD Style</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {JD_STYLES.map((style) => (
                      <button key={style.id} onClick={() => setSelectedStyle(style)}
                        className={`p-4 rounded-xl border-2 transition-all text-left ${
                          selectedStyle.id === style.id ? 'border-cyan-400 bg-cyan-500/10' : 'border-white/10 hover:border-white/30'
                        }`}
                      >
                        <span className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--tag-cyan-bg)] text-[var(--tag-cyan-text)] mb-3">{style.icon}</span>
                        <p className="font-semibold text-white text-sm">{style.name}</p>
                        <p className="text-xs text-silver">{style.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Generate Button */}
                <button onClick={generateJD} disabled={isLoading || !roleTitle.trim()}
                  className="w-full flex items-center justify-center gap-2 py-5 rounded-2xl font-bold text-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:shadow-lg hover:shadow-cyan-500/25 transition-all disabled:opacity-50"
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
                <div className="rounded-2xl glass-card p-6">
                  <h3 className="font-bold text-white mb-4 flex items-center gap-2"><span className="material-symbols-rounded text-cyan-400">auto_awesome</span> What You'll Get</h3>
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
                      <li key={i} className="flex items-center gap-3 text-sm text-silver">
                        <span className="flex items-center justify-center w-6 h-6 rounded bg-white/5">{item.icon}</span>{item.text}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Saved Templates */}
                {savedTemplates.length > 0 && (
                  <div className="rounded-2xl glass-card p-6">
                    <h3 className="font-bold text-white mb-3 flex items-center gap-2"><span className="material-symbols-rounded text-indigo-400">folder</span> Saved Templates</h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {savedTemplates.slice(0, 5).map((t) => (
                        <button key={t.id} onClick={() => {
                          setEditableJD(t.content);
                          setTalentDensityScore(t.talent_density_score || 50);
                          setBiasFlags([]);
                          setStep('result');
                        }}
                          className="w-full p-3 rounded-xl bg-[var(--theme-bg-elevated)] hover:bg-white/10 text-left transition-colors"
                        >
                          <p className="text-sm font-medium text-white truncate">{t.title}</p>
                          <p className="text-xs text-silver">{new Date(t.created_at).toLocaleDateString()}</p>
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
            <div className="w-32 h-32 mx-auto mb-8 relative">
              <div className="absolute inset-0 rounded-full border-4 border-cyan-500/20" />
              <div className="absolute inset-0 rounded-full border-4 border-cyan-400 border-t-transparent animate-spin" />
              <div className="absolute inset-4 rounded-full bg-[var(--tag-cyan-bg)] flex items-center justify-center">
                <span className="material-symbols-rounded text-4xl text-[var(--tag-cyan-text)] animate-pulse">model_training</span>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">Crafting Your Mission Blueprint</h2>
            <p className="text-silver mb-8">AI is creating a compelling job description optimized for top talent...</p>
            <div className="flex justify-center gap-2">
              {['Mission', 'Requirements', 'Culture', 'Growth'].map((item, i) => (
                <motion.span key={item}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.3 }}
                  className="px-3 py-1.5 rounded-full bg-cyan-500/20 text-cyan-300 text-sm"
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
                {/* Talent Density Gauge */}
                <div className="rounded-2xl bg-gradient-to-r from-green-500/10 via-yellow-500/10 to-red-500/10 border border-white/10 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-white">Talent Density Score</h3>
                      <p className="text-sm text-silver">How rare is this candidate?</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-3xl font-bold ${
                        talentDensityScore < 40 ? 'text-green-400' :
                        talentDensityScore < 70 ? 'text-yellow-400' : 'text-red-400'
                      }`}>{talentDensityScore}</span>
                      <p className="text-xs text-silver">
                        {talentDensityScore < 40 ? 'Common' : talentDensityScore < 70 ? 'Competitive' : 'Unicorn'}
                      </p>
                    </div>
                  </div>
                  <div className="h-4 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${talentDensityScore}%` }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                      className={`h-full rounded-full ${
                        talentDensityScore < 40 ? 'bg-gradient-to-r from-green-500 to-green-400' :
                        talentDensityScore < 70 ? 'bg-gradient-to-r from-yellow-500 to-orange-400' :
                        'bg-gradient-to-r from-red-500 to-blue-500'
                      }`}
                    />
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-silver">
                    <span><span className="material-symbols-rounded text-green-500">check_circle</span> Common</span>
                    <span><span className="material-symbols-rounded text-yellow-500">pending</span> Competitive</span>
                    <span><span className="material-symbols-rounded text-red-500">cancel</span> Unicorn</span>
                  </div>
                </div>

                {/* Editable JD */}
                <div className="rounded-2xl glass-card overflow-hidden">
                  <div className="p-6 border-b border-white/10 flex items-center justify-between">
                    <h3 className="text-xl font-bold text-white">Generated Job Description</h3>
                    <div className="flex gap-2">
                      <button onClick={copyToClipboard} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--tag-cyan-bg)] text-[var(--tag-cyan-text)] text-sm hover:opacity-80 transition-opacity"><span className="material-symbols-rounded text-[16px]">content_copy</span> Copy</button>
                      <button onClick={downloadPDF} disabled={isLoading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 transition-colors disabled:opacity-50"><span className="material-symbols-rounded text-[16px]">picture_as_pdf</span> PDF</button>
                      <button onClick={saveTemplate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--tag-blue-bg)] text-[var(--tag-blue-text)] text-sm hover:opacity-80 transition-opacity"><span className="material-symbols-rounded text-[16px]">save</span> Save</button>
                    </div>
                  </div>
                  <div className="p-6">
                    <textarea
                      value={editableJD}
                      onChange={(e) => setEditableJD(e.target.value)}
                      rows={25}
                      className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-silver focus:border-cyan-500/50 focus:outline-none resize-none font-mono text-sm leading-relaxed"
                    />
                  </div>
                </div>


              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                {/* Bias Detector */}
                <div className={`rounded-2xl border overflow-hidden transition-all ${
                  biasFlags.length > 0 ? 'bg-gradient-to-br from-orange-900/20 to-red-900/20 border-orange-500/30' : 'bg-gradient-to-br from-green-900/20 to-cyan-900/20 border-green-500/30'
                }`}>
                  <div className="p-5 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        biasFlags.length > 0 ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'
                      }`}>
                        <span className="material-symbols-rounded">{biasFlags.length > 0 ? 'warning' : 'check_circle'}</span>
                      </div>
                      <div>
                        <h3 className="font-bold text-white">Bias Detector</h3>
                        <p className="text-xs text-silver">{biasFlags.length} issues found</p>
                      </div>
                    </div>
                    {biasFlags.length > 0 && (
                      <button onClick={fixAllBias}
                        className="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-xs font-semibold hover:bg-green-500/30"
                      >Fix All</button>
                    )}
                  </div>
                  <div className="p-4 max-h-64 overflow-y-auto">
                    {biasFlags.length === 0 ? (
                      <p className="text-center text-green-400 py-4">✓ No bias detected!</p>
                    ) : (
                      <div className="space-y-2">
                        {biasFlags.map((flag, i) => (
                          <div key={i} className="p-3 rounded-xl glass-card">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm">
                                  <span className="text-orange-400 font-semibold">"{flag.text}"</span>
                                </p>
                                <p className="text-xs text-silver">{flag.issue}</p>
                                <p className="text-xs text-green-400">→ Use: "{flag.suggestion}"</p>
                              </div>
                              <button onClick={() => fixBias(flag)}
                                className="px-2 py-1 rounded bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30"
                              >Fix</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl glass-card p-5">
                  <h3 className="font-bold text-white mb-4 flex items-center gap-2"><span className="material-symbols-rounded text-[var(--text-muted)]">bolt</span> Quick Actions</h3>
                  <div className="space-y-2">
                    <button onClick={copyToClipboard}
                      className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:shadow-lg transition-all flex items-center justify-center gap-2"
                    ><span className="material-symbols-rounded">content_copy</span> Copy to Clipboard</button>
                    <button onClick={downloadPDF} disabled={isLoading}
                      className="w-full py-3 rounded-xl font-semibold bg-white/10 text-white hover:bg-white/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    ><span className="material-symbols-rounded">picture_as_pdf</span> Download PDF</button>
                    <button onClick={saveTemplate}
                      className="w-full py-3 rounded-xl font-semibold bg-[var(--tag-cyan-bg)] text-[var(--tag-cyan-text)] transition-all flex items-center justify-center gap-2"
                    ><span className="material-symbols-rounded">save</span> Save to Library</button>
                    <button onClick={() => setStep('input')}
                      className="w-full py-3 rounded-xl font-semibold bg-[var(--theme-bg-elevated)] border border-white/10 text-silver hover:text-white hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                    ><span className="material-symbols-rounded">add_circle</span> Generate New JD</button>
                  </div>
                </div>

                {/* Tips */}
                <div className="rounded-2xl glass-card p-5">
                  <h3 className="font-bold text-white mb-3 flex items-center gap-2"><span className="material-symbols-rounded text-yellow-400">lightbulb</span> Pro Tips</h3>
                  <ul className="space-y-2 text-sm text-silver">
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
