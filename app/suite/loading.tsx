/**
 * Suite loading skeleton — instant visual feedback during
 * route transitions between tool pages. Matches the Forge
 * design language with subtle pulse animations.
 */
export default function SuiteLoading() {
  return (
    <div className="flex-1 p-8 animate-pulse" style={{ minHeight: '100dvh' }}>
      {/* Header skeleton */}
      <div className="mb-8">
        <div
          className="h-8 w-64 rounded-lg mb-3"
          style={{ background: 'var(--bg-elevated)' }}
        />
        <div
          className="h-4 w-96 rounded-md"
          style={{ background: 'var(--bg-hover)' }}
        />
      </div>

      {/* Stats row skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-28 rounded-2xl"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
            }}
          />
        ))}
      </div>

      {/* Main content skeleton */}
      <div
        className="rounded-2xl p-6 mb-6"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div
          className="h-5 w-48 rounded-md mb-4"
          style={{ background: 'var(--bg-hover)' }}
        />
        <div className="space-y-3">
          <div className="h-4 w-full rounded-md" style={{ background: 'var(--bg-hover)' }} />
          <div className="h-4 w-5/6 rounded-md" style={{ background: 'var(--bg-hover)' }} />
          <div className="h-4 w-4/6 rounded-md" style={{ background: 'var(--bg-hover)' }} />
        </div>
      </div>

      {/* Secondary content skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-40 rounded-2xl"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
            }}
          />
        ))}
      </div>
    </div>
  );
}
