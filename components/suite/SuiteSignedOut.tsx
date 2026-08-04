'use client';

import { useState } from 'react';
import AuthModal from '@/components/modals/AuthModal';
import { SuiteEmptyState } from '@/components/suite/SuiteToolChrome';

/**
 * The signed-out state for a suite route whose whole content is personal.
 *
 * Four pages need it and none of them redirect: app/suite/layout.tsx wraps
 * every route in WorkspaceFrame, which renders children for a signed-out
 * visitor rather than sending them anywhere. Each one used to answer that
 * visitor with a skeleton that never resolved — a `loading` flag initialised
 * `true` and an effect that early-returned on `!user` without clearing it —
 * and simply clearing the flag would have swapped the skeleton for an empty
 * state claiming they had no applications, no debriefs, no pulse. Both are
 * wrong about the same thing: not signed in is not a measurement.
 *
 * It lives in its own file rather than in SuiteToolChrome because AuthModal
 * pulls in firebase, analytics and attribution, and SuiteToolChrome is
 * imported by nearly every suite page.
 */
export default function SuiteSignedOut({
  title,
  description,
  className,
}: {
  title: string;
  description: string;
  className?: string;
}) {
  const [mode, setMode] = useState<'login' | 'signup' | null>(null);

  return (
    <>
      <SuiteEmptyState
        icon="lock"
        title={title}
        description={description}
        className={className}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => setMode('signup')}
              className="btn-primary inline-flex min-h-11 min-w-0 items-center justify-center"
            >
              Create free account
            </button>
            <button
              type="button"
              onClick={() => setMode('login')}
              className="btn-secondary inline-flex min-h-11 min-w-0 items-center justify-center"
            >
              Sign in
            </button>
          </div>
        }
      />
      {mode && (
        <AuthModal
          mode={mode}
          onClose={() => setMode(null)}
          onSwitchMode={() => setMode(mode === 'login' ? 'signup' : 'login')}
        />
      )}
    </>
  );
}
