'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import AnimatedToolIcon from '@/components/AnimatedToolIcon';
import AuthModal from '@/components/modals/AuthModal';
import AssistantThinkingTile from '@/components/assistant/AssistantThinkingTile';
import TelemetryCard from '@/components/TelemetryCard';
import { showToast } from '@/components/Toast';
import { AssistantMark } from '@/components/assistant';
import { SuiteToolHeader, SuiteToolIcon, SuiteToolShell } from '@/components/suite/SuiteToolChrome';
import { authFetch } from '@/lib/auth-fetch';
import { compactList, normalizeCareerTwinSummary, type CareerTwinSummary } from '@/lib/career-twin-client';
import { getJobApplications, getResumeVersions, type JobApplication, type ResumeVersion } from '@/lib/database-suite';
import { analyzeInterview, type InterviewTelemetry } from '@/lib/interview-telemetry';
import { UPGRADE_COPY } from '@/lib/product-copy';
import { useStore } from '@/lib/store';
import { useGeminiLiveAvatar } from '@/hooks/useGeminiLiveAvatar';

const AvatarCanvas = dynamic(() => import('@/components/interview/AvatarCanvas'), { ssr: false });

type StudioMode = 'quick_drill' | 'study_cards' | 'full_mock' | 'sona_live' | 'avatar_live' | 'technical_whiteboard' | 'debrief_review';
type InterviewPhase = 'setup' | 'room' | 'debrief';
type TranscriptEntry = { role: 'user' | 'ai'; text: string };

interface Persona {
  id: string;
  label: string;
  desc: string;
  icon: string;
  voice: string;
}

interface StudioQuestion {
  text: string;
  type?: string;
  context?: string;
  difficulty?: string;
}

interface StudyCard {
  question: string;
  answer: string;
  category?: string;
  difficulty?: string;
}

interface DropdownOption {
  value: string;
  label: string;
  description?: string;
}

interface StarStory {
  id: string;
  title?: string;
  tags?: string[];
  situation?: string;
  result?: string;
}

interface InterviewSession {
  id: string;
  mode?: StudioMode;
  status?: string;
  company?: string;
  role?: string;
  createdAt?: string;
  completedAt?: string;
  scores?: any;
  transcript?: TranscriptEntry[];
}
type InterviewReadinessStatus = 'ready' | 'review' | 'blocked';

interface InterviewReadinessItem {
  label: string;
  description: string;
  icon: string;
  status: InterviewReadinessStatus;
  statusLabel: string;
}

const PERSONAS: Persona[] = [
  { id: 'faang-lead', label: 'FAANG Lead', desc: 'Precise technical pressure', icon: 'engineering', voice: 'Charon' },
  { id: 'friendly-hr', label: 'Friendly HR', desc: 'Warm behavioral coach', icon: 'favorite', voice: 'Kore' },
  { id: 'startup-cto', label: 'Startup CTO', desc: 'Practical execution focus', icon: 'rocket_launch', voice: 'Fenrir' },
  { id: 'vp-engineering', label: 'VP Engineering', desc: 'Leadership and strategy', icon: 'military_tech', voice: 'Puck' },
  { id: 'consulting-partner', label: 'Consultant', desc: 'Structured case pressure', icon: 'handshake', voice: 'Aoede' },
  { id: 'behavioral-specialist', label: 'STAR Specialist', desc: 'Deep story coaching', icon: 'psychology', voice: 'Kore' },
];

const MODES: Array<{ id: StudioMode; label: string; desc: string; icon: string }> = [
  { id: 'quick_drill', label: 'Quick Drill', desc: 'One to three focused reps with instant feedback', icon: 'bolt' },
  { id: 'study_cards', label: 'Study Cards', desc: 'Flip role-specific prep cards', icon: 'view_carousel' },
  { id: 'full_mock', label: 'Full Mock', desc: 'A realistic multi-question practice session', icon: 'forum' },
  { id: 'sona_live', label: 'Live Interview with Taco', desc: 'Voice-first interview with Taco presence', icon: 'sona' },
  { id: 'avatar_live', label: 'Avatar Live', desc: 'Enhanced live room with 3D fallback', icon: 'spatial_audio' },
  { id: 'technical_whiteboard', label: 'Whiteboard', desc: 'Coding, system design, and case structure', icon: 'draw' },
  { id: 'debrief_review', label: 'Debrief Review', desc: 'Saved sessions, weak spots, and next drills', icon: 'monitoring' },
];

const INTERVIEW_TYPES = [
  { id: 'behavioral', label: 'Behavioral' },
  { id: 'technical', label: 'Technical' },
  { id: 'system-design', label: 'System Design' },
  { id: 'case', label: 'Case' },
  { id: 'mixed', label: 'Mixed' },
];

const WHITEBOARD_TEMPLATES = {
  coding: ['Prompt', 'Assumptions', 'Approach', 'Pseudocode or code', 'Complexity', 'Edge cases'],
  system_design: ['Requirements', 'Entities', 'APIs', 'Data model', 'Scaling', 'Trade-offs'],
  case: ['Problem', 'Framework', 'Assumptions', 'Calculations', 'Recommendation', 'Risks'],
};
const INTERVIEW_READINESS_CLASS: Record<InterviewReadinessStatus, string> = {
  ready: 'border-[color-mix(in_srgb,var(--success)_24%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--success)]',
  review: 'border-[color-mix(in_srgb,var(--warning)_24%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] text-[var(--warning)]',
  blocked: 'border-[color-mix(in_srgb,var(--danger)_24%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)]',
};

function fallbackQuestions(mode: StudioMode, type: string, role: string): StudioQuestion[] {
  const target = role || 'this role';
  const base = [
    { text: `Tell me about a time you solved a difficult problem relevant to ${target}.`, type: 'behavioral', context: 'Tests STAR structure and specificity.', difficulty: 'standard' },
    { text: `What trade-off would you make first if you had to ship a high-impact project with limited time?`, type: 'situational', context: 'Tests prioritization and judgment.', difficulty: 'advanced' },
    { text: `Which part of your background best proves you can succeed in ${target}?`, type: 'behavioral', context: 'Tests role fit and self-positioning.', difficulty: 'standard' },
    { text: 'Walk me through a technical decision you changed your mind about.', type: 'technical', context: 'Tests depth, humility, and learning.', difficulty: 'advanced' },
    { text: 'Design a reliable workflow for a product feature used by thousands of users.', type: 'system-design', context: 'Tests architecture and communication.', difficulty: 'advanced' },
  ];
  const filtered = type === 'mixed' ? base : base.filter(q => q.type === type || q.type === 'situational');
  return (mode === 'quick_drill' ? filtered.slice(0, 1) : filtered.slice(0, 5));
}

function modeLabel(mode: StudioMode) {
  return MODES.find(item => item.id === mode)?.label || 'Interview Studio';
}

