/**
 * Firebase Admin SDK — Server-side only
 * Authenticates via service account JSON stored in FIREBASE_SERVICE_ACCOUNT_JSON env var.
 */
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage, type Storage } from 'firebase-admin/storage';

let adminApp: App;
let adminAuth: Auth;
let adminDb: Firestore;
let adminStorage: Storage;

function getAdminApp(): App {
  if (adminApp) return adminApp;

  if (getApps().length > 0) {
    adminApp = getApps()[0];
    return adminApp;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson) {
    // Parse the inline JSON service account and initialise with full credentials
    const serviceAccount = JSON.parse(serviceAccountJson);
    adminApp = initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  } else {
    // Fallback: projectId-only (works for token verification but NOT Firestore writes)
    console.warn('[firebase-admin] FIREBASE_SERVICE_ACCOUNT_JSON not set — Firestore calls will fail.');
    adminApp = initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  }

  return adminApp;
}

export function getAdminAuth(): Auth {
  if (adminAuth) return adminAuth;
  adminAuth = getAuth(getAdminApp());
  return adminAuth;
}

export function getAdminDb(): Firestore {
  if (adminDb) return adminDb;
  adminDb = getFirestore(getAdminApp());
  return adminDb;
}

export function getAdminStorage(): Storage {
  if (adminStorage) return adminStorage;
  adminStorage = getStorage(getAdminApp());
  return adminStorage;
}

/**
 * Verify a Firebase ID token from the Authorization header.
 * Returns the decoded token (with uid, email, etc.) or null if invalid.
 */
export async function verifyIdToken(token: string) {
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return decoded;
  } catch {
    return null;
  }
}
