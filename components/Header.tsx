'use client';

import { authHelpers } from '@/lib/firebase';
import { useStore } from '@/lib/store';
import { TacoMark, TacoWordmark } from '@/components/BrandLogo';

interface HeaderProps {
  onShowLogin: () => void;
  onShowSignup: () => void;
}

export default function Header({ onShowLogin, onShowSignup }: HeaderProps) {
  const { user, setUser } = useStore();

  const handleLogout = async () => {
    if (confirm('Are you sure you want to logout?')) {
      await authHelpers.signOut();
      setUser(null);
    }
  };

  return (
    <header className="bg-[var(--bg-surface)] sticky top-0 z-50 border-b border-[var(--border-subtle)]">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TacoMark className="h-10 w-10 rounded-xl border border-[var(--border-subtle)]" />
          <div>
            <TacoWordmark className="w-56" />
            <p className="text-xs text-[var(--text-muted)]">Interview Intelligence Platform</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--card-bg)] border border-[var(--border-subtle)] text-xs">
            <div className={`w-2 h-2 rounded-full ${user ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--danger)]'}`}></div>
            <span className={user ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}>
              {user ? 'Connected' : 'Not Connected'}
            </span>
          </div>

          {user ? (
            <div className="flex items-center gap-3">
              <div className="text-sm text-[var(--text-secondary)]">
                <span className="text-[var(--text-primary)]">{user.email}</span>
              </div>
              <button
                onClick={handleLogout}
                className="btn-secondary inline-flex min-h-[44px] items-center justify-center px-3 py-2 rounded-lg text-xs font-medium"
              >
                🚪 Logout
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={onShowLogin}
                className="btn-secondary inline-flex min-h-[44px] items-center justify-center px-4 py-2 rounded-lg text-sm font-medium"
              >
                🔐 Login
              </button>
              <button
                onClick={onShowSignup}
                className="btn-primary inline-flex min-h-[44px] items-center justify-center px-4 py-2 rounded-lg text-sm font-medium"
              >
                <span className="material-symbols-rounded align-middle mr-1">auto_awesome</span> Sign Up
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
