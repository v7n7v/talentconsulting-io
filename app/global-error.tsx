'use client';

import { useEffect } from 'react';

const FALLBACK_COLORS = {
  paper: '#fffaf5',
  ink: '#151515',
  muted: '#6e6964',
  line: '#ded7cf',
  soft: '#f2ebe3',
  coral: '#ff5b35',
  shadow: '#c6b6ff',
} as const;

/**
 * Root-level error boundary — catches catastrophic failures
 * that break the entire app (including the root layout).
 *
 * Must include its own <html> and <body> tags because the
 * root layout itself may have errored.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Global Error Boundary]', error);
  }, [error]);

  const handleRetry = () => {
    reset();
    window.location.reload();
  };

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: FALLBACK_COLORS.paper,
          fontFamily:
            'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: FALLBACK_COLORS.ink,
        }}
      >
        <div style={{ textAlign: 'center', padding: '2rem', maxWidth: '480px' }}>
          {/* Icon */}
          <div
            style={{
              width: 72,
              height: 72,
              margin: '0 auto 24px',
              borderRadius: 16,
              background: FALLBACK_COLORS.soft,
              border: `1px solid ${FALLBACK_COLORS.coral}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={FALLBACK_COLORS.coral} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              marginBottom: 8,
              color: FALLBACK_COLORS.ink,
            }}
          >
            Something went wrong
          </h1>

          <p
            style={{
              fontSize: '0.875rem',
              color: FALLBACK_COLORS.muted,
              lineHeight: 1.6,
              marginBottom: 32,
            }}
          >
            An unexpected error occurred. This has been logged for review.
            {error.digest && (
              <span style={{ display: 'block', marginTop: 8, fontSize: '0.75rem', color: FALLBACK_COLORS.muted }}>
                Error ID: {error.digest}
              </span>
            )}
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              onClick={handleRetry}
              style={{
                padding: '12px 24px',
                borderRadius: 12,
                border: 'none',
                background: FALLBACK_COLORS.coral,
                color: FALLBACK_COLORS.ink,
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'scale(1.03)';
                e.currentTarget.style.boxShadow = `0 4px 20px ${FALLBACK_COLORS.shadow}80`;
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              Try Again
            </button>

            <a
              href="/"
              style={{
                padding: '12px 24px',
                borderRadius: 12,
                border: `1px solid ${FALLBACK_COLORS.line}`,
                background: FALLBACK_COLORS.soft,
                color: FALLBACK_COLORS.muted,
                fontWeight: 500,
                fontSize: '0.875rem',
                textDecoration: 'none',
                cursor: 'pointer',
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = FALLBACK_COLORS.coral;
                e.currentTarget.style.color = FALLBACK_COLORS.ink;
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = FALLBACK_COLORS.line;
                e.currentTarget.style.color = FALLBACK_COLORS.muted;
              }}
            >
              Go Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
