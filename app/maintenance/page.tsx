import type { Metadata } from 'next';
import { TacoMark } from '@/components/BrandLogo';

export const metadata: Metadata = {
  title: 'Under Maintenance — Talent Studio',
  description: 'Talent Studio is undergoing scheduled maintenance. We will be back shortly.',
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  const items = [
    'Streamlining the one-click apply pipeline',
    'Improving resume morph accuracy',
    'Fixing Weekly Picks matching',
    'Performance and stability upgrades',
  ];

  return (
    <div
      style={{
        minHeight: '100dvh',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        background: 'var(--bg-deep)',
        color: 'var(--text-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Background orbs */}
      <div style={{
        position: 'absolute', top: '-20%', right: '-10%',
        width: '50vw', height: '50vw', borderRadius: '50%',
        background: 'radial-gradient(circle, color-mix(in srgb, var(--accent-active) 10%, transparent) 0%, transparent 70%)',
        filter: 'blur(80px)', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '-20%', left: '-10%',
        width: '40vw', height: '40vw', borderRadius: '50%',
        background: 'radial-gradient(circle, color-mix(in srgb, var(--accent) 7%, transparent) 0%, transparent 70%)',
        filter: 'blur(80px)', pointerEvents: 'none',
      }} />

      <div style={{
        position: 'relative', zIndex: 10,
        textAlign: 'center', maxWidth: 520, padding: '0 24px',
      }}>
        <TacoMark
          className="mx-auto mb-8 h-20 w-20 rounded-[20px]"
          style={{
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--elevation-card)',
          }}
        />

        {/* Title */}
        <h1 style={{
          fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em',
          margin: '0 0 12px', lineHeight: 1.2,
          color: 'var(--accent)',
        }}>
          Under Maintenance
        </h1>

        <p style={{
          fontSize: 16, lineHeight: 1.6, color: 'var(--text-secondary)',
          margin: '0 0 32px', fontWeight: 400,
        }}>
          We&apos;re refining Talent Studio to bring you a better experience. 
          This won&apos;t take long — we&apos;ll be back with improvements shortly.
        </p>

        {/* Status card */}
        <div style={{
          padding: '20px 24px', borderRadius: 16, textAlign: 'left',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          marginBottom: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>What we&apos;re working on</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((item) => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Contact info */}
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          Questions? Reach us at{' '}
          <a href="mailto:support@talentconsulting.io" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            support@talentconsulting.io
          </a>
        </p>
      </div>
    </div>
  );
}
