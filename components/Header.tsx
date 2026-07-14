'use client';

import { authHelpers } from '@/lib/firebase';
import { useStore } from '@/lib/store';
import { TalentConsultingMark, TalentConsultingWordmark } from '@/components/BrandLogo';

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
    <header className="glass sticky top-0 z-50 border-b border-cyan-500/10">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TalentConsultingMark className="h-10 w-10 rounded-xl border border-cyan-500/15 shadow-[0_0_24px_rgba(6,182,212,0.22)]" />
          <div>
            <TalentConsultingWordmark className="w-56" />
            <p className="text-xs text-slate-400">Interview Intelligence Platform</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs">
            <div className={`w-2 h-2 rounded-full ${user ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className={user ? 'text-green-400' : 'text-slate-400'}>
              {user ? 'Connected' : 'Not Connected'}
            </span>
          </div>

          {user ? (
            <div className="flex items-center gap-3">
              <div className="text-sm text-slate-300">
                <span className="text-cyan-400">{user.email}</span>
              </div>
              <button
                onClick={handleLogout}
                className="btn-secondary px-3 py-2 rounded-lg text-xs font-medium"
              >
                🚪 Logout
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={onShowLogin}
                className="btn-secondary px-4 py-2 rounded-lg text-sm font-medium"
              >
                🔐 Login
              </button>
              <button
                onClick={onShowSignup}
                className="btn-primary px-4 py-2 rounded-lg text-sm font-medium"
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
