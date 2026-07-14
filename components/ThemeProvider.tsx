'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

type ThemeMode = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  theme: ResolvedTheme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  mode: 'system',
  setMode: () => {},
  toggleTheme: () => {},
});

const STORAGE_KEY = 'talent-studio-theme';

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'dark';
  }
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') return getSystemTheme();
  return mode;
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.classList.remove('light', 'dark');
  root.classList.add(resolved);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [theme, setTheme] = useState<ResolvedTheme>('dark');
  const [mounted, setMounted] = useState(false);

  // Initialize from localStorage
  useEffect(() => {
    let stored: ThemeMode | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    } catch {
      stored = null;
    }
    const initial = stored && ['light', 'dark', 'system'].includes(stored) ? stored : 'system';
    setModeState(initial);
    const resolved = resolveTheme(initial);
    setTheme(resolved);
    applyTheme(resolved);
    setMounted(true);
  }, []);

  // Listen for system theme changes when mode is 'system'
  useEffect(() => {
    if (mode !== 'system') return;

    let mql: MediaQueryList;
    try {
      mql = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const handler = (e: MediaQueryListEvent) => {
      const resolved = e.matches ? 'dark' : 'light';
      setTheme(resolved);
      applyTheme(resolved);
    };

    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [mode]);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    try {
      window.localStorage.setItem(STORAGE_KEY, newMode);
    } catch {
      // Theme changes still apply for this session if storage is unavailable.
    }
    const resolved = resolveTheme(newMode);
    setTheme(resolved);
    applyTheme(resolved);
  }, []);

  const toggleTheme = useCallback(() => {
    setMode(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setMode]);

  // Prevent FOUC — render children only after mount
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
