/**
 * Sona AI — Vercel AI SDK Tool Definitions
 * Wraps the existing executeTool() function with Zod-schema tool definitions.
 * Tool execution logic remains in sona-tools.ts — this file only defines schemas.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { executeTool } from '@/lib/sona-tools';

async function safeExecute(name: string, args: unknown, uid: string) {
  try {
    const result = await executeTool(name, (args ?? {}) as Record<string, any>, uid);
    return JSON.parse(result);
  } catch (e: any) {
    return { error: e.message || 'Tool execution failed' };
  }
}

/**
 * Creates the Sona toolkit bound to a specific user ID.
 * Each tool's execute function calls the existing executeTool() with the uid.
 */
export function createSonaToolkit(uid: string) {
  return {
    fetch_resume: tool({
      description: 'Fetch the user\'s most recent Vault resume including skills, experience, education, and summary. Use when discussing resume content, skill gaps, or career trajectory.',
      inputSchema: z.object({}),
      execute: async (args) => safeExecute('fetch_resume', args, uid),
    }),

    fetch_applications: tool({
      description: 'Fetch the user\'s tracked job applications with statuses (Applied, Interviewing, Offer, Rejected). Use when discussing application pipeline, follow-ups, or job search progress.',
      inputSchema: z.object({
        limit: z.number().optional().describe('Max applications to return (default 10)'),
      }),
      execute: async (args) => safeExecute('fetch_applications', args, uid),
    }),

    fetch_preferences: tool({
      description: 'Fetch the user\'s job preferences including target roles, preferred cities, remote preference, and salary expectations. Use when discussing job search strategy or recommendations.',
      inputSchema: z.object({}),
      execute: async (args) => safeExecute('fetch_preferences', args, uid),
    }),

    search_jobs: tool({
      description: 'Search for new job listings matching a query and location. Use when the user asks to find jobs or when you need to recommend specific roles.',
      inputSchema: z.object({
        query: z.string().describe('Job title or keyword to search for'),
        location: z.string().optional().describe('City or "remote"'),
      }),
      execute: async (args) => safeExecute('search_jobs', args, uid),
    }),

    scan_company_portal: tool({
      description: 'Scan a specific company\'s job board directly (Greenhouse, Lever, or Ashby). Returns fresher listings than aggregators like Indeed or LinkedIn. Use when the user mentions a specific company they want to work at. Works for companies like Stripe, Airbnb, Coinbase, Figma, Notion, Vercel, Netflix, Discord, etc.',
      inputSchema: z.object({
        company: z.string().describe('Company name or career page slug (e.g., "stripe", "airbnb")'),
        query: z.string().optional().describe('Optional: filter jobs by keyword (e.g., "engineer", "data science")'),
      }),
      execute: async (args) => safeExecute('scan_company_portal', args, uid),
    }),

    draft_follow_up: tool({
      description: 'Draft a follow-up email for a specific company/application. Returns the draft text for user approval — never send directly.',
      inputSchema: z.object({
        company: z.string().describe('Company name'),
        context: z.string().optional().describe('Context: what stage, when applied, role title'),
      }),
      execute: async (args) => safeExecute('draft_follow_up', args, uid),
    }),

    analyze_job_fit: tool({
      description: 'Analyze how well the user\'s resume fits a specific job description. Returns a fit score, verdict, matching/missing skills, and knockout flags. ALWAYS call this before recommending the user apply to a job.',
      inputSchema: z.object({
        jobTitle: z.string().describe('The job title'),
        jobDescription: z.string().optional().describe('The full or partial job description text'),
        company: z.string().optional().describe('Company name (optional)'),
      }),
      execute: async (args) => safeExecute('analyze_job_fit', args, uid),
    }),

    morph_resume_for_job: tool({
      description: 'Generate a tailored resume version optimized for a specific job description. Rewrites bullet points to match JD keywords while keeping facts truthful. Returns a draft for user review.',
      inputSchema: z.object({
        jobTitle: z.string().describe('Target job title'),
        jobDescription: z.string().optional().describe('The job description to optimize for'),
        emphasis: z.string().optional().describe('Optional: specific skills or experiences to emphasize'),
      }),
      execute: async (args) => safeExecute('morph_resume_for_job', args, uid),
    }),

    draft_cover_letter: tool({
      description: 'Generate a tailored 3-paragraph cover letter for a specific role. Uses the user\'s Vault resume data and the JD to create a personalized letter. Returns a draft for user review.',
      inputSchema: z.object({
        company: z.string().describe('Company name'),
        role: z.string().describe('Job title/role'),
        jobDescription: z.string().optional().describe('The job description'),
        tone: z.string().optional().describe('Optional: "formal", "conversational", or "confident". Default: "confident"'),
      }),
      execute: async (args) => safeExecute('draft_cover_letter', args, uid),
    }),

    queue_application: tool({
      description: 'Save a prepared application to the user\'s "Ready to Submit" queue. This does NOT submit the application — the user reviews and submits manually. Use after morph_resume_for_job and draft_cover_letter to package everything together.',
      inputSchema: z.object({
        company: z.string().describe('Company name'),
        role: z.string().describe('Job title'),
        url: z.string().optional().describe('Application URL'),
        fitScore: z.number().optional().describe('Fit score from analyze_job_fit'),
        resumeSummary: z.string().optional().describe('Brief description of resume customizations made'),
        coverLetterPreview: z.string().optional().describe('First 200 chars of the cover letter draft'),
      }),
      execute: async (args) => safeExecute('queue_application', args, uid),
    }),

    generate_tailored_resume: tool({
      description: 'Generate an ATS-optimized resume tailored to a specific job description. Rewrites summary, reorders experience bullets to match JD priorities, injects missing keywords ethically. Returns tailored resume data the user can download as a PDF. Use AFTER analyze_job_fit when the user wants to apply.',
      inputSchema: z.object({
        jobTitle: z.string().describe('Target job title'),
        jobDescription: z.string().optional().describe('The full job description to tailor for'),
        company: z.string().optional().describe('Company name'),
      }),
      execute: async (args) => safeExecute('generate_tailored_resume', args, uid),
    }),

    save_star_story: tool({
      description: 'Save a STAR (Situation, Task, Action, Result) story to the user\'s interview story bank. Use when the user shares a professional achievement, or when analyzing job fit reveals a strong experience match. Stories accumulate over time for interview prep.',
      inputSchema: z.object({
        title: z.string().describe('Brief story title (e.g., "Cut deploy time 80%")'),
        situation: z.string().describe('The context — what was happening'),
        task: z.string().describe('What you were responsible for'),
        action: z.string().describe('What you specifically did'),
        result: z.string().describe('Measurable outcome'),
        reflection: z.string().optional().describe('What was learned (optional)'),
        tags: z.array(z.string()).optional().describe('Skills/themes this story demonstrates (e.g., ["leadership", "devops", "optimization"])'),
      }),
      execute: async (args) => safeExecute('save_star_story', args, uid),
    }),

    get_story_bank: tool({
      description: 'Fetch the user\'s saved STAR stories for interview prep. Use when prepping for interviews, reviewing achievements, or finding stories that match a specific job\'s requirements. Can filter by skill/theme tags.',
      inputSchema: z.object({
        tags: z.array(z.string()).optional().describe('Optional: filter stories by skill/theme tags'),
        limit: z.number().optional().describe('Max stories to return (default 10)'),
      }),
      execute: async (args) => safeExecute('get_story_bank', args, uid),
    }),

    prep_for_interview: tool({
      description: 'Generate an interview prep package for a specific company/role. Generates likely questions, maps matching STAR stories from the story bank, and suggests questions to ask the interviewer. Use when the user mentions an upcoming interview or when an application status changes to interview_scheduled.',
      inputSchema: z.object({
        company: z.string().describe('Company name'),
        role: z.string().describe('Job title/role'),
        jobDescription: z.string().optional().describe('Job description if available'),
      }),
      execute: async (args) => safeExecute('prep_for_interview', args, uid),
    }),

    negotiate_offer: tool({
      description: 'Generate a salary negotiation strategy with counter-offer scripts, market data, and leverage points. Use when the user mentions receiving a job offer, discussing compensation, or needs help negotiating.',
      inputSchema: z.object({
        company: z.string().describe('Company name'),
        role: z.string().describe('Job title'),
        offerBase: z.number().describe('Base salary offered in thousands (e.g. 120 for $120k)'),
        offerTotal: z.number().optional().describe('Total comp offered in thousands (optional)'),
        desiredBase: z.number().optional().describe('Desired base salary in thousands (optional)'),
        hasCompetingOffer: z.boolean().optional().describe('Whether the candidate has another offer'),
        context: z.string().optional().describe('Any additional context about the negotiation'),
      }),
      execute: async (args) => safeExecute('negotiate_offer', args, uid),
    }),

    optimize_linkedin: tool({
      description: 'Analyze and optimize the user\'s LinkedIn headline and about section. Provides a score, optimized rewrites, missing keywords, and quick wins. Use when the user mentions LinkedIn, their profile, recruiter visibility, or personal branding.',
      inputSchema: z.object({
        headline: z.string().optional().describe('Current LinkedIn headline'),
        about: z.string().optional().describe('Current LinkedIn about/summary section'),
        targetRole: z.string().optional().describe('Target role they want to be found for (optional)'),
      }),
      execute: async (args) => safeExecute('optimize_linkedin', args, uid),
    }),

    generate_cover_letter: tool({
      description: 'Generate an AI-crafted cover letter tailored to a specific job using the user\'s resume. Use when the user asks for a cover letter, mentions applying to a job and needs writing help, or says "write a cover letter".',
      inputSchema: z.object({
        company: z.string().describe('Company name'),
        jobTitle: z.string().describe('Job title they are applying for'),
        tone: z.enum(['conversational', 'professional', 'confident', 'storytelling']).optional().describe('Writing tone'),
        template: z.enum(['classic', 'modern', 'impact', 'pain_point']).optional().describe('Cover letter template style'),
      }),
      execute: async (args) => safeExecute('generate_cover_letter', args, uid),
    }),

    log_interview_debrief: tool({
      description: 'Log an interview debrief after the user discusses an interview they had. Use when the user talks about a recent interview, mentions "I just interviewed", "talked to a recruiter", or asks to debrief. Auto-generates a STAR story from the debrief.',
      inputSchema: z.object({
        company: z.string().describe('Company name'),
        role: z.string().describe('Role they interviewed for'),
        roundType: z.enum(['phone', 'technical', 'behavioral', 'system_design', 'hiring_manager', 'panel', 'final', 'culture']).optional().describe('Type of interview round'),
        overallFeeling: z.number().optional().describe('How it went, 1-5 scale'),
        strengths: z.string().optional().describe('What went well'),
        weaknesses: z.string().optional().describe('What was weak or could improve'),
      }),
      execute: async (args) => safeExecute('log_interview_debrief', args, uid),
    }),

    fetch_career_intelligence: tool({
      description: 'Fetch the user\'s full career intelligence profile including health score, skill gaps, pipeline metrics, interview patterns, morale, and smart recommendations. Use when the user asks "how am I doing?", "what should I focus on?", "career advice", "job search strategy", "am I on track?", or any question about their overall career search progress.',
      inputSchema: z.object({}),
      execute: async (args) => safeExecute('fetch_career_intelligence', args, uid),
    }),

    answer_screening_question: tool({
      description: 'Answer a behavioral or screening question using the user\'s Story Bank. Searches their STAR stories, finds the best match, and drafts a ready-to-paste answer. Use when the user shares a question from a job application, ATS form, screening call, or interview prep. Trigger phrases: "help me answer", "screening question", "application question", "ATS question", "behavioral question", "how should I answer", "they asked me".',
      inputSchema: z.object({
        question: z.string().describe('The behavioral or screening question to answer'),
        context: z.string().optional().describe('Optional context about the role/company'),
      }),
      execute: async (args) => safeExecute('answer_screening_question', args, uid),
    }),

    list_resume_versions: tool({
      description: 'List all of the user\'s saved resume versions, including morphed/tailored versions. Returns version names, target companies, and creation dates so the user can pick which one to use. Trigger phrases: "show my resumes", "which resumes do I have", "my morphed resumes", "resume versions", "list resumes".',
      inputSchema: z.object({}),
      execute: async (args) => safeExecute('list_resume_versions', args, uid),
    }),

    use_resume_version: tool({
      description: 'Load a specific saved resume version by ID to use for subsequent operations (fit analysis, cover letter, interview prep, etc.). Call list_resume_versions first to get available IDs. Use when the user says "use my Google resume", "switch to my Stripe version", or picks a specific resume from the list.',
      inputSchema: z.object({
        versionId: z.string().describe('The resume version ID from list_resume_versions'),
      }),
      execute: async (args) => safeExecute('use_resume_version', args, uid),
    }),
  };
}

export type SonaToolkit = ReturnType<typeof createSonaToolkit>;
