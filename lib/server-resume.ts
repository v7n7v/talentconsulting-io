import { classifyResumeVerification, type ResumeSource, type ResumeVerification } from '@/lib/resume-source-classifier';

export { classifyResumeVerification } from '@/lib/resume-source-classifier';
export type { ResumeSource, ResumeVerification, ResumeVerificationKind } from '@/lib/resume-source-classifier';

export interface LatestResumeResult {
  resume: any | null;
  source: ResumeSource | null;
  id: string | null;
  updatedAt: string | null;
  verification?: ResumeVerification;
}

function timestampToMillis(value: any): number {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function timestampToIso(value: any): string | null {
  const millis = timestampToMillis(value);
  return millis > 0 ? new Date(millis).toISOString() : null;
}

function normalizeVersionResume(data: any) {
  return data?.content || data?.resume || data?.parsed || data || null;
}

function normalizeVaultResume(data: any) {
  return data?.resume || data?.parsed || data?.content || data || null;
}

function hasV2SourceEnvelope(data: any): boolean {
  const workspace = data?.metadata?.workspace;
  return Boolean(workspace && typeof workspace === 'object' && (workspace.schemaVersion === 2 || workspace.kind === 'source'))
    || data?.source_confirmation_receipt != null || data?.metadata?.source_confirmation_receipt != null;
}

async function readResumeDocument(doc: any, uid: string, source: ResumeSource): Promise<LatestResumeResult | null> {
  if (doc?.exists === false || typeof doc?.data !== 'function') return null;
  const data = doc.data() || {};
  const id = typeof doc.id === 'string' ? doc.id : '';
  let resume: any;
  let verification = classifyResumeVerification(data, source);
  if (hasV2SourceEnvelope(data)) {
    if (source !== 'resume_versions') return null;
    const { validateSealedSearchSource } = await import('./resume-source-integrity');
    const sealed = validateSealedSearchSource(data, { uid, id, collection: 'resume_versions' });
    if (!sealed) return null;
    resume = sealed.content;
    verification = { verified: true, kind: 'explicit_user_source', reason: 'Sealed source integrity verified on read.' };
  } else {
    resume = source === 'resume_versions' ? normalizeVersionResume(data) : normalizeVaultResume(data);
  }
  const sortValue = data.updatedAt || data.createdAt || data.updated_at || data.created_at;
  return {
    resume, source, id,
    updatedAt: timestampToIso(sortValue),
    verification,
  };
}

async function getProfileResume(userRef: any): Promise<LatestResumeResult> {
  const profileSnap = await userRef.collection('profile').doc('main').get().catch(() => null);
  if (profileSnap?.exists) {
    const data = profileSnap.data() || {};
    if (data.base_resume_parsed || data.base_resume_text) {
      return {
        resume: data.base_resume_parsed || {
          name: data.full_name || '',
          summary: String(data.base_resume_text || '').slice(0, 500),
          rawText: data.base_resume_text || '',
          skills: [],
          experience: [],
          education: [],
        },
        source: 'profile',
        id: profileSnap.id,
        updatedAt: timestampToIso(data.updatedAt || data.createdAt || data.updated_at || data.created_at),
        verification: classifyResumeVerification(data, 'profile'),
      };
    }
  }

  return { resume: null, source: null, id: null, updatedAt: null, verification: { verified: false, kind: 'unverified', reason: 'No resume found.' } };
}

export async function getLatestResumeForUser(db: any, uid: string): Promise<LatestResumeResult> {
  const userRef = db.collection('users').doc(uid);
  const [versionsSnap, vaultSnap] = await Promise.all([
    userRef.collection('resume_versions').orderBy('created_at', 'desc').limit(1).get().catch(() => null),
    userRef.collection('vault').orderBy('createdAt', 'desc').limit(1).get().catch(() => null),
  ]);

  const candidates: Array<LatestResumeResult & { sortTime: number }> = [];

  if (versionsSnap && !versionsSnap.empty) {
    for (const doc of versionsSnap.docs) {
      const resolved = await readResumeDocument(doc, uid, 'resume_versions');
      if (resolved?.resume) {
        candidates.push({ ...resolved, sortTime: timestampToMillis(resolved.updatedAt) });
        break;
      }
    }
  }

  if (vaultSnap && !vaultSnap.empty) {
    for (const doc of vaultSnap.docs) {
      const resolved = await readResumeDocument(doc, uid, 'vault');
      if (resolved?.resume) {
        candidates.push({ ...resolved, sortTime: timestampToMillis(resolved.updatedAt) });
        break;
      }
    }
  }

  candidates.sort((a, b) => b.sortTime - a.sortTime);
  const latest = candidates.find(candidate => candidate.resume);
  if (latest) {
    const { sortTime, ...result } = latest;
    return result;
  }

  return getProfileResume(userRef);
}

/**
 * Returns the newest user-authored or uploaded resume, excluding generated
 * review drafts so repeated agent runs cannot silently compound AI output.
 */
async function getLatestResumeMatchingVerification(
  db: any,
  uid: string,
  accepts: (verification: ResumeVerification) => boolean,
): Promise<LatestResumeResult> {
  const userRef = db.collection('users').doc(uid);
  const [versionsSnap, vaultSnap] = await Promise.all([
    userRef.collection('resume_versions').orderBy('created_at', 'desc').limit(25).get().catch(() => null),
    userRef.collection('vault').orderBy('createdAt', 'desc').limit(25).get().catch(() => null),
  ]);
  const candidates: Array<LatestResumeResult & { sortTime: number }> = [];

  if (versionsSnap && !versionsSnap.empty) {
    for (const doc of versionsSnap.docs) {
      if (!accepts(classifyResumeVerification(doc.data(), 'resume_versions'))) continue;
      const resolved = await readResumeDocument(doc, uid, 'resume_versions');
      if (resolved?.resume && resolved.verification && accepts(resolved.verification)) {
        candidates.push({ ...resolved, sortTime: timestampToMillis(resolved.updatedAt) });
        break;
      }
    }
  }

  if (vaultSnap && !vaultSnap.empty) {
    for (const doc of vaultSnap.docs) {
      if (!accepts(classifyResumeVerification(doc.data(), 'vault'))) continue;
      const resolved = await readResumeDocument(doc, uid, 'vault');
      if (resolved?.resume && resolved.verification && accepts(resolved.verification)) {
        candidates.push({ ...resolved, sortTime: timestampToMillis(resolved.updatedAt) });
        break;
      }
    }
  }

  candidates.sort((a, b) => b.sortTime - a.sortTime);
  const latest = candidates.find(candidate => candidate.resume);
  if (latest) {
    const { sortTime, ...result } = latest;
    return result;
  }

  const profileResume = await getProfileResume(userRef);
  if (profileResume.verification && accepts(profileResume.verification)) return profileResume;
  return {
    resume: null,
    source: null,
    id: null,
    updatedAt: null,
    verification: profileResume.verification || { verified: false, kind: 'unverified', reason: 'No verified resume found.' },
  };
}

export async function getLatestVerifiedResumeForUser(db: any, uid: string): Promise<LatestResumeResult> {
  return getLatestResumeMatchingVerification(db, uid, verification => verification.verified);
}

async function getExplicitSourceDocuments(collection: any) {
  const [provenanceSnap, resumeProvenanceSnap, sealedSourceSnap] = await Promise.all([
    collection.where('provenance.verified', '==', true).get(),
    collection.where('resume_provenance.verified', '==', true).get(),
    collection.where('metadata.workspace.kind', '==', 'source').get().catch(() => null),
  ]);
  const documents = new Map<string, any>();
  for (const snapshot of [provenanceSnap, resumeProvenanceSnap, sealedSourceSnap]) {
    for (const document of snapshot.docs || []) documents.set(document.id, document);
  }
  return Array.from(documents.values());
}

export async function getLatestExplicitResumeForUser(db: any, uid: string): Promise<LatestResumeResult> {
  const userRef = db.collection('users').doc(uid);
  const [versionDocs, vaultDocs, profileResume] = await Promise.all([
    getExplicitSourceDocuments(userRef.collection('resume_versions')),
    getExplicitSourceDocuments(userRef.collection('vault')),
    getProfileResume(userRef),
  ]);
  const candidates: Array<LatestResumeResult & { sortTime: number }> = [];

  for (const [documents, source] of [[versionDocs, 'resume_versions'], [vaultDocs, 'vault']] as const) {
    for (const document of documents) {
      const data = document.data() || {};
      const resolved = await readResumeDocument(document, uid, source);
      if (hasV2SourceEnvelope(data) && !resolved) continue;
      const verification = resolved?.verification || classifyResumeVerification(data, source);
      if (!verification.verified || verification.kind !== 'explicit_user_source') continue;
      candidates.push({
        resume: resolved?.resume || null,
        source, id: document.id,
        updatedAt: resolved?.updatedAt || null,
        sortTime: timestampToMillis(resolved?.updatedAt),
        verification,
      });
    }
  }

  if (profileResume.resume
    && profileResume.verification?.verified
    && profileResume.verification.kind === 'explicit_user_source') {
    candidates.push({
      ...profileResume,
      sortTime: timestampToMillis(profileResume.updatedAt),
    });
  }

  candidates.sort((a, b) => b.sortTime - a.sortTime);
  const latest = candidates.find(candidate => candidate.resume);
  if (latest) {
    const { sortTime, ...result } = latest;
    return result;
  }
  return {
    resume: null,
    source: null,
    id: null,
    updatedAt: null,
    verification: { verified: false, kind: 'unverified', reason: 'No explicit user-source resume found.' },
  };
}

export async function getVerifiedResumeForUserById(db: any, uid: string, resumeId: string): Promise<LatestResumeResult> {
  if (!/^[A-Za-z0-9_-]{1,180}$/.test(resumeId)) {
    return { resume: null, source: null, id: null, updatedAt: null, verification: { verified: false, kind: 'unverified', reason: 'Resume id is invalid.' } };
  }
  const userRef = db.collection('users').doc(uid);
  const versionSnap = await userRef.collection('resume_versions').doc(resumeId).get();
  if (versionSnap?.exists) {
    const data = versionSnap.data() || {};
    const resolved = await readResumeDocument(versionSnap, uid, 'resume_versions');
    if (hasV2SourceEnvelope(data)) {
      if (resolved?.verification?.verified) return resolved;
      return { resume: null, source: null, id: null, updatedAt: null, verification: { verified: false, kind: 'unverified', reason: 'Selected sealed source failed integrity checks.' } };
    }
    const verification = classifyResumeVerification(data, 'resume_versions');
    if (verification.verified && resolved) return { ...resolved, verification };
  }
  const vaultSnap = await userRef.collection('vault').doc(resumeId).get();
  if (vaultSnap?.exists) {
    const data = vaultSnap.data() || {};
    const verification = classifyResumeVerification(data, 'vault');
    const resolved = await readResumeDocument(vaultSnap, uid, 'vault');
    if (verification.verified && resolved) return { ...resolved, verification };
  }
  return { resume: null, source: null, id: null, updatedAt: null, verification: { verified: false, kind: 'unverified', reason: 'Selected resume is not a verified user source.' } };
}

export function extractResumeSkills(resume: any): string[] {
  const rawSkills = resume?.skills || resume?.parsed?.skills || [];
  if (!Array.isArray(rawSkills)) return [];

  const skills = rawSkills.flatMap((skill: any) => {
    if (!skill) return [];
    if (typeof skill === 'string') return [skill];
    if (Array.isArray(skill.items)) return skill.items;
    if (Array.isArray(skill.skills)) return skill.skills;
    return [skill.name, skill.label, skill.skill].filter(Boolean);
  });

  return Array.from(new Set(skills.map((skill: any) => String(skill).trim()).filter(Boolean))).slice(0, 50);
}
