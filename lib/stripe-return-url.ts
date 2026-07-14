const DEFAULT_APP_ORIGIN = 'https://talentconsulting.io';

function normalizeOrigin(value: string | null) {
  if (!value) return DEFAULT_APP_ORIGIN;

  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return DEFAULT_APP_ORIGIN;
  }
}

export function getAllowedStripeReturnOrigin(requestOrigin: string | null) {
  const origin = normalizeOrigin(requestOrigin);
  const { hostname, protocol } = new URL(origin);

  const isLocalhost =
    protocol === 'http:' &&
    (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0');

  const isProduction = origin === DEFAULT_APP_ORIGIN || origin === 'https://www.talentconsulting.io';
  const isFirebaseHost =
    protocol === 'https:' &&
    (hostname === 'talent-consulting-acf16.web.app' ||
      hostname === 'talent-consulting-acf16.firebaseapp.com' ||
      (hostname.endsWith('.web.app') && hostname.startsWith('talent-consulting-acf16--')));

  if (isLocalhost || isProduction || isFirebaseHost) {
    return origin;
  }

  return DEFAULT_APP_ORIGIN;
}