function formatDate(value?: string) {
  if (!value) return 'Not saved yet';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function getTwinInterviewTarget(twin?: CareerTwinSummary | null, fallback = 'Build the practice brief') {
  const targets = twin?.memory?.goals?.targetRoles?.length ? twin.memory.goals.targetRoles : twin?.background?.targetRoles;
  return compactList(targets, fallback, 2);
}

function buildInterviewReadiness({
  role,
  company,
  jobDescription,
  selectedResume,
  relevantStories,
  sessions,
  keywords,
  twin,
}: {
  role: string;
  company: string;
  jobDescription: string;
  selectedResume?: ResumeVersion;
  relevantStories: StarStory[];
  sessions: InterviewSession[];
  keywords: string[];
  twin?: CareerTwinSummary | null;
}): InterviewReadinessItem[] {
  const targetRoles = twin?.memory?.goals?.targetRoles?.length ? twin.memory.goals.targetRoles : twin?.background?.targetRoles || [];
  const hasSpecificRoleContext = Boolean(role.trim() || company.trim() || jobDescription.trim());
  const hasRoleContext = hasSpecificRoleContext || targetRoles.length > 0;
  const hasResumeMemory = Boolean(twin?.memory?.confirmedFacts?.hasResume);
  const twinStoryCount = twin?.behavioralBank?.totalStories || 0;
  const storyProofCount = Math.max(relevantStories.length, twinStoryCount);
  const completedSessions = sessions.filter(session => session.status === 'completed' || session.completedAt || session.scores).length;

  return [
    {
      label: 'Role context',
      description: hasRoleContext
        ? [role || getTwinInterviewTarget(twin, 'Target role'), company].filter(Boolean).join(' at ') || 'Pasted job context is loaded.'
        : 'Add a company, role, application, or job description.',
      icon: 'work',
      status: hasSpecificRoleContext ? 'ready' : hasRoleContext ? 'review' : 'blocked',
      statusLabel: hasSpecificRoleContext ? 'Ready' : hasRoleContext ? 'Career Twin' : 'Set up',
    },
    {
      label: 'Resume anchor',
      description: selectedResume
        ? `${selectedResume.version_name} is linked for proof checks.`
        : hasResumeMemory
          ? 'Career Twin has resume memory. Select the exact version before a full mock.'
          : 'Link a resume and your answers reference real experience.',
      icon: 'description',
      status: selectedResume ? 'ready' : hasResumeMemory ? 'review' : 'blocked',
      statusLabel: selectedResume ? 'Linked' : hasResumeMemory ? 'Memory' : 'Set up',
    },
    {
      label: 'Story proof',
      description: relevantStories.length > 0
        ? `${relevantStories.length} STAR stor${relevantStories.length === 1 ? 'y' : 'ies'} matched to this target.`
        : twinStoryCount > 0
          ? `${twinStoryCount} Story Bank stor${twinStoryCount === 1 ? 'y' : 'ies'} available in Career Twin.`
        : 'Your STAR stories will fuel realistic behavioral practice.',
      icon: 'auto_stories',
      status: storyProofCount >= 3 ? 'ready' : storyProofCount > 0 ? 'review' : 'blocked',
      statusLabel: storyProofCount >= 3 ? 'Ready' : storyProofCount > 0 ? 'Sparse' : 'Set up',
    },
    {
      label: 'JD signal',
      description: keywords.length > 0 ? `${keywords.slice(0, 4).join(', ')} are live cues.` : 'Paste a job description and Taco will pull out the real cues.',
      icon: 'key',
      status: keywords.length >= 4 ? 'ready' : jobDescription.trim() ? 'review' : 'blocked',
      statusLabel: keywords.length >= 4 ? 'Ready' : jobDescription.trim() ? 'Review' : 'Set up',
    },
    {
      label: 'Debrief loop',
      description: completedSessions > 0
        ? `${completedSessions} completed session${completedSessions === 1 ? '' : 's'} can shape next drills.`
        : sessions.length > 0
          ? 'Saved sessions exist, but no completed scoring loop is ready.'
          : 'First debrief will create your practice baseline.',
      icon: 'monitoring',
      status: completedSessions > 0 ? 'ready' : sessions.length > 0 ? 'review' : 'review',
      statusLabel: completedSessions > 0 ? 'Ready' : 'Baseline',
    },
    {
      label: 'Practice plan',
      description: hasRoleContext && (storyProofCount > 0 || keywords.length > 0)
        ? 'Taco can predict questions and assign focused drills.'
        : 'Needs role context plus stories or JD cues.',
      icon: 'route',
      status: hasRoleContext && (storyProofCount > 0 || keywords.length > 0) ? 'ready' : 'review',
      statusLabel: hasRoleContext && (storyProofCount > 0 || keywords.length > 0) ? 'Ready' : 'Review',
    },
  ];
}

export default function InterviewStudioPage() {
  const searchParams = useSearchParams();
  const { user } = useStore();
  const gemini = useGeminiLiveAvatar();
  const transcriptRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<InterviewPhase>('setup');
  // Opens on Quick Drill, not the live room. The live modes are real for free
  // users - /api/voice/live-token guards on `gauntlets`, not on voice minutes,
  // so they get three - but landing there makes a microphone permission prompt
  // and one of those three the first thing a new account meets. `?mode=` still
  // overrides, and MobileWorkbench already links `?mode=quick_drill`.
  const [mode, setMode] = useState<StudioMode>('quick_drill');
  const [persona, setPersona] = useState<Persona>(PERSONAS[1]);
  const [interviewType, setInterviewType] = useState('mixed');
  const [intensity, setIntensity] = useState('balanced');
  const [durationTarget, setDurationTarget] = useState(30);
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [applicationId, setApplicationId] = useState('');
  const [resumeVersionId, setResumeVersionId] = useState('');
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [resumes, setResumes] = useState<ResumeVersion[]>([]);
  const [stories, setStories] = useState<StarStory[]>([]);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [twin, setTwin] = useState<CareerTwinSummary | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [applicationsContextState, setApplicationsContextState] = useState<'idle' | 'ready' | 'error'>('idle');
  const [applicationLinkError, setApplicationLinkError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showAuth, setShowAuth] = useState<'login' | 'signup' | null>(null);

  const [activeSessionId, setActiveSessionId] = useState('');
  const roomStartRef = useRef<number | null>(null);
  const [questions, setQuestions] = useState<StudioQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [draftAnswer, setDraftAnswer] = useState('');
  const [typedTranscript, setTypedTranscript] = useState<TranscriptEntry[]>([]);
  const [telemetry, setTelemetry] = useState<InterviewTelemetry | null>(null);
  const [grade, setGrade] = useState<any>(null);
  const [studyCards, setStudyCards] = useState<StudyCard[]>([]);
  const [studyCardIndex, setStudyCardIndex] = useState(0);
  const [studyCardFlipped, setStudyCardFlipped] = useState(false);

  const [whiteboardMode, setWhiteboardMode] = useState<'coding' | 'system_design' | 'case'>('system_design');
  const [whiteboardPrompt, setWhiteboardPrompt] = useState('Design a notification system for interview reminders and follow-up nudges.');
  const [whiteboard, setWhiteboard] = useState({
    assumptions: '',
    approach: '',
    solution: '',
    complexity: '',
    tradeoffs: '',
  });

  useEffect(() => {
    const requestedMode = searchParams.get('mode');
    const validMode = MODES.find(m => m.id === requestedMode);
    if (validMode) setMode(validMode.id);
    const requestedSkill = searchParams.get('skill');
    if (requestedSkill) setRole(prev => prev || requestedSkill);
  }, [searchParams]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [gemini.fullTranscript, typedTranscript]);

  const loadContext = useCallback(async () => {
    if (!user) return;
    setLoadingContext(true);
    try {
      const [appsResult, resumesResult, storiesRes, sessionsRes, intelligenceRes] = await Promise.all([
        getJobApplications(),
        getResumeVersions(),
        authFetch('/api/agent/stories'),
        authFetch('/api/interview/sessions'),
        authFetch('/api/agent/intelligence'),
      ]);

      if (appsResult.success) {
        setApplications(appsResult.data || []);
        setApplicationsContextState('ready');
      } else {
        setApplications([]);
        setApplicationsContextState('error');
      }
      if (resumesResult.success) setResumes(resumesResult.data || []);

      if (storiesRes.ok) {
        const data = await storiesRes.json();
        setStories(data.stories || []);
      }
      if (sessionsRes.ok) {
        const data = await sessionsRes.json();
        setSessions(data.sessions || []);
      }
      if (intelligenceRes.ok) {
        const data = await intelligenceRes.json();
        setTwin(normalizeCareerTwinSummary(data.twin));
      }
    } catch (contextError) {
      console.warn('[Interview Studio] Context load failed', contextError);
      setApplicationsContextState('error');
    } finally {
      setLoadingContext(false);
    }
  }, [user]);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  const selectedApplication = useMemo(
    () => applications.find(app => app.id === applicationId),
    [applications, applicationId],
  );

  const selectedResume = useMemo(
    () => resumes.find(resume => resume.id === resumeVersionId),
    [resumes, resumeVersionId],
  );

  const applicationOptions = useMemo<DropdownOption[]>(() => [
    { value: '', label: 'Blank or pasted JD', description: 'Use manual company, role, and JD context' },
    ...applications.map(app => ({
      value: app.id,
      label: `${app.job_title || 'Role'} at ${app.company_name || 'Unknown company'}`,
      description: app.status ? app.status.replaceAll('_', ' ') : undefined,
    })),
  ], [applications]);

  const resumeOptions = useMemo<DropdownOption[]>(() => [
    { value: '', label: 'No resume selected', description: 'Practice without a resume version' },
    ...resumes.map(resume => ({
      value: resume.id,
      label: resume.version_name,
      description: resume.mode ? `${resume.mode} resume` : undefined,
    })),
  ], [resumes]);

  const relevantStories = useMemo(() => {
    const haystack = `${role} ${company} ${jobDescription}`.toLowerCase();
    const scored = stories.map(story => {
      const tags = story.tags || [];
      const score = tags.reduce((total, tag) => total + (haystack.includes(tag.toLowerCase()) ? 1 : 0), 0);
      return { story, score };
    });
    return scored.sort((a, b) => b.score - a.score).slice(0, 5).map(item => item.story);
  }, [stories, role, company, jobDescription]);

  const keywords = useMemo(() => {
    const words = jobDescription.toLowerCase().match(/\b[a-z][a-z0-9+#.-]{3,}\b/g) || [];
    const blocked = new Set(['with', 'that', 'this', 'will', 'have', 'from', 'your', 'team', 'work', 'role', 'experience', 'years']);
    return [...new Set(words.filter(word => !blocked.has(word)))].slice(0, 12);
  }, [jobDescription]);

  const sessionTranscript = mode === 'sona_live' || mode === 'avatar_live' ? gemini.fullTranscript : typedTranscript;

  const askSona = useCallback((prompt: string, contextLabel = 'Interview Studio') => {
    window.dispatchEvent(new CustomEvent('assistant:open', { detail: { prompt, contextLabel } }));
  }, []);

  const applyApplication = useCallback((id: string) => {
    setApplicationId(id);
    const app = applications.find(item => item.id === id);
    if (!app) return;
    setCompany(app.company_name || '');
    setRole(app.job_title || '');
    setJobDescription(app.job_description || '');
    setResumeVersionId(app.resume_version_id || '');
  }, [applications]);

  const handledApplicationLinkRef = useRef(false);
  useEffect(() => {
    if (loadingContext || applicationsContextState === 'idle' || handledApplicationLinkRef.current) return;
    const requestedApplicationId = searchParams.get('application');
    if (!requestedApplicationId) return;
    handledApplicationLinkRef.current = true;
    if (requestedApplicationId.length > 200) {
      setApplicationLinkError('This application link is invalid. Open Applications and choose the interview again.');
      return;
    }
    if (applicationsContextState === 'error') {
      setApplicationLinkError('Application context could not be loaded. Your debrief has not been changed.');
      return;
    }
    if (applications.some(application => application.id === requestedApplicationId)) {
      applyApplication(requestedApplicationId);
      setApplicationLinkError('');
    } else {
      setApplicationLinkError('This application is no longer available. Open Applications to choose another interview.');
    }
  }, [applications, applicationsContextState, applyApplication, loadingContext, searchParams]);

  const retryApplicationContext = useCallback(() => {
    handledApplicationLinkRef.current = false;
    setApplicationLinkError('');
    setApplicationsContextState('idle');
    void loadContext();
  }, [loadContext]);

  const createSession = useCallback(async (status: 'draft' | 'active' = 'active', overrides: Record<string, any> = {}) => {
    const res = await authFetch('/api/interview/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: mode === 'debrief_review' ? 'sona_live' : mode,
        source: applicationId ? 'application' : resumeVersionId ? 'resume' : jobDescription ? 'pasted_jd' : 'manual',
        status,
        persona: persona.id,
        interviewType,
        intensity,
        durationTarget,
        company,
        role,
        jobDescription,
        resumeVersionId,
        applicationId,
        ...overrides,
      }),
    });
    if (!res.ok) throw new Error('Could not create interview session');
    const data = await res.json();
    setActiveSessionId(data.id);
    return data.id as string;
  }, [applicationId, company, durationTarget, intensity, interviewType, jobDescription, mode, persona.id, resumeVersionId, role]);

  const generateQuestions = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      if (!user) {
        setShowAuth('signup');
        return;
      }

      const sessionId = await createSession('active');
      const count = mode === 'quick_drill' ? 1 : 5;
      let nextQuestions = fallbackQuestions(mode, interviewType, role);

      try {
        const res = await authFetch('/api/gauntlet/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'interview',
            questionCount: count,
            interviewType: mode === 'full_mock' ? 'mock' : undefined,
            drillCategory: interviewType,
            drillRole: role,
            jobDescription,
            persona: persona.id,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.questions) && data.questions.length > 0) {
            nextQuestions = data.questions.slice(0, count);
          }
        }
      } catch {
        // Local fallback keeps practice usable if generation fails.
      }

      setQuestions(nextQuestions);
      setQuestionIndex(0);
      setDraftAnswer('');
      setTypedTranscript([]);
      setGrade(null);
      setTelemetry(null);
      roomStartRef.current = Date.now();
      setPhase('room');
      await authFetch('/api/interview/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId, rubric: nextQuestions }),
      });
    } catch (startError: any) {
      setError(startError.message || 'Could not start practice');
    } finally {
      setBusy(false);
    }
  }, [createSession, interviewType, jobDescription, mode, persona.id, role, user]);

  const generateStudyCards = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      if (!user) {
        setShowAuth('signup');
        return;
      }
      const sessionId = await createSession('active', { mode: 'study_cards' });
      const res = await authFetch('/api/gauntlet/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'flashcards',
          questionCount: 10,
          drillRole: role,
          jobDescription,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not generate study cards');
      const cards: StudyCard[] = Array.isArray(data.flashcards) ? data.flashcards : [];
      if (cards.length === 0) throw new Error('No study cards were generated');

      setStudyCards(cards);
      setStudyCardIndex(0);
      setStudyCardFlipped(false);
      setGrade(null);
      setTelemetry(null);
      roomStartRef.current = Date.now();
      setPhase('room');

      await authFetch('/api/interview/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId, rubric: cards, status: 'active' }),
      });
    } catch (cardError: any) {
      setError(cardError.message || 'Could not generate study cards');
    } finally {
      setBusy(false);
    }
  }, [createSession, jobDescription, role, user]);

  const startLiveRoom = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      if (!user) {
        setShowAuth('signup');
        return;
      }
      await createSession('active');
      setTypedTranscript([]);
      setGrade(null);
      setTelemetry(null);
      roomStartRef.current = Date.now();
      setPhase('room');
      setTimeout(() => {
        gemini.connect({
          persona: persona.id,
          jobDescription,
          interviewStyle: interviewType,
          avatarMode: mode === 'avatar_live',
        });
      }, 500);
    } catch (startError: any) {
      setError(startError.message || 'Could not start the live room');
    } finally {
      setBusy(false);
    }
  }, [createSession, gemini, interviewType, jobDescription, mode, persona.id, user]);

  const startWhiteboard = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      if (!user) {
        setShowAuth('signup');
        return;
      }
      await createSession('active', {
        mode: 'technical_whiteboard',
        whiteboard: { mode: whiteboardMode, prompt: whiteboardPrompt, ...whiteboard },
      });
      setGrade(null);
      roomStartRef.current = Date.now();
      setPhase('room');
    } catch (startError: any) {
      setError(startError.message || 'Could not start whiteboard');
    } finally {
      setBusy(false);
    }
  }, [createSession, user, whiteboard, whiteboardMode, whiteboardPrompt]);

  const gradeSession = useCallback(async (transcript: TranscriptEntry[], elapsedOverride?: number) => {
    setBusy(true);
    setError('');
    try {
      const measuredElapsed = roomStartRef.current ? Math.round((Date.now() - roomStartRef.current) / 1000) : undefined;
      const elapsedSeconds = elapsedOverride ?? measuredElapsed;
      const nextTelemetry = elapsedSeconds ? analyzeInterview(transcript, elapsedSeconds, jobDescription || undefined) : null;
      setTelemetry(nextTelemetry);
      const res = await authFetch('/api/interview/session-grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          transcript,
          telemetry: nextTelemetry,
          company,
          role,
          jobDescription,
          persona: persona.id,
          interviewType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not grade session');
      setGrade(data.grade);
      setPhase('debrief');
      loadContext();
    } catch (gradeError: any) {
      setError(gradeError.message || 'Could not grade session');
    } finally {
      setBusy(false);
    }
  }, [activeSessionId, company, interviewType, jobDescription, loadContext, persona.id, role]);

  const submitTypedAnswer = useCallback(async () => {
    const answer = draftAnswer.trim();
    const question = questions[questionIndex];
    if (!answer || !question) return;

    const nextTranscript: TranscriptEntry[] = [
      ...typedTranscript,
      { role: 'ai', text: question.text },
      { role: 'user', text: answer },
    ];
    setTypedTranscript(nextTranscript);
    setDraftAnswer('');

    if (questionIndex >= questions.length - 1) {
      await authFetch('/api/interview/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeSessionId, transcript: nextTranscript }),
      });
      gradeSession(nextTranscript);
    } else {
      setQuestionIndex(index => index + 1);
      await authFetch('/api/interview/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeSessionId, transcript: nextTranscript }),
      });
    }
  }, [activeSessionId, draftAnswer, gradeSession, questionIndex, questions, typedTranscript]);

  const endLiveRoom = useCallback(async () => {
    const transcript = gemini.getTranscript();
    const elapsed = gemini.elapsedSeconds || undefined;
    gemini.disconnect();
    await authFetch('/api/interview/sessions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: activeSessionId, transcript, status: 'completed' }),
    });
    await gradeSession(transcript, elapsed);
  }, [activeSessionId, gemini, gradeSession]);

  const gradeWhiteboard = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const res = await authFetch('/api/interview/whiteboard-grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          mode: whiteboardMode,
          prompt: whiteboardPrompt,
          ...whiteboard,
          role,
          company,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not grade whiteboard');
      setGrade(data.grade);
      setPhase('debrief');
      loadContext();
    } catch (gradeError: any) {
      setError(gradeError.message || 'Could not grade whiteboard');
    } finally {
      setBusy(false);
    }
  }, [activeSessionId, company, loadContext, role, whiteboard, whiteboardMode, whiteboardPrompt]);

  const abandonSession = useCallback(async () => {
    if (gemini.isConnected || gemini.isConnecting) gemini.disconnect();
    if (activeSessionId) {
      await authFetch('/api/interview/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeSessionId, status: 'abandoned', transcript: sessionTranscript }),
      });
    }
    setPhase('setup');
  }, [activeSessionId, gemini, sessionTranscript]);

  const launchCurrentMode = () => {
    if (mode === 'quick_drill' || mode === 'full_mock') return generateQuestions();
    if (mode === 'study_cards') return generateStudyCards();
    if (mode === 'technical_whiteboard') return startWhiteboard();
    if (mode === 'debrief_review') return setPhase('setup');
    return startLiveRoom();
  };

  return (
    <SuiteToolShell variant="workbench" contentClassName="gap-4">
        <SuiteToolHeader
          tool="interview-sim"
          subtitle="Practice with Taco, connect your applications and stories, then leave with a saved debrief and sharper next drills."
          meta={
            <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
              {modeLabel(mode)}
            </span>
          }
          actions={
            <>
              <button
                type="button"
                onClick={() => askSona(`Help me prepare for a ${role || 'target role'} interview${company ? ` at ${company}` : ''}.`, 'Interview Studio')}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
              >
                <AssistantMark size="xs" state="listening" />
                Ask Taco
              </button>
            </>
          }
        />

        {phase === 'setup' && (
          <>
            <section className="overflow-hidden rounded-[24px] border border-[var(--border-subtle)] bg-[var(--card-bg)]">
              <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Today&apos;s practice</p>
                  <h2 className="mt-1 text-xl font-bold text-[var(--text-primary)]">
                    {company || role ? `${role || 'Target role'}${company ? ` at ${company}` : ''}` : getTwinInterviewTarget(twin)}
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="material-symbols-rounded text-[16px]" aria-hidden="true">auto_stories</span>
                      {relevantStories.length > 0 ? `${relevantStories.length} stories ready` : twin?.behavioralBank?.totalStories ? `${twin.behavioralBank.totalStories} in bank` : 'No stories yet'}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="material-symbols-rounded text-[16px]" aria-hidden="true">description</span>
                      {selectedResume?.version_name || (twin?.memory?.confirmedFacts?.hasResume ? 'Resume linked' : 'No resume')}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="material-symbols-rounded text-[16px]" aria-hidden="true">monitoring</span>
                      {sessions.length > 0 ? `${sessions.length} past sessions` : 'First session'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={launchCurrentMode}
                  disabled={busy}
                  className="elevation-card inline-flex min-h-12 shrink-0 items-center gap-2 rounded-2xl bg-[var(--accent)] px-6 text-base font-bold text-[var(--accent-on)] transition hover:bg-[var(--accent-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="material-symbols-rounded text-[22px]">{busy ? 'hourglass_top' : 'play_arrow'}</span>
                  {busy ? 'Starting' : `Start ${modeLabel(mode)}`}
                </button>
              </div>
            </section>

            <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Practice modes">
              {MODES.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setMode(item.id); setPhase('setup'); setError(''); }}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30 ${
                    mode === item.id
                      ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                  }`}
                  aria-pressed={mode === item.id}
                >
                  {item.id === 'sona_live' ? (
                    <AssistantMark size="xs" state={mode === item.id ? 'listening' : 'idle'} />
                  ) : (
                    <span className="material-symbols-rounded text-[18px]">{item.icon}</span>
                  )}
                  {item.label}
                </button>
              ))}
            </nav>
          </>
        )}

        <div className={`grid gap-4 ${phase === 'setup' ? 'xl:grid-cols-[320px_minmax(0,1fr)_340px]' : ''}`}>
          {phase === 'setup' && (
            <aside className="space-y-4">
              <Panel title="Context" icon="tune">
                <div className="space-y-4">
                  <Field label="Application context">
                    <CustomDropdown
                      value={applicationId}
                      options={applicationOptions}
                      onChange={applyApplication}
                      icon="work"
                      placeholder="Choose application context"
                    />
                  </Field>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <Field label="Company">
                      <input value={company} onChange={event => setCompany(event.target.value)} placeholder="Company" className="studio-input" />
                    </Field>
                    <Field label="Role">
                      <input value={role} onChange={event => setRole(event.target.value)} placeholder="Target role" className="studio-input" />
                    </Field>
                  </div>

                  <Field label="Resume version">
                    <CustomDropdown
                      value={resumeVersionId}
                      options={resumeOptions}
                      onChange={setResumeVersionId}
                      icon="description"
                      placeholder="Choose resume version"
                    />
                  </Field>

                  <Field label="Job description">
                    <textarea
                      value={jobDescription}
                      onChange={event => setJobDescription(event.target.value)}
                      rows={4}
                      placeholder="Paste the job description, scorecard, or recruiter notes."
                      className="studio-input min-h-[100px] resize-y"
                    />
                  </Field>
                </div>
              </Panel>
            </aside>
          )}

          <div className="min-w-0">
            <AnimatePresence mode="wait">
              {phase === 'setup' && (
                <motion.div key="setup" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
                  {loadingContext && (
                    <AssistantThinkingTile
                      title="Taco is loading your interview context"
                      description="Checking applications, resumes, Story Bank, and saved debriefs."
                      compact
                    />
                  )}

                  {mode === 'debrief_review' ? (
                    <SessionHistory
                      sessions={sessions}
                      askSona={askSona}
                      selectedApplication={selectedApplication}
                      applicationLinkError={applicationLinkError}
                      onRetryApplicationContext={retryApplicationContext}
                    />
                  ) : (
                    <PracticeLauncher
                        mode={mode}
                        busy={busy}
                        onStart={launchCurrentMode}
                        persona={persona}
                        setPersona={setPersona}
                        interviewType={interviewType}
                        setInterviewType={setInterviewType}
                        intensity={intensity}
                        setIntensity={setIntensity}
                        durationTarget={durationTarget}
                        setDurationTarget={setDurationTarget}
                      >
                      {mode === 'technical_whiteboard' && (
                        <div className="mt-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                          <div className="mb-3 flex flex-wrap gap-2">
                            {(['coding', 'system_design', 'case'] as const).map(item => (
                              <button
                                key={item}
                                type="button"
                                onClick={() => setWhiteboardMode(item)}
                                className={`inline-flex min-h-11 items-center rounded-xl border px-3 py-1.5 text-xs font-semibold ${whiteboardMode === item ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--text-primary)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'}`}
                              >
                                {item.replace('_', ' ')}
                              </button>
                            ))}
                          </div>
                          <Field label="Whiteboard prompt">
                            <textarea value={whiteboardPrompt} onChange={event => setWhiteboardPrompt(event.target.value)} rows={3} className="studio-input" />
                          </Field>
                        </div>
                      )}
                    </PracticeLauncher>
                  )}

                  {mode !== 'debrief_review' && (
                    <InterviewReadinessCockpit
                      role={role}
                      company={company}
                      jobDescription={jobDescription}
                      selectedResume={selectedResume}
                      relevantStories={relevantStories}
                      sessions={sessions}
                      keywords={keywords}
                      twin={twin}
                      mode={mode}
                      onAskSona={() => askSona(
                        `Build a focused interview plan for ${role || 'my target role'}${company ? ` at ${company}` : ''}. Use my selected resume, Story Bank matches, JD keywords, saved debriefs, and weak spots. Give me the next three drills and keep it truthful.`,
                        'Interview readiness',
                      )}
                      onReviewDebriefs={() => {
                        setMode('debrief_review');
                        setPhase('setup');
                        setError('');
                      }}
                      onStartDrill={(drill) => {
                        setMode('quick_drill');
                        askSona(`Start a quick drill focused on: ${drill}`, 'Interview Studio');
                      }}
                    />
                  )}

                  {error && <ErrorBanner message={error} />}
                </motion.div>
              )}

              {phase === 'room' && (
                <motion.div key="room" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
                  {mode === 'technical_whiteboard' ? (
                    <WhiteboardRoom
                      mode={whiteboardMode}
                      prompt={whiteboardPrompt}
                      whiteboard={whiteboard}
                      setWhiteboard={setWhiteboard}
                      onGrade={gradeWhiteboard}
                      onAbandon={abandonSession}
                      busy={busy}
                    />
                  ) : mode === 'sona_live' || mode === 'avatar_live' ? (
                    <LiveRoom
                      mode={mode}
                      persona={persona}
                      gemini={gemini}
                      transcriptRef={transcriptRef}
                      onEnd={endLiveRoom}
                      onAbandon={abandonSession}
                      busy={busy}
                    />
                  ) : mode === 'study_cards' ? (
                    <StudyCardsRoom
                      cards={studyCards}
                      index={studyCardIndex}
                      flipped={studyCardFlipped}
                      setFlipped={setStudyCardFlipped}
                      onPrev={() => {
                        setStudyCardIndex(index => Math.max(0, index - 1));
                        setStudyCardFlipped(false);
                      }}
                      onNext={() => {
                        setStudyCardIndex(index => Math.min(studyCards.length - 1, index + 1));
                        setStudyCardFlipped(false);
                      }}
                      onFinish={async () => {
                        if (activeSessionId) {
                          await authFetch('/api/interview/sessions', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              id: activeSessionId,
                              status: 'completed',
                              recommendations: ['Review missed cards in Skill Bridge Memory', 'Turn weak cards into Quick Drill prompts'],
                            }),
                          });
                        }
                        setPhase('setup');
                        loadContext();
                      }}
                    />
                  ) : (
                    <TypedPracticeRoom
                      questions={questions}
                      questionIndex={questionIndex}
                      draftAnswer={draftAnswer}
                      setDraftAnswer={setDraftAnswer}
                      onSubmit={submitTypedAnswer}
                      onAbandon={() => setPhase('setup')}
                      transcript={typedTranscript}
                      transcriptRef={transcriptRef}
                      busy={busy}
                    />
                  )}
                  {error && <ErrorBanner message={error} />}
                </motion.div>
              )}

              {phase === 'debrief' && (
                <motion.div key="debrief" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
                  {busy && <AssistantThinkingTile title="Taco is preparing your debrief" description="Reading the transcript, delivery telemetry, and role context." stages={['Transcript', 'Rubric', 'Next drills']} />}
                  {!busy && (
                    <DebriefPanel
                      grade={grade}
                      telemetry={telemetry}
                      onRestart={() => setPhase('setup')}
                      onAskSona={() => askSona(`Review my Interview Studio debrief for ${role || 'my target role'} and give me a focused practice plan.`, 'Interview debrief')}
                      onStartDrill={(drillTitle) => {
                        setMode('quick_drill');
                        setPhase('setup');
                        askSona(`Start a quick drill focused on: ${drillTitle}`, 'Interview Studio');
                      }}
                    />
                  )}
                  {error && <ErrorBanner message={error} />}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {phase === 'setup' && (
            <aside className="space-y-4">
              <Panel title="Taco intelligence" icon="psychology">
                <div className="space-y-4">
                  <InfoBlock title="Session goals" items={[
                    role ? `Position answers for ${role}` : 'Clarify your target role before practice',
                    jobDescription ? 'Mirror the most important JD keywords' : 'Paste a JD for tighter coaching',
                    relevantStories.length
                      ? 'Use saved STAR stories as proof'
                      : twin?.behavioralBank?.totalStories
                        ? `Use ${twin.behavioralBank.totalStories} Career Twin proof stories`
                        : 'Add Story Bank examples for stronger behavioral answers',
                  ]} />

                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Story Bank matches</h3>
                    <div className="space-y-2">
                      {relevantStories.length > 0 ? relevantStories.map(story => (
                        <div key={story.id} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                          <p className="text-sm font-semibold text-[var(--text-primary)]">{story.title || 'Untitled story'}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">{story.result || story.situation || 'Ready to map into a STAR answer.'}</p>
                        </div>
                      )) : twin?.behavioralBank?.totalStories ? (
                        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                          <p className="text-sm font-semibold text-[var(--text-primary)]">{twin.behavioralBank.totalStories} proof stories available</p>
                          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                            Covers {twin.behavioralBank.coveredCategories.slice(0, 3).join(', ') || 'saved competencies'}.
                          </p>
                          {twin.behavioralBank.uncoveredCategories.length > 0 && (
                            <p className="mt-2 text-xs leading-5 text-[var(--warning)]">
                              Gap to prepare: {twin.behavioralBank.uncoveredCategories[0]}.
                            </p>
                          )}
                        </div>
                      ) : (
                        <EmptyMini icon="auto_stories" text="No matching stories yet. Taco can still help you draft answers from scratch." />
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">JD keywords</h3>
                    <div className="flex flex-wrap gap-2">
                      {keywords.length > 0 ? keywords.map(keyword => (
                        <span key={keyword} className="rounded-full bg-[var(--tag-blue-bg)] px-2.5 py-1 text-xs font-medium text-[var(--tag-blue-text)]">{keyword}</span>
                      )) : <EmptyMini icon="key" text="Paste a JD to reveal keywords Taco should listen for." />}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => askSona(`Predict interview questions for ${role || 'my target role'}${company ? ` at ${company}` : ''} using my current context.`, 'Interview Studio')}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]"
                  >
                    <AssistantMark size="xs" state="thinking" />
                    Predict questions
                  </button>
                </div>
              </Panel>
            </aside>
          )}
        </div>


      <style jsx global>{`
        .studio-input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid var(--border-subtle);
          background: var(--bg-surface);
          color: var(--text-primary);
          padding: 0.625rem 0.75rem;
          font-size: 16px;
          outline: none;
        }
        .studio-input:focus {
          border-color: var(--accent);
          outline: 3px solid color-mix(in srgb, var(--accent) 24%, transparent);
          outline-offset: 0px;
        }
      `}</style>

      {showAuth && (
        <AuthModal
          mode={showAuth}
          onClose={() => setShowAuth(null)}
          onSwitchMode={() => setShowAuth(showAuth === 'login' ? 'signup' : 'login')}
        />
      )}
    </SuiteToolShell>
  );
}

