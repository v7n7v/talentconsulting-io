/**
 * Taco AI — Function Tool Definitions
 * These tools let Taco query the user's data on-demand
 * instead of loading everything into the system prompt.
 *
 * v3.0: Enhanced Fit Gate (ghost detection, salary intel, level match)
 *       + generate_tailored_resume
 *       + STAR Story Bank (save_star_story, get_story_bank)
 */

import { getAdminDb } from '@/lib/firebase-admin';
import { calculateFitScore, extractSkillsFromDescription } from '@/lib/job-search-api';
import { searchTalentJobSupply } from '@/lib/job-recommendation-platform';
import { searchCompanyJobs } from '@/lib/portal-scanner';
import { createStoryBankStory, listStoryBankStories } from '@/lib/story-bank';
import { invalidateTwin } from '@/lib/career-twin';
import { extractResumeSkills, getLatestResumeForUser } from '@/lib/server-resume';
import { runSonaAgentHarness } from '@/lib/assistant/agent-harness';
import { runGuardedSonaResumeMorph } from '@/lib/assistant/guarded-resume-morph';
import type { PlanTier } from '@/lib/pricing-tiers';

// ── Tool Schemas (for OpenRouter/Gemini function calling) ──

export const SONA_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'fetch_resume',
      description: 'Fetch the user\'s most recent Vault resume including skills, experience, education, and summary. Use when discussing resume content, skill gaps, or career trajectory.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'fetch_applications',
      description: 'Fetch the user\'s tracked job applications with statuses (Applied, Interviewing, Offer, Rejected). Use when discussing application pipeline, follow-ups, or job search progress.',
      parameters: { type: 'object', properties: { limit: { type: 'number', description: 'Max applications to return (default 10)' } }, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'fetch_preferences',
      description: 'Fetch the user\'s job preferences including target roles, preferred cities, remote preference, and salary expectations. Use when discussing job search strategy or recommendations.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_jobs',
      description: 'Search for new job listings matching a query and location. Use when the user asks to find jobs or when you need to recommend specific roles.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Job title or keyword to search for' },
          location: { type: 'string', description: 'City or "remote"' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_career_goal_harness',
      description: 'Start Taco\'s review-first career goal harness. Use when the user asks Taco to find jobs, prepare opportunities, tailor a resume, or work toward a target such as "$120k hybrid jobs in New Jersey". This creates Agent Queue items for user review and never submits applications.',
      parameters: {
        type: 'object',
        properties: {
          userRequest: { type: 'string', description: 'The user\'s full request in their own words' },
          targetRole: { type: 'string', description: 'Optional target role if the user gave one' },
          location: { type: 'string', description: 'Optional target location, city, state, or remote area' },
          salaryTarget: { type: 'number', description: 'Optional target salary in dollars, for example 120000' },
          remotePreference: { type: 'string', enum: ['remote', 'hybrid', 'onsite', 'any'], description: 'The user\'s preferred work mode' },
          maxPackets: { type: 'number', description: 'How many roles to queue, up to the user tier cap' },
          mode: { type: 'string', enum: ['scout', 'prepare'], description: 'Use scout for Standard or broad search, prepare for Max packet generation' },
          notify: { type: 'boolean', description: 'Whether to create notification and send email if account settings allow it' },
        },
        required: ['userRequest'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'scan_company_portal',
      description: 'Scan a specific company\'s job board directly (Greenhouse, Lever, or Ashby). Returns fresher listings than aggregators like Indeed or LinkedIn. Use when the user mentions a specific company they want to work at. Works for companies like Stripe, Airbnb, Coinbase, Figma, Notion, Vercel, Netflix, Discord, etc.',
      parameters: {
        type: 'object',
        properties: {
          company: { type: 'string', description: 'Company name or career page slug (e.g., "stripe", "airbnb")' },
          query: { type: 'string', description: 'Optional: filter jobs by keyword (e.g., "engineer", "data science")' },
        },
        required: ['company'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'draft_follow_up',
      description: 'Draft a follow-up email for a specific company/application. Returns the draft text for user approval — never send directly.',
      parameters: {
        type: 'object',
        properties: {
          company: { type: 'string', description: 'Company name' },
          context: { type: 'string', description: 'Context: what stage, when applied, role title' },
        },
        required: ['company'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'analyze_job_fit',
      description: 'Analyze how well the user\'s resume fits a specific job description. Returns a fit score, verdict, matching/missing skills, and knockout flags. ALWAYS call this before recommending the user apply to a job.',
      parameters: {
        type: 'object',
        properties: {
          jobTitle: { type: 'string', description: 'The job title' },
          jobDescription: { type: 'string', description: 'The full or partial job description text' },
          company: { type: 'string', description: 'Company name (optional)' },
        },
        required: ['jobTitle'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'morph_resume_for_job',
      description: 'Generate a tailored resume version optimized for a specific job description. Rewrites bullet points to match JD keywords while keeping facts truthful. Returns a draft for user review.',
      parameters: {
        type: 'object',
        properties: {
          jobTitle: { type: 'string', description: 'Target job title' },
          company: { type: 'string', description: 'Target company, when known' },
          jobDescription: { type: 'string', description: 'The job description to optimize for' },
          emphasis: { type: 'string', description: 'Optional: specific skills or experiences to emphasize' },
          morphPercentage: { type: 'number', description: 'Optional rewrite strength from 10 to 100. Values above 80 require the user\'s AI Safety unlock.' },
        },
        required: ['jobTitle'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'draft_cover_letter',
      description: 'Generate a tailored 3-paragraph cover letter for a specific role. Uses the user\'s Vault resume data and the JD to create a personalized letter. Returns a draft for user review.',
      parameters: {
        type: 'object',
        properties: {
          company: { type: 'string', description: 'Company name' },
          role: { type: 'string', description: 'Job title/role' },
          jobDescription: { type: 'string', description: 'The job description' },
          tone: { type: 'string', description: 'Optional: "formal", "conversational", or "confident". Default: "confident"' },
        },
        required: ['company', 'role'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'queue_application',
      description: 'Save a prepared application to the user\'s "Ready to Submit" queue only after explicit user approval. This does NOT submit the application — the user reviews and submits manually.',
      parameters: {
        type: 'object',
        properties: {
          company: { type: 'string', description: 'Company name' },
          role: { type: 'string', description: 'Job title' },
          url: { type: 'string', description: 'Application URL' },
          fitScore: { type: 'number', description: 'Fit score from analyze_job_fit' },
          resumeSummary: { type: 'string', description: 'Brief description of resume customizations made' },
          coverLetterPreview: { type: 'string', description: 'First 200 chars of the cover letter draft' },
          userConfirmed: { type: 'boolean', description: 'True only when the user explicitly asked to queue this application or approved the prepared packet' },
        },
        required: ['company', 'role', 'userConfirmed'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'generate_tailored_resume',
      description: 'Generate an ATS-optimized resume tailored to a specific job description. Rewrites summary, reorders experience bullets to match JD priorities, injects missing keywords ethically. Returns tailored resume data the user can download as a PDF. Use AFTER analyze_job_fit when the user wants to apply.',
      parameters: {
        type: 'object',
        properties: {
          jobTitle: { type: 'string', description: 'Target job title' },
          jobDescription: { type: 'string', description: 'The full job description to tailor for' },
          company: { type: 'string', description: 'Company name' },
          morphPercentage: { type: 'number', description: 'Optional rewrite strength from 10 to 100. Values above 80 require the user\'s AI Safety unlock.' },
        },
        required: ['jobTitle'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'save_star_story',
      description: 'Save a STAR (Situation, Task, Action, Result) story to the user\'s interview story bank. Use when the user shares a professional achievement, or when analyzing job fit reveals a strong experience match. Stories accumulate over time for interview prep.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Brief story title (e.g., "Cut deploy time 80%")' },
          situation: { type: 'string', description: 'The context — what was happening' },
          task: { type: 'string', description: 'What you were responsible for' },
          action: { type: 'string', description: 'What you specifically did' },
          result: { type: 'string', description: 'Measurable outcome' },
          reflection: { type: 'string', description: 'What was learned (optional)' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Skills/themes this story demonstrates (e.g., ["leadership", "devops", "optimization"])'
          },
        },
        required: ['title', 'situation', 'task', 'action', 'result'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_story_bank',
      description: 'Fetch the user\'s saved STAR stories for interview prep. Use when prepping for interviews, reviewing achievements, or finding stories that match a specific job\'s requirements. Can filter by skill/theme tags.',
      parameters: {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional: filter stories by skill/theme tags'
          },
          limit: { type: 'number', description: 'Max stories to return (default 10)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'prep_for_interview',
      description: 'Generate an interview prep package for a specific company/role. Generates likely questions, maps matching STAR stories from the story bank, and suggests questions to ask the interviewer. Use when the user mentions an upcoming interview or when an application status changes to interview_scheduled.',
      parameters: {
        type: 'object',
        properties: {
          company: { type: 'string', description: 'Company name' },
          role: { type: 'string', description: 'Job title/role' },
          jobDescription: { type: 'string', description: 'Job description if available' },
        },
        required: ['company', 'role'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'negotiate_offer',
      description: 'Generate a salary negotiation strategy with counter-offer scripts, market data, and leverage points. Use when the user mentions receiving a job offer, discussing compensation, or needs help negotiating.',
      parameters: {
        type: 'object',
        properties: {
          company: { type: 'string', description: 'Company name' },
          role: { type: 'string', description: 'Job title' },
          offerBase: { type: 'number', description: 'Base salary offered in thousands (e.g. 120 for $120k)' },
          offerTotal: { type: 'number', description: 'Total comp offered in thousands (optional)' },
          desiredBase: { type: 'number', description: 'Desired base salary in thousands (optional)' },
          hasCompetingOffer: { type: 'boolean', description: 'Whether the candidate has another offer' },
          context: { type: 'string', description: 'Any additional context about the negotiation' },
        },
        required: ['company', 'role', 'offerBase'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'optimize_linkedin',
      description: 'Analyze and optimize the user\'s LinkedIn headline and about section. Provides a score, optimized rewrites, missing keywords, and quick wins. Use when the user mentions LinkedIn, their profile, recruiter visibility, or personal branding.',
      parameters: {
        type: 'object',
        properties: {
          headline: { type: 'string', description: 'Current LinkedIn headline' },
          about: { type: 'string', description: 'Current LinkedIn about/summary section' },
          targetRole: { type: 'string', description: 'Target role they want to be found for (optional)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'generate_cover_letter',
      description: 'Generate an AI-crafted cover letter tailored to a specific job using the user\'s resume. Use when the user asks for a cover letter, mentions applying to a job and needs writing help, or says "write a cover letter".',
      parameters: {
        type: 'object',
        properties: {
          company: { type: 'string', description: 'Company name' },
          jobTitle: { type: 'string', description: 'Job title they are applying for' },
          tone: { type: 'string', enum: ['conversational', 'professional', 'confident', 'storytelling'], description: 'Writing tone' },
          template: { type: 'string', enum: ['classic', 'modern', 'impact', 'pain_point'], description: 'Cover letter template style' },
        },
        required: ['company', 'jobTitle'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'log_interview_debrief',
      description: 'Log an interview debrief after the user discusses an interview they had. Use when the user talks about a recent interview, mentions "I just interviewed", "talked to a recruiter", or asks to debrief. Auto-generates a STAR story from the debrief.',
      parameters: {
        type: 'object',
        properties: {
          company: { type: 'string', description: 'Company name' },
          role: { type: 'string', description: 'Role they interviewed for' },
          roundType: { type: 'string', enum: ['phone', 'technical', 'behavioral', 'system_design', 'hiring_manager', 'panel', 'final', 'culture'], description: 'Type of interview round' },
          overallFeeling: { type: 'number', description: 'How it went, 1-5 scale' },
          strengths: { type: 'string', description: 'What went well' },
          weaknesses: { type: 'string', description: 'What was weak or could improve' },
        },
        required: ['company', 'role'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'fetch_career_intelligence',
      description: 'Fetch the user\'s full career intelligence profile including health score, skill gaps, pipeline metrics, interview patterns, morale, and smart recommendations. Use when the user asks "how am I doing?", "what should I focus on?", "career advice", "job search strategy", "am I on track?", or any question about their overall career search progress.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'answer_screening_question',
      description: 'Answer a behavioral or screening question using the user\'s Story Bank. Searches their STAR stories, finds the best match, and drafts a ready-to-paste answer. Use when the user shares a question from a job application, ATS form, screening call, or interview prep. Trigger phrases: "help me answer", "screening question", "application question", "ATS question", "behavioral question", "how should I answer", "they asked me".',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The behavioral or screening question to answer' },
          context: { type: 'string', description: 'Optional context about the role/company' },
        },
        required: ['question'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_resume_versions',
      description: 'List all of the user\'s saved resume versions, including morphed/tailored versions. Returns version names, target companies, and creation dates so the user can pick which one to use. Trigger phrases: "show my resumes", "which resumes do I have", "my morphed resumes", "resume versions", "list resumes".',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'use_resume_version',
      description: 'Load a specific saved resume version by ID to use for subsequent operations (fit analysis, cover letter, interview prep, etc.). Call list_resume_versions first to get available IDs. Use when the user says "use my Google resume", "switch to my Stripe version", or picks a specific resume from the list.',
      parameters: {
        type: 'object',
        properties: {
          versionId: { type: 'string', description: 'The resume version ID from list_resume_versions' },
        },
        required: ['versionId'],
      },
    },
  },
];

// ── Knockout Filters ──

const KNOCKOUT_PATTERNS = {
  clearance: /\b(top secret|ts\/sci|secret clearance|security clearance required|active clearance)\b/i,
  visa: /\b(must be (a )?us citizen|no visa sponsorship|citizenship required|no h1b)\b/i,
  seniorityHigh: /\b(vp|vice president|c-suite|chief .+ officer|director of|head of|principal)\b/i,
  seniorityEntry: /\b(intern|internship|co-op|new grad|entry.level|junior)\b/i,
};

function detectKnockouts(jobDescription: string, jobTitle: string, userSkills: string[], experienceCount: number): string[] {
  const text = `${jobTitle} ${jobDescription}`.toLowerCase();
  const knockouts: string[] = [];

  if (KNOCKOUT_PATTERNS.clearance.test(text)) {
    knockouts.push('Requires security clearance — verify you have this before applying');
  }
  if (KNOCKOUT_PATTERNS.visa.test(text)) {
    knockouts.push('Requires US citizenship or no visa sponsorship offered');
  }

  // Seniority mismatch: user has <3 experience entries applying to VP/Director
  if (experienceCount < 3 && KNOCKOUT_PATTERNS.seniorityHigh.test(jobTitle)) {
    knockouts.push(`This is a senior leadership role (${jobTitle}) but your resume shows ${experienceCount} role(s). Likely a seniority mismatch.`);
  }

  // Over-qualified: user has 5+ roles applying to internships
  if (experienceCount >= 5 && KNOCKOUT_PATTERNS.seniorityEntry.test(jobTitle)) {
    knockouts.push(`This appears to be an entry-level/intern role but you have ${experienceCount} roles. You may be over-qualified.`);
  }

  return knockouts;
}

// ── Ghost Job Detection (Posting Legitimacy) ──
// Inspired by career-ops Block G — detects suspicious job postings

function assessPostingLegitimacy(jd: string, jobTitle: string): { legitimacy: 'high' | 'caution' | 'suspicious'; signals: string[] } {
  const signals: string[] = [];
  let score = 0; // positive = good, negative = bad

  const lower = jd.toLowerCase();
  const titleLower = jobTitle.toLowerCase();

  // Signal 1: Tech specificity — real JDs name specific tools
  const techMentions = lower.match(/\b(python|java|react|node|aws|docker|kubernetes|sql|tensorflow|pytorch|gcp|azure|git|jenkins|terraform)\b/gi);
  const techCount = techMentions ? new Set(techMentions.map(t => t.toLowerCase())).size : 0;
  if (techCount >= 4) {
    score += 2;
    signals.push(`Specific tech stack listed (${techCount} technologies)`);
  } else if (techCount <= 1 && jd.length > 200) {
    score -= 2;
    signals.push('Vague job description — no specific technologies mentioned');
  }

  // Signal 2: Requirements realism — contradictory or inflated requirements
  const yearsMatch = lower.match(/(\d+)\+?\s*years?\s*(of)?\s*(experience|exp)/gi);
  if (yearsMatch) {
    const years = yearsMatch.map(m => parseInt(m.match(/\d+/)?.[0] || '0'));
    const maxYears = Math.max(...years);
    if (maxYears > 15) {
      score -= 2;
      signals.push(`Unrealistic experience requirement: ${maxYears}+ years`);
    }
    // Check for entry title + senior requirements
    if ((titleLower.includes('junior') || titleLower.includes('entry')) && maxYears > 3) {
      score -= 3;
      signals.push(`Contradictory: "${jobTitle}" requires ${maxYears}+ years experience`);
    }
  }

  // Signal 3: Description length — too short = suspicious
  if (jd.length < 100) {
    score -= 2;
    signals.push('Very short job description — may be incomplete or placeholder');
  } else if (jd.length > 500) {
    score += 1;
    signals.push('Detailed job description');
  }

  // Signal 4: Boilerplate/copy-paste indicators
  const boilerplatePatterns = [
    /equal opportunity employer/i,
    /we are an? .{0,20} company/i,
    /competitive salary and benefits/i,
  ];
  const boilerplateCount = boilerplatePatterns.filter(p => p.test(jd)).length;
  if (boilerplateCount >= 2) {
    score -= 1;
    signals.push('High boilerplate content — may be a template posting');
  }

  // Signal 5: Salary transparency — good sign when disclosed
  const hasSalary = /\$\d{2,3}[,k]|\d{2,3},?\d{3}\s*(per|a)\s*(year|annum|yr)/i.test(jd);
  if (hasSalary) {
    score += 1;
    signals.push('Salary range disclosed — positive transparency signal');
  }

  // Signal 6: Unrealistic combo requirements
  const hasFullStack = /full.?stack/i.test(jd);
  const hasML = /machine learning|deep learning|data science/i.test(lower);
  const hasDevOps = /devops|infrastructure|sre/i.test(lower);
  const hasDesign = /ui.?ux|figma|design system/i.test(lower);
  const unicornCount = [hasFullStack, hasML, hasDevOps, hasDesign].filter(Boolean).length;
  if (unicornCount >= 3) {
    score -= 2;
    signals.push('"Unicorn" posting — requires too many unrelated specializations');
  }

  // Determine legitimacy tier
  let legitimacy: 'high' | 'caution' | 'suspicious';
  if (score >= 2) legitimacy = 'high';
  else if (score >= -1) legitimacy = 'caution';
  else legitimacy = 'suspicious';

  return { legitimacy, signals };
}

// ── Level Match Assessment ──

function assessLevelMatch(
  jobTitle: string,
  jd: string,
  experienceCount: number
): { levelMatch: 'aligned' | 'stretch_up' | 'overqualified'; advice: string } {
  const lower = jd.toLowerCase();
  const titleLower = jobTitle.toLowerCase();

  // Parse required years from JD
  const yearsMatch = lower.match(/(\d+)\+?\s*years?\s*(of)?\s*(experience|exp)/i);
  const requiredYears = yearsMatch ? parseInt(yearsMatch[1]) : null;

  // Estimate user's experience level from role count (rough: ~2-3 years per role)
  const estimatedYears = experienceCount * 2.5;

  // Detect seniority from title
  const isSeniorRole = /\b(senior|sr\.?|staff|lead|principal|architect|director|manager|head)\b/i.test(titleLower);
  const isJuniorRole = /\b(junior|jr\.?|entry|associate|intern|graduate|new grad)\b/i.test(titleLower);
  const isMidRole = !isSeniorRole && !isJuniorRole;

  if (requiredYears && estimatedYears < requiredYears * 0.6) {
    return {
      levelMatch: 'stretch_up',
      advice: `This role asks for ${requiredYears}+ years. Your ${experienceCount} roles suggest ~${Math.round(estimatedYears)} years. To position yourself: highlight leadership moments, quantified impact, and any projects where you operated above your title. Focus on "I did X that usually requires someone more senior" framing.`,
    };
  }

  if (isJuniorRole && experienceCount >= 4) {
    return {
      levelMatch: 'overqualified',
      advice: `You have ${experienceCount} roles — this entry/junior position may not challenge you. If you proceed, negotiate a rapid review cycle (3-6 months) with clear promotion criteria. Ask about growth trajectory in interviews.`,
    };
  }

  if (isSeniorRole && experienceCount <= 1) {
    return {
      levelMatch: 'stretch_up',
      advice: `This is a senior role and you have ${experienceCount} previous role(s). It's a stretch — lead with impact over tenure. Show complex problems you solved, not years served. If asked about experience level, say "My impact outpaces my tenure — here's why."`,
    };
  }

  return {
    levelMatch: 'aligned',
    advice: `Your experience level aligns well with this ${isSeniorRole ? 'senior' : isMidRole ? 'mid-level' : 'entry'} role.`,
  };
}

// ── Salary Intelligence (from job source data) ──

async function fetchSalaryIntelligence(jobTitle: string, location?: string): Promise<{ min: number | null; max: number | null; currency: string } | null> {
  try {
    const result = await searchTalentJobSupply({
      query: jobTitle,
      location: location || '',
      country: 'us',
      page: 1,
      resultsPerPage: 5,
      sortBy: 'salary',
    });

    if (result.jobs.length === 0) return null;

    // Aggregate salary data from top results
    const salaries = result.jobs
      .filter(j => j.salary.min || j.salary.max)
      .map(j => ({
        min: j.salary.min || j.salary.max || 0,
        max: j.salary.max || j.salary.min || 0,
      }));

    if (salaries.length === 0) return null;

    const avgMin = Math.round(salaries.reduce((a, s) => a + s.min, 0) / salaries.length);
    const avgMax = Math.round(salaries.reduce((a, s) => a + s.max, 0) / salaries.length);

    return { min: avgMin, max: avgMax, currency: 'USD' };
  } catch {
    return null;
  }
}

// ── Tool Executors ──

export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  uid: string,
  context: { resumeVersionId?: string | null; tier?: PlanTier; email?: string | null; activationConfirmed?: boolean } = {},
): Promise<string> {
  const db = getAdminDb();

  switch (toolName) {
    case 'fetch_resume': {
      try {
        const latest = await getLatestResumeForUser(db, uid);
        const resume = latest.resume;

        if (!resume) {
          return JSON.stringify({ found: false, message: 'No resume found in Vault. The user hasn\'t uploaded a resume yet.' });
        }

        return JSON.stringify({
          found: true,
          source: latest.source || 'unknown',
          resumeId: latest.id,
          updatedAt: latest.updatedAt,
          name: resume.name || '',
          title: resume.title || '',
          summary: resume.summary || '',
          skills: extractResumeSkills(resume).slice(0, 30),
          experience: (resume.experience || []).slice(0, 5).map((e: any) => ({
            role: e.role || e.title || '',
            company: e.company || '',
            duration: e.duration || '',
            bullets: (e.bullets || e.highlights || e.achievements || []).slice(0, 3),
          })),
          experienceCount: (resume.experience || []).length,
          latestRole: resume.experience?.[0]?.role || resume.experience?.[0]?.title || '',
          latestCompany: resume.experience?.[0]?.company || '',
          educationCount: (resume.education || []).length,
        });
      } catch (e: any) {
        return JSON.stringify({ found: false, error: e.message });
      }
    }

    case 'fetch_applications': {
      try {
        const limit = args.limit || 10;
        const appsSnap = await db.collection('users').doc(uid).collection('applications')
          .orderBy('updatedAt', 'desc').limit(limit).get();

        if (appsSnap.empty) return JSON.stringify({ found: false, count: 0, message: 'No tracked applications yet.' });

        const apps = appsSnap.docs.map(d => {
          const a = d.data();
          return {
            company: a.companyName || a.company || '',
            role: a.jobTitle || a.role || '',
            status: a.status || 'Applied',
            appliedAt: a.appliedAt || a.createdAt || '',
            updatedAt: a.updatedAt || '',
          };
        });

        const statusCounts = apps.reduce((acc, a) => {
          acc[a.status] = (acc[a.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        return JSON.stringify({ found: true, count: apps.length, statusCounts, applications: apps });
      } catch (e: any) {
        return JSON.stringify({ found: false, error: e.message });
      }
    }

    case 'fetch_preferences': {
      try {
        const prefsSnap = await db.collection('users').doc(uid).collection('settings').doc('jobPreferences').get();
        if (!prefsSnap.exists) return JSON.stringify({ found: false, message: 'No job preferences configured yet.' });

        const p = prefsSnap.data()!;
        return JSON.stringify({
          found: true,
          targetRoles: p.targetRoles || [],
          preferredCities: p.preferredCities || [],
          remotePref: p.remotePref || 'any',
          salaryMin: p.salaryMin || 0,
          emailNotifications: p.emailNotifications || false,
        });
      } catch (e: any) {
        return JSON.stringify({ found: false, error: e.message });
      }
    }

    case 'search_jobs': {
      try {
        const result = await searchTalentJobSupply({
          query: args.query,
          location: args.location || '',
          country: 'us',
          page: 1,
          resultsPerPage: 5,
          sortBy: 'relevance',
        });

        const jobs = result.jobs.slice(0, 5).map(j => ({
          title: j.title,
          company: j.company,
          location: j.location,
          url: j.url,
          salary: j.salary,
          skills: j.skills.slice(0, 5),
          source: j.sourceMeta.sourceName,
          sourceType: j.sourceMeta.sourceType,
        }));

        return JSON.stringify({ found: true, count: jobs.length, providerStatus: result.providerStatus, jobs });
      } catch (e: any) {
        return JSON.stringify({ found: false, error: e.message });
      }
    }

    case 'run_career_goal_harness': {
      if (context.activationConfirmed !== true) {
        return JSON.stringify({
          action: 'run_career_goal_harness',
          success: false,
          code: 'PREFLIGHT_REQUIRED',
          retryable: false,
          approvalRequired: true,
          message: 'Open the Target brief and run Preview scout first. No scout quota, queue item, packet, notification, or external application was created.',
        });
      }
      try {
        const result = await runSonaAgentHarness(db, uid, {
          userRequest: args.userRequest || args.request || '',
          resumeVersionId: context.resumeVersionId || undefined,
          targetRole: args.targetRole,
          location: args.location,
          salaryTarget: typeof args.salaryTarget === 'number' ? args.salaryTarget : undefined,
          remotePreference: args.remotePreference,
          maxPackets: typeof args.maxPackets === 'number' ? args.maxPackets : undefined,
          mode: args.mode,
          notify: args.notify !== false,
          tier: context.tier || 'free',
          email: context.email || null,
        });

        return JSON.stringify({
          action: 'run_career_goal_harness',
          success: result.success,
          runId: result.runId,
          status: result.status,
          goal: result.goal,
          mode: result.mode,
          queuedCount: result.queuedCount,
          queued: result.queued,
          nextActions: result.nextActions,
          approvalRequired: result.approvalRequired,
          notification: result.notification,
          warnings: result.warnings,
          code: result.code,
          retryable: result.retryable,
          error: result.error,
          needsResume: result.needsResume,
          message: result.code === 'RESUME_LOOKUP_UNAVAILABLE'
            ? 'Taco could not load the selected resume right now. Retry without changing the resume selection.'
            : result.queuedCount > 0
            ? `Taco queued ${result.queuedCount} role${result.queuedCount === 1 ? '' : 's'} for review. The user must review every packet before applying.`
            : 'Taco completed the run but did not find a strong match yet.',
        });
      } catch (e: any) {
        return JSON.stringify({ error: e.message || 'Taco harness failed' });
      }
    }

    // ── v3.0: Portal Scanner (Greenhouse/Lever/Ashby) ──
    case 'scan_company_portal': {
      try {
        const result = await searchCompanyJobs(args.company, args.query);

        if (result.jobs.length === 0) {
          return JSON.stringify({
            found: false,
            company: result.company,
            source: result.source,
            message: `No open positions found for "${args.company}" on Greenhouse, Lever, or Ashby. The company may use a different ATS, or the slug might be different. Try their careers page directly.`,
          });
        }

        const jobs = result.jobs.slice(0, 10).map(j => ({
          title: j.title,
          department: j.department,
          location: j.location,
          url: j.url,
          postedDate: j.postedDate,
          source: j.source,
        }));

        return JSON.stringify({
          found: true,
          company: result.company,
          source: result.source,
          totalCount: result.totalCount,
          showing: jobs.length,
          jobs,
          tip: `These listings come directly from ${result.company}'s job board — fresher and more accurate than aggregator sites.`,
        });
      } catch (e: any) {
        return JSON.stringify({ found: false, error: e.message });
      }
    }

    case 'draft_follow_up': {
      return JSON.stringify({
        action: 'draft',
        type: 'follow_up_email',
        company: args.company,
        context: args.context || 'General follow-up after application',
        instruction: 'Draft a professional, concise follow-up email. Keep it under 150 words. Include: gratitude, continued interest, brief value prop, clear ask. HUMANIZE: Use contractions, vary sentence length, use concrete language. Never start with "I hope this email finds you well" or "I am writing to follow up". Start with something specific and natural.',
      });
    }

    case 'analyze_job_fit': {
      try {
        const { resume } = await getLatestResumeForUser(db, uid);
        const userSkills = extractResumeSkills(resume);
        const experienceCount = (resume?.experience || []).length;
        const latestRole = resume?.experience?.[0]?.role || resume?.experience?.[0]?.title || '';

        // Extract job skills from description
        const jd = args.jobDescription || '';
        const jobSkills = jd ? extractSkillsFromDescription(jd) : [];

        // Calculate fit score using existing math
        const fitScore = calculateFitScore(userSkills, jobSkills, args.jobTitle);

        // Find matching and missing skills
        const userLower = userSkills.map(s => s.toLowerCase().trim());
        const matchingSkills: string[] = [];
        const missingSkills: string[] = [];

        for (const js of jobSkills) {
          const jLower = js.toLowerCase().trim();
          const matched = userLower.some(us =>
            us.includes(jLower) || jLower.includes(us) ||
            us.replace(/[.\-_\s]/g, '').includes(jLower.replace(/[.\-_\s]/g, ''))
          );
          if (matched) matchingSkills.push(js);
          else missingSkills.push(js);
        }

        // Determine verdict
        let verdict: 'strong_match' | 'moderate_match' | 'weak_match';
        let verdictMessage: string;

        if (fitScore >= 80) {
          verdict = 'strong_match';
          verdictMessage = 'Strong match — this role aligns well with your background. I recommend preparing a tailored application.';
        } else if (fitScore >= 60) {
          verdict = 'moderate_match';
          verdictMessage = `Decent fit with some gaps. You match on ${matchingSkills.length} skills but are missing ${missingSkills.length}. Worth applying if you can address the gaps.`;
        } else {
          verdict = 'weak_match';
          verdictMessage = `I wouldn't invest time here — your fit score is ${fitScore}%. The skill overlap is too low for a competitive application.`;
        }

        // Run knockout filters
        const knockouts = detectKnockouts(jd, args.jobTitle, userSkills, experienceCount);

        if (knockouts.length > 0) {
          verdict = 'weak_match';
          verdictMessage = `⚠️ Knockout flags detected. ${knockouts.join('. ')}. Review these before deciding to apply.`;
        }

        // ── NEW: Ghost Job Detection (v3.0) ──
        const legitimacyResult = jd ? assessPostingLegitimacy(jd, args.jobTitle) : { legitimacy: 'caution' as const, signals: ['No job description provided — cannot assess legitimacy'] };

        // ── NEW: Level Match Assessment (v3.0) ──
        const levelResult = assessLevelMatch(args.jobTitle, jd, experienceCount);

        // ── NEW: Salary Intelligence (v3.0) ──
        let salaryRange: { min: number | null; max: number | null; currency: string } | null = null;
        try {
          salaryRange = await fetchSalaryIntelligence(args.jobTitle, args.company);
        } catch { /* salary is best-effort */ }

        // Check against user preferences for salary comparison
        let salaryAdvice = '';
        if (salaryRange && salaryRange.min) {
          try {
            const prefsSnap = await db.collection('users').doc(uid).collection('settings').doc('jobPreferences').get();
            if (prefsSnap.exists) {
              const prefs = prefsSnap.data()!;
              const userMin = prefs.salaryMin || 0;
              if (userMin > 0 && salaryRange.max && salaryRange.max < userMin) {
                salaryAdvice = `Market range ($${Math.round(salaryRange.min / 1000)}k-$${Math.round(salaryRange.max / 1000)}k) is below your target ($${Math.round(userMin / 1000)}k+). Consider negotiating or skipping.`;
              } else if (userMin > 0 && salaryRange.min && salaryRange.min >= userMin) {
                salaryAdvice = `Market range ($${Math.round(salaryRange.min / 1000)}k-$${Math.round((salaryRange.max || salaryRange.min) / 1000)}k) meets or exceeds your target. Comp looks good.`;
              }
            }
          } catch { /* prefs are optional */ }
        }

        // ── Auto-generate STAR story suggestion (career-ops style) ──
        // Accumulates across evaluations, building a story bank for interview prep
        if (fitScore >= 60 && latestRole && matchingSkills.length > 0) {
          try {
            const topSkills = matchingSkills.slice(0, 3).join(', ');
            await createStoryBankStory(uid, {
              title: `${latestRole} → ${args.jobTitle || 'Target Role'}`,
              situation: `While working as ${latestRole}, I encountered challenges that directly relate to the ${args.jobTitle} role requiring ${topSkills}.`,
              task: `The key requirement was demonstrating competency in ${topSkills}, which maps to this JD's core asks.`,
              action: '(Fill in: What specific actions did you take? Use concrete verbs — built, shipped, cut, grew, designed.)',
              result: '(Fill in: What measurable outcome? Revenue, time saved, users impacted, error reduction?)',
              reflection: `This story maps ${matchingSkills.length} skills from the ${args.company || 'target'} JD. Refine it before your interview.`,
              tags: [...matchingSkills.slice(0, 4), args.company || 'General'].filter(Boolean),
              source: 'fit_analysis',
              sourceTool: 'sona_fit_gate',
              company: args.company || '',
              role: args.jobTitle || '',
            });
          } catch { /* story save is best-effort, don't break fit analysis */ }
        }

        return JSON.stringify({
          fitScore,
          verdict,
          verdictMessage,
          matchingSkills: matchingSkills.slice(0, 10),
          missingSkills: missingSkills.slice(0, 10),
          knockouts,
          userSkillCount: userSkills.length,
          jobSkillCount: jobSkills.length,
          experienceCount,
          latestRole,
          company: args.company || '',
          // v3.0 fields
          legitimacy: legitimacyResult.legitimacy,
          legitimacySignals: legitimacyResult.signals,
          levelMatch: levelResult.levelMatch,
          levelAdvice: levelResult.advice,
          salaryRange,
          salaryAdvice,
          // v3.1 — story bank link
          storyGenerated: fitScore >= 60 && latestRole && matchingSkills.length > 0,
        });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    }

    case 'morph_resume_for_job': {
      try {
        const result = await runGuardedSonaResumeMorph({
          uid,
          jobTitle: args.jobTitle,
          company: args.company,
          jobDescription: args.jobDescription,
          emphasis: args.emphasis,
          requestedMorphPercentage: args.morphPercentage,
          resumeVersionId: context.resumeVersionId,
          source: 'sona_chat_morph',
        });
        return JSON.stringify({
          action: 'morph_resume',
          ...result,
          instruction: result.success
            ? 'Describe this already guarded draft and direct the user to review it. Do not rewrite, expand, or alter any resume field in chat.'
            : 'Explain the typed recovery message and ask only for the missing next step.',
        });
      } catch (e: any) {
        return JSON.stringify({
          action: 'morph_resume',
          success: false,
          code: 'generation_failed',
          error: 'Taco could not prepare the guarded draft.',
          recovery: 'The verified resume was not changed. Retry after confirming the resume and job description.',
        });
      }
    }

    case 'draft_cover_letter': {
      try {
        const { resume } = await getLatestResumeForUser(db, uid);
        let userName = '';
        let latestRole = '';
        let latestCompany = '';
        let topSkills: string[] = [];

        if (resume) {
          userName = resume.name || '';
          latestRole = resume.experience?.[0]?.role || resume.experience?.[0]?.title || '';
          latestCompany = resume.experience?.[0]?.company || '';
          topSkills = extractResumeSkills(resume).slice(0, 10);
        }

        return JSON.stringify({
          action: 'draft_cover_letter',
          company: args.company,
          role: args.role,
          tone: args.tone || 'confident',
          userName,
          latestRole,
          latestCompany,
          topSkills,
          jobDescription: (args.jobDescription || '').slice(0, 1500),
          instruction: `Write a 3-paragraph cover letter for the ${args.role} position at ${args.company}.
Paragraph 1 (Hook): Why THIS company specifically — reference something real about them if the JD provides context. 2-3 sentences. NEVER open with "I am writing to express my interest" or "Dear Hiring Manager, I am excited to apply".
Paragraph 2 (Evidence): Map the user's top 2-3 achievements to the job requirements. Use numbers from their resume. 3-4 sentences. Be specific — "cut deployment time from 45min to 8min" not "significantly improved deployment efficiency".
Paragraph 3 (Close): Confident close with a specific ask. 2 sentences. No "I hope to hear from you." Try: "I'd welcome a conversation about how [specific thing] could help [specific company goal]."
HUMANIZE: Use contractions (I've, didn't, we're). Mix short and long sentences. No banned words (leverage, utilize, spearheaded, comprehensive, robust, innovative, transformative). Sound like a real person, not a template. 250-350 words total.
CRITICAL: Only use facts from the provided resume data. If you don't have enough info, say "I need more details about X to complete this section." Present as a draft for user review.`,
        });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    }

    case 'queue_application': {
      try {
        if (args.userConfirmed !== true) {
          return JSON.stringify({
            approvalRequired: true,
            message: 'Ask the user to approve adding this packet to Agent Queue. Do not create a queue item until they confirm.',
          });
        }

        const queueRef = db.collection('users').doc(uid).collection('agent_queue');

        // Check queue size (cap at 25 pending)
        const pendingSnap = await queueRef.where('status', '==', 'pending').get();
        const existing = pendingSnap.docs.find(docSnap => {
          const data = docSnap.data();
          return String(data.company || '').toLowerCase() === String(args.company || '').toLowerCase()
            && String(data.job_title || '').toLowerCase() === String(args.role || '').toLowerCase();
        });
        if (existing) {
          return JSON.stringify({
            success: true,
            queueId: existing.id,
            idempotent: true,
            message: `A pending packet for ${args.role} at ${args.company} is already in Agent Queue.`,
            queueSize: pendingSnap.size,
          });
        }
        if (pendingSnap.size >= 25) {
          return JSON.stringify({
            error: 'Your application queue is full (25 pending). Submit or skip some before adding more.',
            queueSize: pendingSnap.size,
          });
        }

        const doc = await queueRef.add({
          user_id: uid,
          job_title: args.role,
          company: args.company,
          location: args.location || 'Not specified',
          job_url: args.url || '',
          job_description: args.jobDescription || '',
          salary: { min: null, max: null },
          employment_type: args.employmentType || 'Not specified',
          posted_date: new Date().toISOString(),
          match_score: Math.max(0, Math.min(100, Number(args.fitScore || 0))),
          match_reason: args.resumeSummary || 'Queued by Taco for your review.',
          morphed_resume: null,
          cover_letter: args.coverLetterPreview || '',
          status: 'pending',
          source: 'sona_chat',
          packetStatus: 'needs_review',
          fitSignals: args.resumeSummary ? [args.resumeSummary] : ['Taco prepared this from your chat context.'],
          riskSignals: ['Review the posting, resume, and cover letter before submitting.'],
          nextAction: 'Review the packet, refine it with Taco if needed, then apply manually.',
          feedbackTags: [],
          agentRunId: `sona_${Date.now()}`,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          batch_id: 'sona_chat',
          batch_date: new Date().toISOString().split('T')[0],
        });
        invalidateTwin(uid).catch(() => {});

        return JSON.stringify({
          success: true,
          queueId: doc.id,
          message: `Application for ${args.role} at ${args.company} has been queued. Review the packet from Agent Queue before submitting.`,
          queueSize: pendingSnap.size + 1,
        });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    }

    // ── v3.0: Generate Tailored Resume ──
    case 'generate_tailored_resume': {
      try {
        const result = await runGuardedSonaResumeMorph({
          uid,
          jobTitle: args.jobTitle,
          company: args.company,
          jobDescription: args.jobDescription,
          requestedMorphPercentage: args.morphPercentage,
          resumeVersionId: context.resumeVersionId,
          source: 'sona_chat_tailor',
        });
        return JSON.stringify({
          action: 'generate_tailored_resume',
          ...result,
          instruction: result.success
            ? 'Describe this already guarded draft and its evidence gaps. Direct the user to Resume Studio to review or export it. Do not regenerate resume text in chat.'
            : 'Explain the typed recovery message and ask only for the missing next step.',
        });
      } catch (e: any) {
        return JSON.stringify({
          action: 'generate_tailored_resume',
          success: false,
          code: 'generation_failed',
          error: 'Taco could not prepare the guarded tailored resume.',
          recovery: 'The verified resume was not changed. Retry after confirming the resume and job description.',
        });
      }
    }

    // ── v3.0: Save STAR Story ──
    case 'save_star_story': {
      try {
        const storiesRef = db.collection('users').doc(uid).collection('agent_stories');

        // Cap at 50 stories
        const countSnap = await storiesRef.count().get();
        if (countSnap.data().count >= 50) {
          return JSON.stringify({
            error: 'Story bank is full (50 stories). Delete old stories to make room.',
            count: countSnap.data().count,
          });
        }

        const story = await createStoryBankStory(uid, {
          title: args.title,
          situation: args.situation,
          task: args.task,
          action: args.action,
          result: args.result,
          reflection: args.reflection || '',
          tags: args.tags || [],
          source: 'chat',
          sourceTool: 'sona_chat',
        });
        invalidateTwin(uid).catch(() => {});

        return JSON.stringify({
          success: true,
          storyId: story.id,
          message: `Saved "${args.title}" to your Story Bank. You now have ${countSnap.data().count + 1} stories ready for interview prep.`,
          tags: args.tags || [],
        });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    }

    // ── v3.0: Get Story Bank ──
    case 'get_story_bank': {
      try {
        const limit = args.limit || 10;
        const { stories: bankStories } = await listStoryBankStories(uid, { limit: Math.min(limit, 50) });

        if (bankStories.length === 0) {
          return JSON.stringify({
            found: false,
            count: 0,
            message: 'No stories in your Story Bank yet. Share achievements in our chats and I\'ll save them automatically, or tell me a story to save.',
          });
        }

        let stories = bankStories.map(s => ({
          id: s.id,
          title: s.title,
          situation: s.situation,
          task: s.task,
          action: s.action,
          result: s.result,
          reflection: s.reflection || '',
          tags: s.tags || [],
          category: s.category,
          proofScore: s.proofScore,
          createdAt: s.createdAt,
        }));

        // Filter by tags if provided
        if (args.tags && args.tags.length > 0) {
          const filterTags = args.tags.map((t: string) => t.toLowerCase());
          stories = stories.filter(s =>
            s.tags.some((t: string) => filterTags.includes(t.toLowerCase()))
          );
        }

        return JSON.stringify({
          found: true,
          count: stories.length,
          stories,
          tags: [...new Set(stories.flatMap(s => s.tags))],
        });
      } catch (e: any) {
        return JSON.stringify({ found: false, error: e.message });
      }
    }

    case 'prep_for_interview': {
      try {
        // Fetch story bank
        const storySnap = await db.collection('users').doc(uid).collection('agent_stories').orderBy('createdAt', 'desc').limit(20).get();
        const storyList = storySnap.docs.map(d => ({ title: (d.data() as any).title, tags: (d.data() as any).tags || [] }));

        // Find matching application for more context
        const appSnap = await db.collection('users').doc(uid).collection('applications')
          .where('company_name', '==', args.company).limit(1).get();
        const appData = appSnap.empty ? null : appSnap.docs[0].data();

        const jd = args.jobDescription || appData?.job_description || '';

        return JSON.stringify({
          company: args.company,
          role: args.role,
          hasJD: !!jd,
          jdPreview: jd.slice(0, 500),
          storiesAvailable: storyList.length,
          stories: storyList,
          applicationStatus: appData?.status || 'unknown',
          instruction: `Generate 5 tailored interview questions (mix behavioral + technical) for ${args.role} at ${args.company}. For each behavioral question, map a matching STAR story from the story bank by tags. Also suggest 3 smart questions the candidate should ASK.`,
        });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    }

    case 'negotiate_offer': {
      try {
        // Fetch resume for leverage context
        const resumeSnap = await db.collection('users').doc(uid).collection('resume_versions').orderBy('created_at', 'desc').limit(1).get();
        let candidateCtx = '';
        if (!resumeSnap.empty) {
          const resume = resumeSnap.docs[0].data()?.content;
          if (resume) {
            candidateCtx = `${resume.name || ''}, ${resume.title || ''}, ${(resume.experience || []).length} roles, skills: ${(resume.skills || []).flatMap((c: any) => c.items || []).slice(0, 8).join(', ')}`;
          }
        }
        return JSON.stringify({
          company: args.company,
          role: args.role,
          offerBase: args.offerBase,
          offerTotal: args.offerTotal || null,
          desiredBase: args.desiredBase || null,
          hasCompetingOffer: args.hasCompetingOffer || false,
          context: args.context || '',
          candidateProfile: candidateCtx,
          instruction: `Generate a counter-offer strategy for $${args.offerBase}k base at ${args.company} for ${args.role}. Include: market range estimate, email script, phone talking points, BATNA, leverage points, and non-salary asks.`,
        });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    }

    case 'optimize_linkedin': {
      try {
        const resumeSnap = await db.collection('users').doc(uid).collection('resume_versions').orderBy('created_at', 'desc').limit(1).get();
        let resumeData = '';
        if (!resumeSnap.empty) {
          const resume = resumeSnap.docs[0].data()?.content;
          if (resume) {
            resumeData = `${resume.name || ''} | ${resume.title || ''} | ${resume.summary || ''} | Skills: ${(resume.skills || []).flatMap((c: any) => c.items || []).join(', ')}`;
          }
        }

        const prefsDoc = await db.collection('users').doc(uid).collection('preferences').doc('job_search').get();
        const targetRoles = prefsDoc.exists ? (prefsDoc.data()?.targetRoles || []).join(', ') : '';

        return JSON.stringify({
          headline: args.headline || 'Not provided',
          about: args.about || 'Not provided',
          targetRole: args.targetRole || targetRoles || 'Not specified',
          resumeContext: resumeData,
          instruction: `Analyze the LinkedIn profile and provide: optimized headline (220 chars max), optimized about section, score for each, missing keywords, and 3 quick wins. Use the resume data for context.`,
        });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    }

    case 'generate_cover_letter': {
      try {
        const db = getAdminDb();
        let resumeContext = '';
        const resumeSnap = await db.collection('users').doc(uid).collection('resume_versions')
          .orderBy('created_at', 'desc').limit(1).get();
        if (!resumeSnap.empty) {
          const r = resumeSnap.docs[0].data()?.content;
          if (r) {
            resumeContext = JSON.stringify({
              name: r.name, title: r.title, summary: r.summary,
              skills: (r.skills || []).flatMap((c: any) => c.items || []).slice(0, 20),
              experience: (r.experience || []).slice(0, 3).map((e: any) => ({
                role: e.role, company: e.company,
                bullets: (e.bullets || []).slice(0, 2),
              })),
            });
          }
        }
        return JSON.stringify({
          company: args.company || 'Not specified',
          jobTitle: args.jobTitle || 'Not specified',
          tone: args.tone || 'conversational',
          template: args.template || 'classic',
          resumeContext,
          instruction: `Write a tailored cover letter for this job. Use the resume data for personalization. Follow the specified tone and template. Return the cover letter text, subject line, and 3 key highlights.`,
        });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    }

    case 'log_interview_debrief': {
      try {
        const db = getAdminDb();
        const company = args.company || 'Unknown Company';
        const role = args.role || 'Unknown Role';

        const docRef = await db.collection('users').doc(uid).collection('debriefs').add({
          company,
          role,
          roundType: args.roundType || 'behavioral',
          date: new Date().toISOString().split('T')[0],
          questions: [],
          overallFeeling: args.overallFeeling || 3,
          strengths: args.strengths || '',
          weaknesses: args.weaknesses || '',
          surprises: '',
          wouldChange: '',
          interviewerVibe: 'neutral',
          followUpSent: false,
          outcome: 'pending',
          createdAt: new Date().toISOString(),
          source: 'sona_chat',
        });

        // Auto-generate STAR story
        if (args.strengths) {
          await createStoryBankStory(uid, {
            title: `${role} @ ${company} — Interview Debrief`,
            situation: `Interviewed at ${company} for the ${role} position (${(args.roundType || 'behavioral').replace('_', ' ')} round).`,
            task: `Demonstrate qualification for the ${role} role.`,
            action: args.strengths,
            result: args.overallFeeling >= 4 ? 'Strong performance — felt confident.' : 'Mixed result — areas to improve.',
            reflection: args.weaknesses || 'Continue preparing for similar questions.',
            tags: [company, (args.roundType || 'behavioral').replace('_', ' ')],
            source: 'interview_debrief',
            sourceTool: 'sona_debrief',
            company,
            role,
          });
        }

        return JSON.stringify({
          saved: true,
          debriefId: docRef.id,
          company,
          role,
          message: `Debrief logged for ${company}. A STAR story has been saved to your Story Bank. Visit /suite/interview-debrief for detailed logging with question tracking and insights.`,
        });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    }

    case 'fetch_career_intelligence': {
      try {
        const { getOrComputeTwin } = await import('@/lib/career-twin');
        const { generateRecommendations, generateProfileSummary } = await import('@/lib/career-recommendations');

        const twin = await getOrComputeTwin(uid);
        const recommendations = generateRecommendations(twin);
        const summary = generateProfileSummary(twin);

        return JSON.stringify({
          summary,
          healthScore: twin.healthScore,
          topRecommendations: recommendations.slice(0, 5).map(r => ({
            priority: r.priority,
            title: r.title,
            description: r.description,
            action: r.action,
          })),
          keyMetrics: {
            totalApps: twin.pipeline.totalApps,
            // Records tracked vs applications actually sent. A record created
            // by a resume morph has never been in front of an employer, so it
            // cannot be the denominator of a response rate.
            sentApps: twin.pipeline.appliedApps,
            velocity: twin.pipeline.velocity,
            // null when nothing has been sent — not 0%.
            responseRate: twin.pipeline.responseRate,
            respondedCount: twin.pipeline.responded,
            offerCount: twin.pipeline.offers,
            debriefs: twin.interviews.totalDebriefs,
            // null, not 0. A debrief defaults to outcome 'pending' and may
            // carry no questions, so neither of these is measured just because
            // a debrief exists — and the model quotes whatever it is handed.
            passRate: twin.interviews.resolvedOutcomeCount > 0 ? twin.interviews.passRate : null,
            resolvedDebriefs: twin.interviews.resolvedOutcomeCount,
            avgConfidence: twin.interviews.questionCount > 0 ? twin.interviews.avgConfidence : null,
            confidenceTrend: twin.interviews.questionCount > 0 ? twin.interviews.confidenceTrend : null,
            skillGaps: twin.skills.gap,
            fitAnalysisCount: twin.skills.fitAnalysisCount,
            // null means the user has never checked in — not a neutral 3.
            morale: twin.morale.current,
            burnoutRisk: twin.morale.burnoutRisk,
            moraleCheckIns: twin.morale.history.length,
          },
          twinMeta: {
            completeness: twin.completeness,
            behavioralCoverage: twin.behavioralBank,
          },
          instruction: 'Use this data to give specific, data-driven career advice. Reference actual numbers. Be encouraging but honest. Suggest specific tools (Resume Studio, Interview Simulator, Skill Bridge, etc.) based on the recommendations. A null value means it has never been measured: say so, and never substitute a default, an average or a guess for it. If moraleCheckIns is 0 you do not know how they feel — ask, do not assert. If fitAnalysisCount is 0, an empty skillGaps list means no role has been analyzed, not that they have no gaps.',
        });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    }

    case 'answer_screening_question': {
      try {
        const { answerBehavioralQuestion } = await import('@/lib/story-search');
        const question = args.question as string;
        const context = args.context as string | undefined;

        const result = await answerBehavioralQuestion(uid, question);

        return JSON.stringify({
          question,
          detectedCategories: result.categories.slice(0, 3).map(c => ({
            category: c.category,
            confidence: c.confidence,
          })),
          storyUsed: result.story ? {
            title: result.story.title,
            tags: result.story.tags,
          } : null,
          draftAnswer: result.answer,
          alternateStories: result.alternateStories,
          source: result.source,
          instruction: result.story
            ? `Present this draft answer to the user. Explain which story was used and why. Offer to refine the answer for the specific role${context ? ` at ${context}` : ''}. If the answer seems weak, suggest they add more stories to their Story Bank for the detected category.`
            : 'The user has no matching stories. Encourage them to add STAR stories via the Story Bank (/suite/agent/stories) or log interview debriefs (/suite/interview-debrief) to build their answer bank.',
        });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    }

    case 'list_resume_versions': {
      try {
        const versionsSnap = await db.collection('users').doc(uid).collection('resume_versions')
          .orderBy('created_at', 'desc').limit(20).get();

        if (versionsSnap.empty) {
          return JSON.stringify({ found: false, count: 0, message: 'No saved resume versions. The user can create morphed versions from Resume Studio or by asking Taco to morph their resume for a specific job.' });
        }

        const versions = versionsSnap.docs.map(d => {
          const data = d.data();
          const content = data.content || {};
          return {
            id: d.id,
            name: data.version_name || content.name || 'Untitled',
            targetCompany: data.target_company || null,
            targetRole: data.target_role || null,
            createdAt: data.created_at?.toDate?.()?.toISOString() || '',
            skillCount: (content.skills || []).flatMap((s: any) => s.items || []).length,
            experienceCount: (content.experience || []).length,
          };
        });

        return JSON.stringify({
          found: true,
          count: versions.length,
          versions,
          instruction: 'Present these versions to the user in a clean list. If they want to use a specific one, call use_resume_version with the ID. Highlight which ones are tailored for specific companies.',
        });
      } catch (e: any) {
        return JSON.stringify({ found: false, error: e.message });
      }
    }

    case 'use_resume_version': {
      try {
        const versionId = args.versionId;
        if (!versionId) return JSON.stringify({ error: 'versionId is required' });

        const versionDoc = await db.collection('users').doc(uid).collection('resume_versions').doc(versionId).get();
        if (!versionDoc.exists) {
          return JSON.stringify({ found: false, error: `Resume version "${versionId}" not found. Call list_resume_versions to see available versions.` });
        }

        const data = versionDoc.data()!;
        const content = data.content || {};

        return JSON.stringify({
          found: true,
          versionId,
          versionName: data.version_name || content.name || 'Untitled',
          targetCompany: data.target_company || null,
          targetRole: data.target_role || null,
          name: content.name || '',
          title: content.title || '',
          summary: content.summary || '',
          skills: (content.skills || []).flatMap((s: any) => s.items || []).slice(0, 30),
          experience: (content.experience || []).slice(0, 5).map((e: any) => ({
            role: e.role || e.title || '',
            company: e.company || '',
            duration: e.duration || '',
            bullets: (e.bullets || e.highlights || e.achievements || []).slice(0, 3),
          })),
          experienceCount: (content.experience || []).length,
          educationCount: (content.education || []).length,
          instruction: 'This resume version is now loaded. Use it as the context for any subsequent operations the user requests (fit analysis, cover letter, interview prep, etc.). Tell the user which version you\'re now working with.',
        });
      } catch (e: any) {
        return JSON.stringify({ found: false, error: e.message });
      }
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}
