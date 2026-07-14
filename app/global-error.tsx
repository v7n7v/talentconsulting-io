'use client';

import { useEffect } from 'react';

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
          background: '#0b0b0b',
          fontFamily:
            'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: '#e3e3e3',
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
              background: 'rgba(242, 139, 130, 0.12)',
              border: '1px solid rgba(242, 139, 130, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f28b82" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
              color: '#e3e3e3',
            }}
          >
            Something went wrong
          </h1>

          <p
            style={{
              fontSize: '0.875rem',
              color: '#8e918f',
              lineHeight: 1.6,
              marginBottom: 32,
            }}
          >
            An unexpected error occurred. This has been logged for review.
            {error.digest && (
              <span style={{ display: 'block', marginTop: 8, fontSize: '0.75rem', color: '#5f6368' }}>
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
                background: 'linear-gradient(135deg, #a8c7fa, #7cacf8)',
                color: '#0b0b0b',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'scale(1.03)';
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(168, 199, 250, 0.3)';
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
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.05)',
                color: '#8e918f',
                fontWeight: 500,
                fontSize: '0.875rem',
                textDecoration: 'none',
                cursor: 'pointer',
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                e.currentTarget.style.color = '#e3e3e3';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                e.currentTarget.style.color = '#8e918f';
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
