import { normalizeVerifiedResumeProvenance } from '@/lib/resume-provenance';

type ResumeSource = 'resume_versions' | 'vault' | 'profile';

export type ResumeVerificationKind = 'explicit_user_source' | 'legacy_user_approved' | 'unverified';

export interface ResumeVerification {
  verified: boolean;
  kind: ResumeVerificationKind;
  reason: string;
}

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

function isGeneratedResumeDraft(data: any) {
  const source = String(data?.source || '').toLowerCase();
  const mode = String(data?.mode || '').toLowerCase();
  const isSonaUpload = source === 'sona_upload' || source === 'sona_resume_upload';
  const hasMorphMetadata = Boolean(
    data?.guardrail_report
    || data?.morph_guardrail_report
    || data?.morph_effective_percentage,
  );

  return hasMorphMetadata
    || (source.startsWith('sona') && !isSonaUpload)
    || source.includes('agent')
    || source.includes('morph')
    || source.includes('auto_fix')
    || source.includes('nightly')
    || source.includes('apply_pipeline')
    || mode.includes('agent')
    || mode.includes('morph');
}

function classifyResumeVerification(data: any, source: ResumeSource): ResumeVerification {
  if (isGeneratedResumeDraft(data)) {
    return { verified: false, kind: 'unverified', reason: 'Generated or morphed resume output cannot be a source of truth.' };
  }
  const rawProvenance = data?.provenance || data?.resume_provenance;
  const explicitProvenance = normalizeVerifiedResumeProvenance(
    rawProvenance,
    String(rawProvenance?.recordedAt || data?.updatedAt || data?.updated_at || data?.createdAt || data?.created_at || ''),
  );
  if (explicitProvenance) {
    return { verified: true, kind: 'explicit_user_source', reason: 'Stored with explicit user-source provenance.' };
  }
  if (source === 'resume_versions' && data?.is_active === true) {
    return { verified: true, kind: 'legacy_user_approved', reason: 'Legacy active resume with no generated-output markers.' };
  }
  return { verified: false, kind: 'unverified', reason: 'Resume provenance is missing or ambiguous.' };
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
    const doc = versionsSnap.docs[0];
    const data = doc.data();
    const sortValue = data.updated_at || data.created_at;
    candidates.push({
      resume: normalizeVersionResume(data),
      source: 'resume_versions',
      id: doc.id,
      updatedAt: timestampToIso(sortValue),
      sortTime: timestampToMillis(sortValue),
      verification: classifyResumeVerification(data, 'resume_versions'),
    });
  }

  if (vaultSnap && !vaultSnap.empty) {
    const doc = vaultSnap.docs[0];
    const data = doc.data();
    const sortValue = data.updatedAt || data.createdAt || data.updated_at || data.created_at;
    candidates.push({
      resume: normalizeVaultResume(data),
      source: 'vault',
      id: doc.id,
      updatedAt: timestampToIso(sortValue),
      sortTime: timestampToMillis(sortValue),
      verification: classifyResumeVerification(data, 'vault'),
    });
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
    const verifiedDoc = versionsSnap.docs.find((doc: any) => accepts(classifyResumeVerification(doc.data(), 'resume_versions')));
    if (verifiedDoc) {
      const data = verifiedDoc.data();
      const sortValue = data.updated_at || data.created_at;
      candidates.push({
        resume: normalizeVersionResume(data),
        source: 'resume_versions',
        id: verifiedDoc.id,
        updatedAt: timestampToIso(sortValue),
        sortTime: timestampToMillis(sortValue),
        verification: classifyResumeVerification(data, 'resume_versions'),
      });
    }
  }

  if (vaultSnap && !vaultSnap.empty) {
    const doc = vaultSnap.docs.find((candidate: any) => accepts(classifyResumeVerification(candidate.data(), 'vault')));
    if (doc) {
      const data = doc.data();
      const verification = classifyResumeVerification(data, 'vault');
      const sortValue = data.updatedAt || data.createdAt || data.updated_at || data.created_at;
      candidates.push({
        resume: normalizeVaultResume(data),
        source: 'vault',
        id: doc.id,
        updatedAt: timestampToIso(sortValue),
        sortTime: timestampToMillis(sortValue),
        verification,
      });
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
  const [provenanceSnap, resumeProvenanceSnap] = await Promise.all([
    collection.where('provenance.verified', '==', true).get(),
    collection.where('resume_provenance.verified', '==', true).get(),
  ]);
  const documents = new Map<string, any>();
  for (const snapshot of [provenanceSnap, resumeProvenanceSnap]) {
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
      const verification = classifyResumeVerification(data, source);
      if (!verification.verified || verification.kind !== 'explicit_user_source') continue;
      const sortValue = data.updatedAt || data.createdAt || data.updated_at || data.created_at;
      candidates.push({
        resume: source === 'resume_versions' ? normalizeVersionResume(data) : normalizeVaultResume(data),
        source,
        id: document.id,
        updatedAt: timestampToIso(sortValue),
        sortTime: timestampToMillis(sortValue),
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
  const [versionSnap, vaultSnap] = await Promise.all([
    userRef.collection('resume_versions').doc(resumeId).get(),
    userRef.collection('vault').doc(resumeId).get(),
  ]);
  for (const [snapshot, source] of [[versionSnap, 'resume_versions'], [vaultSnap, 'vault']] as const) {
    if (!snapshot?.exists) continue;
    const data = snapshot.data() || {};
    const verification = classifyResumeVerification(data, source);
    if (!verification.verified) continue;
    const updatedAt = timestampToIso(data.updatedAt || data.createdAt || data.updated_at || data.created_at);
    return {
      resume: source === 'resume_versions' ? normalizeVersionResume(data) : normalizeVaultResume(data),
      source,
      id: snapshot.id,
      updatedAt,
      verification,
    };
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
