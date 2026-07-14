'use client';

const PENDING_AUTH_REDIRECT_KEY = 'talentconsulting.pendingAuthRedirect';

function isSafeLocalPath(path: string | null | undefined): path is string {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//');
}

export function setPendingAuthRedirect(path: string | null | undefined) {
  if (typeof window === 'undefined' || !isSafeLocalPath(path)) return;
  try {
    window.sessionStorage.setItem(PENDING_AUTH_REDIRECT_KEY, path);
  } catch {
    // Redirect preservation is best-effort when browser storage is blocked.
  }
}

export function clearPendingAuthRedirect() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(PENDING_AUTH_REDIRECT_KEY);
  } catch {
    // Browser storage may be unavailable in privacy-restricted contexts.
  }
}

export function consumePendingAuthRedirect() {
  if (typeof window === 'undefined') return null;

  try {
    const path = window.sessionStorage.getItem(PENDING_AUTH_REDIRECT_KEY);
    window.sessionStorage.removeItem(PENDING_AUTH_REDIRECT_KEY);
    return isSafeLocalPath(path) ? path : null;
  } catch {
    return null;
  }
}