function Panel({ title, icon, children, action }: { title: string; icon: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {icon === 'sona' ? <AssistantMark size="sm" state="listening" title="Taco" /> : <AnimatedToolIcon icon={icon} size="xs" tone="blue" />}
          <h2 className="truncate text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  );
}

function CustomDropdown({ value, options, onChange, icon, placeholder = 'Select option' }: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  icon: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(option => option.value === value);

  return (
    <div
      className="relative"
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className={`flex min-h-[46px] w-full items-center gap-3 rounded-xl border bg-[var(--bg-surface)] px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30 ${
          open ? 'border-[var(--accent)]' : 'border-[var(--border-subtle)] hover:border-[var(--border)]'
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="material-symbols-rounded shrink-0 text-[19px] text-[var(--accent)]">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{selected?.label || placeholder}</span>
          {selected?.description && <span className="block truncate text-[11px] text-[var(--text-muted)]">{selected.description}</span>}
        </span>
        <span className={`material-symbols-rounded shrink-0 text-[20px] text-[var(--text-muted)] transition ${open ? 'rotate-180' : ''}`}>expand_more</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-1.5"
        >
          {options.map(option => {
            const active = option.value === value;
            return (
              <button
                key={option.value || 'empty-option'}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex min-h-11 w-full min-w-0 items-start gap-2 rounded-xl px-3 py-2.5 text-left transition ${
                  active ? 'bg-[var(--accent-dim)] text-[var(--text-primary)]' : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <span className={`material-symbols-rounded mt-0.5 shrink-0 text-[17px] text-[var(--accent)] ${active ? 'opacity-100' : 'opacity-0'}`}>check</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{option.label}</span>
                  {option.description && <span className="block truncate text-[11px] text-[var(--text-muted)]">{option.description}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InterviewReadinessCockpit({
  role,
  company,
  jobDescription,
  selectedResume,
  relevantStories,
  sessions,
  keywords,
  twin,
  mode,
  onAskSona,
  onReviewDebriefs,
  onStartDrill,
}: {
  role: string;
  company: string;
  jobDescription: string;
  selectedResume?: ResumeVersion;
  relevantStories: StarStory[];
  sessions: InterviewSession[];
  keywords: string[];
  twin?: CareerTwinSummary | null;
  mode: StudioMode;
  onAskSona: () => void;
  onReviewDebriefs: () => void;
  onStartDrill?: (drill: string) => void;
}) {
  const readiness = buildInterviewReadiness({
    role,
    company,
    jobDescription,
    selectedResume,
    relevantStories,
    sessions,
    keywords,
    twin,
  });
  const readyCount = readiness.filter(item => item.status === 'ready').length;
  const reviewCount = readiness.filter(item => item.status === 'review').length;
  const blockedCount = readiness.filter(item => item.status === 'blocked').length;
  const nextDrills = [
    relevantStories.length > 0
      ? `Practice ${relevantStories[0].title || 'top STAR story'}`
      : twin?.behavioralBank?.uncoveredCategories?.[0]
        ? `Add proof for ${twin.behavioralBank.uncoveredCategories[0]}`
        : 'Capture one STAR story',
    keywords[0]
      ? `Answer a question about ${keywords[0]}`
      : twin?.memory?.activeSearch?.skillGaps?.[0]
        ? `Close ${twin.memory.activeSearch.skillGaps[0]} gap`
        : 'Paste a job description',
    mode === 'technical_whiteboard' ? 'Run the whiteboard rubric' : 'Finish with a scored debrief',
  ];

  return (
    <section className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4 sm:p-5">
      <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Interview readiness</p>
          <h2 className="premium-heading-wrap mt-1 text-xl font-bold text-[var(--text-primary)]">
            {role || company ? `${role || 'Target role'}${company ? ` at ${company}` : ''}` : getTwinInterviewTarget(twin)}
          </h2>
          <p className="premium-copy-wrap mt-1 text-sm leading-6 text-[var(--text-secondary)]">
            Taco checks role context, resume proof, stories, JD cues, saved debriefs, and the next drill before practice starts.
          </p>
        </div>
        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <div className="text-center">
            <span className="text-2xl font-black tabular-nums text-[var(--text-primary)]">{readyCount}</span>
            <span className="text-sm font-bold text-[var(--text-muted)]"> / {readiness.length}</span>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Ready</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-1">
        {readiness.map(item => (
          <div key={item.label} className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                <span className="material-symbols-rounded icon-neutral mt-0.5 shrink-0 text-[18px]" aria-hidden="true">{item.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--text-primary)]">{item.label}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{item.description}</p>
                </div>
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-bold ${INTERVIEW_READINESS_CLASS[item.status]}`}>
                {item.statusLabel}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
          <p className="text-xl font-black tabular-nums text-[var(--text-primary)]">{readyCount}</p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Ready</p>
        </div>
        <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
          <p className="text-xl font-black tabular-nums text-[var(--text-primary)]">{reviewCount}</p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Review</p>
        </div>
        <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
          <p className="text-xl font-black tabular-nums text-[var(--text-primary)]">{blockedCount}</p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">To do</p>
        </div>
      </div>

      <div className="mt-4 rounded-[18px] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] bg-[var(--accent-dim)] p-4">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-bold text-[var(--text-primary)]">Next drill sequence</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {nextDrills.map((drill, index) => (
                <button
                  key={`${drill}-${index}`}
                  type="button"
                  onClick={() => onStartDrill?.(drill)}
                  className="min-h-[44px] rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3 text-left transition hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:bg-[var(--accent-hover)]"
                >
                  <p className="text-[11px] font-black tabular-nums text-[var(--accent)]">0{index + 1}</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-secondary)]">{drill}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
            <button
              type="button"
              onClick={onAskSona}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90"
            >
              <AssistantMark size="xs" state="listening" />
              Build plan
            </button>
            <button
              type="button"
              onClick={onReviewDebriefs}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)]"
            >
              <span className="material-symbols-rounded text-[18px]" aria-hidden="true">monitoring</span>
              Debriefs
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function PracticeLauncher({
  mode,
  busy,
  onStart,
  persona,
  setPersona,
  interviewType,
  setInterviewType,
  intensity,
  setIntensity,
  durationTarget,
  setDurationTarget,
  children,
}: {
  mode: StudioMode;
  busy: boolean;
  onStart: () => void;
  persona: Persona;
  setPersona: (persona: Persona) => void;
  interviewType: string;
  setInterviewType: (value: string) => void;
  intensity: string;
  setIntensity: (value: string) => void;
  durationTarget: number;
  setDurationTarget: (value: number) => void;
  children?: React.ReactNode;
}) {
  const modeDef = MODES.find(item => item.id === mode) || MODES[0];
  const startLabel = busy
    ? 'Starting'
    : mode === 'technical_whiteboard'
      ? 'Open whiteboard'
      : mode === 'study_cards'
        ? 'Generate cards'
        : 'Start practice';
  const intensityOptions = [
    { value: 'supportive', label: 'Supportive', detail: 'Warm coaching' },
    { value: 'balanced', label: 'Balanced', detail: 'Realistic pace' },
    { value: 'pressure', label: 'Pressure', detail: 'Sharper follow-ups' },
  ];
  const durationOptions = [
    { value: 10, label: '10 min', detail: 'Warm-up' },
    { value: 20, label: '20 min', detail: 'Focused' },
    { value: 30, label: '30 min', detail: 'Standard' },
    { value: 45, label: '45 min', detail: 'Deep' },
  ];

  const [settingsOpen, setSettingsOpen] = useState(false);
  const readySummary = `${persona.label} · ${INTERVIEW_TYPES.find(item => item.id === interviewType)?.label.toLowerCase() || 'mixed'} · ${durationTarget} min · ${intensity}`;

  return (
    <section className="overflow-hidden rounded-[24px] border border-[var(--border-subtle)] bg-[var(--card-bg)]">
      <div className="p-4 sm:p-5">
        <div className="grid gap-4">
          <div className="flex min-w-0 items-start gap-3">
            {modeDef.id === 'sona_live' ? (
              <AssistantMark size="sm" state="listening" title="Live Interview with Taco" />
            ) : (
              <AnimatedToolIcon icon={modeDef.icon} size="sm" state="active" />
            )}
            <div className="min-w-0">
              <h2 className="text-xl font-bold leading-tight text-[var(--text-primary)]">{modeDef.label}</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{modeDef.desc}</p>
              <p className="mt-2 text-xs font-medium text-[var(--text-muted)]">{readySummary}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onStart}
              disabled={busy}
              className="elevation-card inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[14px] bg-[var(--accent)] px-5 text-sm font-bold text-[var(--accent-on)] transition hover:bg-[var(--accent-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="material-symbols-rounded text-[19px]">{busy ? 'hourglass_top' : 'play_arrow'}</span>
              {startLabel}
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(prev => !prev)}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[14px] border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
              aria-expanded={settingsOpen}
            >
              <span className="material-symbols-rounded text-[16px]">tune</span>
              Customize
              <span className={`material-symbols-rounded text-[16px] transition-transform ${settingsOpen ? 'rotate-180' : ''}`}>expand_more</span>
            </button>
          </div>
        </div>
      </div>

      {settingsOpen && (
        <div className="space-y-4 border-t border-[var(--border-subtle)] p-4 sm:p-5">
          <div className="rounded-[22px] border border-[color-mix(in_srgb,var(--accent)_24%,transparent)] bg-[var(--accent-dim)] p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--accent)]">
                <span className="material-symbols-rounded text-[30px]">{persona.icon}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Interviewer persona</p>
                <h3 className="mt-1 text-2xl font-bold leading-tight text-[var(--text-primary)]">{persona.label}</h3>
                <p className="mt-2 max-w-[58ch] text-sm leading-6 text-[var(--text-secondary)]">{persona.desc}</p>
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                  Active voice: {persona.voice}
                </div>
              </div>
            </div>

            <div className="mt-5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Choose interviewer</p>
              <div className="grid grid-cols-3 gap-2">
                {PERSONAS.map(item => {
                  const active = persona.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={item.label}
                      aria-label={`Choose ${item.label} interviewer`}
                      onClick={() => setPersona(item)}
                      className={`grid aspect-square min-h-12 place-items-center rounded-[14px] border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30 ${
                        active
                          ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--text-primary)] ring-1 ring-[color-mix(in_srgb,var(--accent)_20%,transparent)]'
                          : 'border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[var(--bg-elevated)] ${active ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>
                        <span className="material-symbols-rounded text-[18px]">{item.icon}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Interview type</p>
              <div className="grid grid-cols-2 gap-2">
                {INTERVIEW_TYPES.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setInterviewType(item.id)}
                    className={`flex min-h-[46px] items-center justify-center rounded-[12px] border px-3 text-center text-[12px] font-bold leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30 ${
                      interviewType === item.id
                        ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--text-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              <ChoiceGroup
                label="Intensity"
                value={intensity}
                options={intensityOptions}
                onChange={setIntensity}
              />
              <ChoiceGroup
                label={mode === 'quick_drill' ? 'Drill time' : 'Duration'}
                value={String(durationTarget)}
                options={durationOptions.map(item => ({ ...item, value: String(item.value) }))}
                onChange={value => setDurationTarget(Number(value))}
              />
            </div>
          </div>

          {children && <div>{children}</div>}
        </div>
      )}
    </section>
  );
}

function ChoiceGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; detail: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</p>
      <div className="grid gap-2">
        {options.map(option => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`flex min-h-[46px] items-center justify-between gap-3 rounded-[13px] border px-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30 ${
                active
                  ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--text-primary)]'
                  : 'border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              <span className="min-w-0">
                <span className="block text-sm font-bold leading-tight">{option.label}</span>
                <span className="mt-0.5 block text-[11px] leading-tight text-[var(--text-muted)]">{option.detail}</span>
              </span>
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${active ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-on)]' : 'border-[var(--border)] text-transparent'}`}>
                <span className="material-symbols-rounded text-[14px]">check</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LiveRoom({ mode, persona, gemini, transcriptRef, onEnd, onAbandon, busy }: {
  mode: StudioMode;
  persona: Persona;
  gemini: ReturnType<typeof useGeminiLiveAvatar>;
  transcriptRef: React.Ref<HTMLDivElement>;
  onEnd: () => void;
  onAbandon: () => void;
  busy: boolean;
}) {
  return (
    <Panel title={mode === 'avatar_live' ? 'Avatar Live Room' : 'Live Interview with Taco'} icon={mode === 'avatar_live' ? 'spatial_audio' : 'sona'} action={(
      <div className="flex items-center gap-2">
        <button type="button" onClick={onAbandon} className="inline-flex min-h-11 items-center rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">Exit</button>
        <button type="button" onClick={onEnd} disabled={busy || (!gemini.isConnected && !gemini.fullTranscript.length)} className="inline-flex min-h-11 items-center rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-bold text-[var(--accent-on)] transition hover:bg-[var(--accent-active)] disabled:opacity-50">End and debrief</button>
      </div>
    )}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="relative min-h-[440px] overflow-hidden rounded-[24px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          {mode === 'avatar_live' ? (
            <AvatarCanvas isSpeaking={gemini.isSpeaking} isConnected={gemini.isConnected} />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
              <AssistantMark size="lg" state={gemini.isSpeaking ? 'responding' : gemini.isListening ? 'listening' : gemini.isConnecting ? 'thinking' : 'idle'} title="Taco live interview" />
              <h3 className="mt-5 text-xl font-bold text-[var(--text-primary)]">{gemini.isConnected ? 'Taco is in the room' : gemini.isConnecting ? 'Connecting live room' : 'Ready when you are'}</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-[var(--text-secondary)]">
                Taco will interview you with voice, save the transcript, then turn the session into a coaching plan.
              </p>
            </div>
          )}
          <div className="absolute left-4 top-4 rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
            {/* The failure is read first. Not every error clears isConnected -
                'Microphone access denied' (hooks/useGeminiLiveAvatar.ts:393)
                and 'WebSocket connection error' (:176) both leave it true - so
                ranking isConnected above error printed "Connected" directly
                above a card saying the session had failed. Two words because
                the two cases are different: the socket never opened, or it
                opened and something stopped. */}
            {gemini.error
              ? (gemini.isConnected ? 'Interrupted' : 'Not connected')
              : gemini.isListening ? 'Listening'
              : gemini.isSpeaking ? 'Taco responding'
              : gemini.isConnected ? 'Connected'
              : 'Preparing'}
          </div>
          {/* The failure itself gets room to say what happened. It used to be
              squeezed into the pill above, so the free interview-practice cap
              read as a one-line status with no way out. Rendered outside the
              avatar/voice branch so both live modes get it. */}
          {gemini.error && (
            <div className="absolute inset-x-4 bottom-4 min-w-0 rounded-[12px] border border-[color-mix(in_srgb,var(--warning)_24%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] p-3 text-left">
              <p className="min-w-0 text-sm leading-6 text-[var(--text-primary)]">{gemini.error}</p>
              {gemini.errorUpgradeUrl && (
                <Link
                  href={gemini.errorUpgradeUrl}
                  className="mt-2 inline-flex min-h-11 min-w-0 items-center gap-1.5 text-sm font-semibold text-[var(--accent)] hover:underline"
                >
                  <span className="material-symbols-rounded text-[17px]">bolt</span>
                  {UPGRADE_COPY.primaryCta}
                </Link>
              )}
            </div>
          )}
        </div>
        <TranscriptPanel transcript={gemini.fullTranscript} transcriptRef={transcriptRef} />
      </div>
    </Panel>
  );
}

function TypedPracticeRoom({ questions, questionIndex, draftAnswer, setDraftAnswer, onSubmit, onAbandon, transcript, transcriptRef, busy }: {
  questions: StudioQuestion[];
  questionIndex: number;
  draftAnswer: string;
  setDraftAnswer: (value: string) => void;
  onSubmit: () => void;
  onAbandon: () => void;
  transcript: TranscriptEntry[];
  transcriptRef: React.Ref<HTMLDivElement>;
  busy: boolean;
}) {
  const question = questions[questionIndex];
  return (
    <Panel title={`Question ${Math.min(questionIndex + 1, questions.length)} of ${questions.length}`} icon="forum" action={
      <button type="button" onClick={onAbandon} className="inline-flex min-h-11 items-center rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">Exit</button>
    }>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
          <div className="mb-4 flex flex-wrap gap-2">
            {question?.type && <span className="rounded-full bg-[var(--tag-blue-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--tag-blue-text)]">{question.type}</span>}
            {question?.difficulty && <span className="rounded-full bg-[var(--tag-amber-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--tag-amber-text)]">{question.difficulty}</span>}
          </div>
          <h3 className="premium-heading-wrap text-2xl font-bold text-[var(--text-primary)]">{question?.text || 'Preparing question...'}</h3>
          {question?.context && <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{question.context}</p>}
          <textarea
            value={draftAnswer}
            onChange={event => setDraftAnswer(event.target.value)}
            rows={8}
            aria-label="Your answer"
            placeholder="Type your answer. Use STAR for behavioral answers and narrate trade-offs for technical ones."
            className="studio-input mt-5 min-h-[220px] resize-y"
          />
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className={`text-xs tabular-nums ${draftAnswer.trim().length >= 10 ? 'text-[var(--text-muted)]' : 'text-[var(--warning)]'}`}>
              {draftAnswer.trim().length < 10 ? `${10 - draftAnswer.trim().length} more characters needed` : `${draftAnswer.trim().split(/\s+/).filter(Boolean).length} words`}
            </span>
            <button
              type="button"
              onClick={onSubmit}
              disabled={busy || draftAnswer.trim().length < 10}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[var(--accent-on)] transition hover:bg-[var(--accent-active)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="material-symbols-rounded text-[18px]">{questionIndex >= questions.length - 1 ? 'check_circle' : 'arrow_forward'}</span>
              {questionIndex >= questions.length - 1 ? 'Finish and debrief' : 'Next question'}
            </button>
          </div>
        </div>
        <TranscriptPanel transcript={transcript} transcriptRef={transcriptRef} />
      </div>
    </Panel>
  );
}

function WhiteboardRoom({ mode, prompt, whiteboard, setWhiteboard, onGrade, onAbandon, busy }: {
  mode: 'coding' | 'system_design' | 'case';
  prompt: string;
  whiteboard: { assumptions: string; approach: string; solution: string; complexity: string; tradeoffs: string };
  setWhiteboard: (value: { assumptions: string; approach: string; solution: string; complexity: string; tradeoffs: string }) => void;
  onGrade: () => void;
  onAbandon: () => void;
  busy: boolean;
}) {
  const template = WHITEBOARD_TEMPLATES[mode];
  const update = (key: keyof typeof whiteboard, value: string) => setWhiteboard({ ...whiteboard, [key]: value });
  return (
    <Panel title="Technical Whiteboard" icon="draw" action={(
      <div className="flex items-center gap-2">
        <button type="button" onClick={onAbandon} className="inline-flex min-h-11 items-center rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">Exit</button>
        <button type="button" onClick={onGrade} disabled={busy} className="inline-flex min-h-11 items-center rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-bold text-[var(--accent-on)] transition hover:bg-[var(--accent-active)] disabled:opacity-50">Grade board</button>
      </div>
    )}>
      <div className="space-y-4">
        <div className="rounded-[22px] border border-[color-mix(in_srgb,var(--accent)_24%,transparent)] bg-[var(--bg-surface)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">{mode.replace('_', ' ')} prompt</p>
          <h3 className="mt-2 text-xl font-bold text-[var(--text-primary)]">{prompt}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {template.map(item => <span key={item} className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">{item}</span>)}
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Assumptions">
            <textarea value={whiteboard.assumptions} onChange={event => update('assumptions', event.target.value)} rows={5} className="studio-input" />
          </Field>
          <Field label="Approach">
            <textarea value={whiteboard.approach} onChange={event => update('approach', event.target.value)} rows={5} className="studio-input" />
          </Field>
          <Field label="Solution workspace">
            <textarea value={whiteboard.solution} onChange={event => update('solution', event.target.value)} rows={10} className="studio-input font-mono leading-6" />
          </Field>
          <div className="space-y-3">
            <Field label="Complexity or operations">
              <textarea value={whiteboard.complexity} onChange={event => update('complexity', event.target.value)} rows={5} className="studio-input" />
            </Field>
            <Field label="Trade-offs">
              <textarea value={whiteboard.tradeoffs} onChange={event => update('tradeoffs', event.target.value)} rows={5} className="studio-input" />
            </Field>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function StudyCardsRoom({ cards, index, flipped, setFlipped, onPrev, onNext, onFinish }: {
  cards: StudyCard[];
  index: number;
  flipped: boolean;
  setFlipped: (value: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  onFinish: () => void;
}) {
  const card = cards[index];
  const atEnd = index >= cards.length - 1;

  return (
    <Panel title="Study Cards" icon="view_carousel" action={(
      <button type="button" onClick={onFinish} className="inline-flex min-h-11 items-center rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
        Finish
      </button>
    )}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Card {Math.min(index + 1, cards.length)} of {cards.length}</p>
          <div className="h-2 min-w-[140px] flex-1 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
            <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${cards.length ? ((index + 1) / cards.length) * 100 : 0}%` }} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setFlipped(!flipped)}
          className="min-h-[320px] w-full rounded-[28px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-left transition hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
          aria-label="Flip study card"
        >
          {card ? (
            <div className="flex h-full min-h-[268px] flex-col justify-between">
              <div>
                <div className="mb-4 flex flex-wrap gap-2">
                  {card.category && <span className="rounded-full bg-[var(--tag-blue-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--tag-blue-text)]">{card.category}</span>}
                  {card.difficulty && <span className="rounded-full bg-[var(--tag-amber-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--tag-amber-text)]">{card.difficulty}</span>}
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{flipped ? 'Answer' : 'Prompt'}</p>
                <h3 className="wrap-natural mt-3 text-2xl font-bold leading-tight text-[var(--text-primary)]">
                  {flipped ? card.answer : card.question}
                </h3>
              </div>
              <p className="mt-6 text-sm font-semibold text-[var(--accent)]">Click to {flipped ? 'show prompt' : 'reveal answer'}</p>
            </div>
          ) : (
            <EmptyMini icon="view_carousel" text="Generate study cards from the setup panel to begin." />
          )}
        </button>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={onPrev} disabled={index === 0} className="inline-flex min-h-11 items-center rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50">Previous</button>
          <button type="button" onClick={atEnd ? onFinish : onNext} className="inline-flex min-h-11 items-center rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[var(--accent-on)] transition hover:bg-[var(--accent-active)]">
            {atEnd ? 'Finish cards' : 'Next card'}
          </button>
        </div>
      </div>
    </Panel>
  );
}

function TranscriptPanel({ transcript, transcriptRef }: { transcript: TranscriptEntry[]; transcriptRef: React.Ref<HTMLDivElement> }) {
  return (
    <div className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Live transcript</h3>
        <span className="text-xs text-[var(--text-muted)]">{transcript.length} turns</span>
      </div>
      <div ref={transcriptRef} className="max-h-[470px] space-y-3 overflow-y-auto pr-1">
        {transcript.length > 0 ? transcript.map((entry, index) => (
          <div key={`${entry.role}-${index}`} className={`rounded-2xl border p-3 ${entry.role === 'ai' ? 'border-[color-mix(in_srgb,var(--accent)_24%,transparent)] bg-[var(--accent-dim)]' : 'border-[var(--border-subtle)] bg-[var(--card-bg)]'}`}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{entry.role === 'ai' ? 'Taco' : 'You'}</p>
            <p className="wrap-natural text-sm leading-6 text-[var(--text-primary)]">{entry.text}</p>
          </div>
        )) : (
          <EmptyMini icon="notes" text="Transcript turns will appear here as the session progresses." />
        )}
      </div>
    </div>
  );
}

function scoreBand(score: number | undefined | null): { label: string; tone: string } {
  if (score == null) return { label: 'Not scored', tone: 'text-[var(--text-muted)]' };
  if (score >= 80) return { label: 'Strong', tone: 'text-[var(--success)]' };
  if (score >= 50) return { label: 'Developing', tone: 'text-[var(--warning)]' };
  return { label: 'Needs work', tone: 'text-[var(--danger)]' };
}

function DebriefPanel({ grade, telemetry, onRestart, onAskSona, onStartDrill }: {
  grade: any;
  telemetry: InterviewTelemetry | null;
  onRestart: () => void;
  onAskSona: () => void;
  onStartDrill?: (drillTitle: string) => void;
}) {
  return (
    <Panel title="Debrief" icon="monitoring" action={(
      <div className="flex gap-2">
        <button type="button" onClick={onAskSona} className="inline-flex min-h-11 items-center rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">Ask Taco</button>
        <button type="button" onClick={onRestart} className="inline-flex min-h-11 items-center rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-bold text-[var(--accent-on)] transition hover:bg-[var(--accent-active)]">New session</button>
      </div>
    )}>
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Practice score</p>
          <p className={`mt-3 text-3xl font-black ${scoreBand(grade?.score ?? grade?.overall_score).tone}`}>{scoreBand(grade?.score ?? grade?.overall_score).label}</p>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{grade?.summary || 'Session saved. Run a longer session to unlock a richer debrief.'}</p>
        </div>
        <div className="space-y-4">
          <TwoColumnList leftTitle="Strengths" leftItems={grade?.strengths || []} rightTitle="Improve next" rightItems={grade?.improvements || []} />
          {grade?.rubric?.length > 0 && (
            <div className="grid gap-3 md:grid-cols-3">
              {grade.rubric.slice(0, 3).map((item: any) => (
                <div key={item.label} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{item.label}</p>
                  <p className={`mt-2 text-lg font-black ${scoreBand(item.score).tone}`}>{scoreBand(item.score).label}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{item.note}</p>
                </div>
              ))}
            </div>
          )}
          {telemetry && <TelemetryCard telemetry={telemetry} />}
          {grade?.nextDrills?.length > 0 && (
            <div className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
              <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Next drills</h3>
              <div className="grid gap-2 md:grid-cols-2">
                {grade.nextDrills.map((drill: any, index: number) => (
                  <button
                    key={`${drill.title}-${index}`}
                    type="button"
                    onClick={() => onStartDrill?.(drill.title || drill.focus)}
                    className="min-h-[44px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3 text-left transition hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:bg-[var(--accent-hover)]"
                  >
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{drill.title}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{drill.focus}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function TwoColumnList({ leftTitle, leftItems, rightTitle, rightItems }: { leftTitle: string; leftItems: string[]; rightTitle: string; rightItems: string[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <InfoBlock title={leftTitle} items={leftItems.length ? leftItems : ['Run a practice session to generate coaching.']} />
      <InfoBlock title={rightTitle} items={rightItems.length ? rightItems : ['Taco will identify your next drills after grading.']} />
    </div>
  );
}

function InfoBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      <ul className="mt-3 space-y-2">
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="flex gap-2 text-sm leading-6 text-[var(--text-secondary)]">
            <span className="material-symbols-rounded mt-0.5 text-[16px] text-[var(--accent)]">check_circle</span>
            <span className="wrap-natural min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SessionHistory({
  sessions,
  askSona,
  selectedApplication,
  applicationLinkError,
  onRetryApplicationContext,
}: {
  sessions: InterviewSession[];
  askSona: (prompt: string, contextLabel?: string) => void;
  selectedApplication?: JobApplication;
  applicationLinkError?: string;
  onRetryApplicationContext: () => void;
}) {
  return (
    <Panel title="Debrief Review" icon="monitoring">
      <div className="space-y-3">
        {applicationLinkError && (
          <div className="border-b border-[var(--border-subtle)] pb-5" role="alert">
            <div className="flex min-w-0 items-start gap-3">
              <SuiteToolIcon icon="link_off" size="sm" />
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-[var(--text-primary)]">Application context needs attention</h3>
                <p className="premium-copy-wrap mt-1 text-sm leading-6 text-[var(--text-secondary)]">{applicationLinkError}</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={onRetryApplicationContext}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-deep)]"
                  >
                    <span className="material-symbols-rounded text-[17px]" aria-hidden="true">refresh</span>
                    Retry application
                  </button>
                  <Link
                    href="/suite/applications"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] border border-[var(--border-subtle)] px-4 text-sm font-semibold text-[var(--text-primary)]"
                  >
                    View applications
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
        {selectedApplication && <ApplicationDebriefCapture application={selectedApplication} />}
        {sessions.length > 0 ? sessions.map(session => (
          <div key={session.id} className="flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)]">{session.role || 'Practice session'}{session.company ? ` at ${session.company}` : ''}</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{modeLabel((session.mode as StudioMode) || 'sona_live')} · {session.status || 'draft'} · {formatDate(session.completedAt || session.createdAt)}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-semibold ${scoreBand(session.scores?.score ?? session.scores?.overall_score).tone}`}>
                {scoreBand(session.scores?.score ?? session.scores?.overall_score).label}
              </span>
              <button
                type="button"
                onClick={() => askSona(`Review my saved interview session for ${session.role || 'this role'} and recommend my next drill.`, 'Debrief Review')}
                className="inline-flex min-h-11 items-center rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              >
                Ask Taco
              </button>
            </div>
          </div>
        )) : (
          <div className="rounded-[22px] border border-dashed border-[var(--border)] bg-[var(--bg-surface)] p-8 text-center">
            <AssistantMark size="lg" state="idle" title="Taco" />
            <h3 className="mt-5 text-xl font-bold text-[var(--text-primary)]">No interview sessions yet</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--text-secondary)]">
              Start a Quick Drill, Full Mock, Live Interview with Taco, or Whiteboard session. Debriefs will collect here.
            </p>
          </div>
        )}
      </div>
    </Panel>
  );
}

function ApplicationDebriefCapture({ application }: { application: JobApplication }) {
  const [overallFeeling, setOverallFeeling] = useState<number | null>(null);
  const [questions, setQuestions] = useState('');
  const [strengths, setStrengths] = useState('');
  const [wouldChange, setWouldChange] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const idempotencyKeyRef = useRef('');
  const hasNotes = questions.trim().length > 0 || strengths.trim().length > 0 || wouldChange.trim().length > 0;
  const canSave = hasNotes && overallFeeling != null;

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError('');
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
    try {
      const response = await authFetch('/api/agent/debriefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: application.id,
          idempotencyKey: idempotencyKeyRef.current,
          company: application.company_name,
          role: application.job_title || 'Role not named',
          roundType: 'behavioral',
          date: (application.interview_date || new Date().toISOString()).slice(0, 10),
          questions: questions
            .split('\n')
            .map(text => text.trim())
            .filter(Boolean)
            .slice(0, 10)
            .map(text => ({ text, category: 'Interview' })),
          overallFeeling,
          strengths: strengths.trim(),
          weaknesses: wouldChange.trim(),
          surprises: questions.trim(),
          wouldChange: wouldChange.trim(),
          interviewerVibe: 'neutral',
          followUpSent: false,
          outcome: 'pending',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Debrief could not be saved');
      setSaved(true);
      showToast('Application debrief saved to your Career Twin', 'check_circle');
    } catch (saveError: any) {
      setError(saveError?.message || 'Debrief could not be saved. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <section className="border-b border-[var(--border-subtle)] pb-5" aria-live="polite">
        <div className="flex min-w-0 items-start gap-3">
          <SuiteToolIcon icon="task_alt" size="sm" />
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Application debrief saved</h3>
            <p className="premium-copy-wrap mt-1 text-sm leading-6 text-[var(--text-secondary)]">
              {application.job_title || 'Interview'} at {application.company_name} is now linked to your interview evidence.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="border-b border-[var(--border-subtle)] pb-5" aria-labelledby="application-debrief-title">
      <div className="flex min-w-0 items-start gap-3">
        <SuiteToolIcon icon="rate_review" size="sm" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Application interview</p>
          <h3 id="application-debrief-title" className="premium-heading-wrap mt-1 text-base font-semibold text-[var(--text-primary)]">
            {application.job_title || 'Interview'} at {application.company_name}
          </h3>
          <p className="premium-copy-wrap mt-1 text-sm leading-6 text-[var(--text-secondary)]">
            Capture the evidence while it is fresh. This stays inside your workspace and improves later practice.
          </p>
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="text-xs font-semibold text-[var(--text-secondary)]">How did it feel?</legend>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map(value => {
            const labels: Record<number, string> = { 1: 'Poor', 2: 'Below average', 3: 'Average', 4: 'Good', 5: 'Great' };
            return (
              <button
                key={value}
                type="button"
                onClick={() => setOverallFeeling(value)}
                aria-label={`${value} — ${labels[value]}`}
                aria-pressed={overallFeeling === value}
                className={`min-h-11 rounded-[11px] border text-sm font-semibold tabular-nums transition-colors ${overallFeeling === value ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-deep)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
              >
                {value}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="min-w-0 text-xs font-semibold text-[var(--text-secondary)]">
          What went well?
          <textarea
            value={strengths}
            onChange={event => setStrengths(event.target.value)}
            rows={3}
            placeholder="Evidence, answers, or moments that landed well"
            className="studio-input mt-2 min-h-[112px] resize-y"
          />
        </label>
        <label className="min-w-0 text-xs font-semibold text-[var(--text-secondary)]">
          What would you change?
          <textarea
            value={wouldChange}
            onChange={event => setWouldChange(event.target.value)}
            rows={3}
            placeholder="A clearer example, stronger proof, or a better question"
            className="studio-input mt-2 min-h-[112px] resize-y"
          />
        </label>
      </div>

      <label className="mt-4 block min-w-0 text-xs font-semibold text-[var(--text-secondary)]">
        Questions or surprises
        <textarea
          value={questions}
          onChange={event => setQuestions(event.target.value)}
          rows={3}
          placeholder="Add one question per line"
          className="studio-input mt-2 min-h-[112px] resize-y"
        />
      </label>

      {error && (
        <div className="mt-3 flex items-start gap-2 text-sm text-[var(--danger)]" role="alert">
          <span className="material-symbols-rounded mt-0.5 text-[17px]" aria-hidden="true">error</span>
          <span>{error}</span>
        </div>
      )}

      <button
        type="button"
        onClick={() => void save()}
        disabled={!canSave || saving}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-deep)] disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
      >
        <span className={`material-symbols-rounded text-[18px] ${saving ? 'animate-spin' : ''}`} aria-hidden="true">
          {saving ? 'progress_activity' : 'save'}
        </span>
        {saving ? 'Saving debrief' : 'Save application debrief'}
      </button>
    </section>
  );
}

function EmptyMini({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-surface)] p-4 text-center">
      <span className="material-symbols-rounded text-2xl text-[var(--text-muted)]">{icon}</span>
      <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{text}</p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] p-4 text-sm text-[var(--danger)]">
      <span className="material-symbols-rounded text-[20px]">error</span>
      <p className="wrap-natural">{message}</p>
    </div>
  );
}
