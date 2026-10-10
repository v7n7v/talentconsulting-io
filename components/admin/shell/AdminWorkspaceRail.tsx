'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  TacoMark,
  TacoWordmark,
} from '@/components/BrandLogo';
import { useTheme } from '@/components/ThemeProvider';

const WORKSPACE_LINKS = [
  { href: '/suite', icon: 'space_dashboard', label: 'Workspace', description: 'Career command center' },
  { href: '/suite/agent', icon: 'auto_awesome', label: 'Ask Taco', description: 'Career copilot' },
  { href: '/suite/resume', icon: 'description', label: 'Resume Studio', description: 'Build and verify' },
  { href: '/suite/job-search', icon: 'radar', label: 'Job Search', description: 'Rank better roles' },
  { href: '/suite/applications', icon: 'work', label: 'Applications', description: 'Manage the pipeline' },
  { href: '/suite/interview-sim', icon: 'interpreter_mode', label: 'Interview Studio', description: 'Practice and debrief' },
  { href: '/suite/intelligence', icon: 'neurology', label: 'Career Intelligence', description: 'Signals and growth' },
] as const;

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function RailLink({
  href,
  icon,
  label,
  description,
  active = false,
  onNavigate,
}: {
  href: string;
  icon: string;
  label: string;
  description: string;
  active?: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`admin-workspace-rail-link${active ? ' is-active' : ''}`}
    >
      <span className="material-symbols-rounded" aria-hidden="true">{icon}</span>
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      {active ? <i aria-hidden="true" /> : null}
    </Link>
  );
}

export function AdminWorkspaceRail() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [mobile, setMobile] = useState(false);
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)');
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--suite-sidebar-content-offset',
      mobile ? '0px' : '228px',
    );
    return () => {
      document.documentElement.style.removeProperty('--suite-sidebar-content-offset');
    };
  }, [mobile]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobile || !open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const drawer = drawerRef.current;
    const focusable = () => Array.from(
      drawer?.querySelectorAll<HTMLElement>(FOCUSABLE) || [],
    ).filter(element => element.offsetParent !== null);
    window.setTimeout(() => focusable()[0]?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        window.setTimeout(() => openerRef.current?.focus(), 0);
        return;
      }
      if (event.key !== 'Tab') return;
      const targets = focusable();
      if (!targets.length) return;
      event.preventDefault();
      const current = targets.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey
        ? current <= 0 ? targets.length - 1 : current - 1
        : current < 0 || current === targets.length - 1 ? 0 : current + 1;
      targets[next]?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mobile, open]);

  const close = () => {
    setOpen(false);
    if (mobile) window.setTimeout(() => openerRef.current?.focus(), 0);
  };

  return (
    <>
      {mobile && !open ? (
        <button
          ref={openerRef}
          type="button"
          className="admin-workspace-rail-opener"
          onClick={() => setOpen(true)}
          aria-label="Open workspace navigation"
          aria-expanded={false}
          aria-controls="admin-workspace-rail"
        >
          <span className="material-symbols-rounded" aria-hidden="true">menu</span>
        </button>
      ) : null}
      {mobile && open ? (
        <button
          type="button"
          className="admin-workspace-rail-backdrop"
          onClick={close}
          aria-label="Close workspace navigation"
        />
      ) : null}
      <aside
        ref={drawerRef}
        id="admin-workspace-rail"
        className={`admin-workspace-rail${mobile && open ? ' is-open' : ''}`}
        role={mobile && open ? 'dialog' : undefined}
        aria-modal={mobile && open ? true : undefined}
        aria-label="Admin workspace navigation"
        aria-hidden={mobile && !open ? true : undefined}
        inert={mobile && !open ? true : undefined}
      >
        <header className="admin-workspace-rail-brand">
          <TacoMark className="h-8 w-8 rounded-[10px]" />
          <span>
            <TacoWordmark
              className="w-[132px]"
              light={theme === 'dark'}
            />
            <small>Admin command</small>
          </span>
          {mobile ? (
            <button type="button" onClick={close} aria-label="Close workspace navigation">
              <span className="material-symbols-rounded" aria-hidden="true">close</span>
            </button>
          ) : null}
        </header>

        <nav aria-label="Workspace tools">
          <RailLink
            href="/suite/admin"
            icon="admin_panel_settings"
            label="Talent Admin"
            description="Command Grid"
            active
            onNavigate={close}
          />
          <p className="admin-workspace-rail-section">Workspace</p>
          {WORKSPACE_LINKS.map(item => (
            <RailLink
              key={item.href}
              {...item}
              onNavigate={close}
            />
          ))}
        </nav>

        <footer>
          <button
            type="button"
            className="admin-workspace-rail-link"
            onClick={toggleTheme}
            aria-pressed={theme === 'light'}
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              {theme === 'dark' ? 'light_mode' : 'dark_mode'}
            </span>
            <span>
              <strong>Appearance</strong>
              <small>{theme === 'dark' ? 'Dark' : 'Light'} mode</small>
            </span>
          </button>
          <RailLink
            href="/suite/settings"
            icon="settings"
            label="Settings"
            description="Account and preferences"
            onNavigate={close}
          />
        </footer>
      </aside>
    </>
  );
}
