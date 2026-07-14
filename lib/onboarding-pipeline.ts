'use client';

/**
 * Onboarding Pipeline — Post-onboarding auto-actions
 * Runs after the user completes the onboarding wizard.
 * Seeds both the client-side resume_versions AND server-side vault,
 * extracts skills, and sets preferences.
 */

import { saveResumeVersion } from '@/lib/database-suite';
import { updateUserProfile } from '@/lib/database-suite';
import type { UserProfile } from '@/lib/database-suite';
import { auth } from '@/lib/firebase';

export async function runPostOnboardingPipeline(profile: UserProfile) {
  const tasks: Promise<any>[] = [];

  const resumeData = profile.base_resume_parsed;
  const resumeText = profile.base_resume_text;

  // 1. Save to client-side resume_versions collection (Resume Studio reads this)
  if (resumeData) {
    tasks.push(
      saveResumeVersion(
        'Original Resume',
        resumeData,
        extractSkillGraph(resumeData),
        'technical',
        {
          savedFrom: 'onboarding_upload',
          resumeProvenance: { verified: true, origin: 'onboarding_upload' },
        }
      )
    );
  }

  // 2. Seed the server-side vault collection (Sona, Cover Letter, Job Fit all read this)
  //    This is the critical bridge — without it, Sona says "no resume found"
  if (resumeData || resumeText) {
    tasks.push(seedVault(resumeData, resumeText));
  }

  // 3. Auto-populate UserProfile.skills from parsed resume
  if (resumeData?.skills) {
    const flatSkills = (resumeData.skills as any[])
      .flatMap((g: any) => g.items || [])
      .filter(Boolean);
    if (flatSkills.length > 0) {
      tasks.push(updateUserProfile({ skills: flatSkills }));
    }
  }

  // 4. Set structured preferences from onboarding selections
  tasks.push(
    updateUserProfile({
      preferences: {
        target_roles: profile.target_roles || [],
        career_fields: profile.career_fields || [],
        location: profile.location_preference || '',
        salary_range: profile.salary_range || null,
        seniority: profile.seniority_level || '',
      },
    })
  );

  await Promise.allSettled(tasks);
}

/**
 * Seed the server-side `vault` collection via API route.
 * This is what Sona's fetch_resume, analyze_job_fit, generate_cover_letter,
 * and all other AI tools read from.
 */
async function seedVault(parsed: any | null, rawText?: string): Promise<void> {
  try {
    // Retry token acquisition — auth.currentUser may not be ready right after signup
    let token: string | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      token = await auth.currentUser?.getIdToken?.() || undefined;
      if (token) break;
      await new Promise(r => setTimeout(r, 500)); // Wait 500ms for auth state to propagate
    }
    if (!token) {
      console.warn('[onboarding-pipeline] Could not get auth token after 3 attempts');
      return;
    }

    // Build a resume object from parsed data or construct a minimal one from raw text
    const resume = parsed || buildMinimalResume(rawText || '');

    const res = await fetch('/api/onboarding/seed-vault', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ resume }),
    });

    if (!res.ok) {
      console.error('[onboarding-pipeline] Vault seeding failed:', await res.text());
    }
  } catch (err) {
    console.error('[onboarding-pipeline] Vault seeding error:', err);
  }
}

/**
 * Build a minimal resume structure from raw text when normalizeResume() fails.
 * This ensures Sona at least has the raw content to work with.
 */
function buildMinimalResume(text: string): any {
  return {
    name: '',
    title: '',
    summary: text.substring(0, 500),
    rawText: text,
    skills: [],
    experience: [],
    education: [],
    _source: 'onboarding_raw_text',
  };
}

function extractSkillGraph(parsed: any): any {
  if (!parsed?.skills) return { nodes: [], edges: [] };
  const nodes = (parsed.skills as any[]).flatMap((g: any) =>
    (g.items || []).map((item: string) => ({
      id: item.toLowerCase().replace(/\s+/g, '-'),
      label: item,
      category: g.category || 'General',
      weight: 1,
    }))
  );
  return { nodes, edges: [] };
}
