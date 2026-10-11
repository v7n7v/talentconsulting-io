'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { TalentConsultingMark } from '@/components/BrandLogo';
import { suiteToolRegistry, type SuiteToolDefinition } from '@/lib/suite-tool-registry';

type CommandCategory = 'action' | 'tool' | 'workspace';

interface SuiteCommand {
  id: string;
  label: string;
  description: string;
  icon: string;
  category: CommandCategory;
  path?: string;
  keywords: string[];
  action?: () => void;
  recommended?: boolean;
}

const categoryLabels: Record<CommandCategory, string> = {
  action: 'Frequent actions',
  tool: 'Suite tools',
  workspace: 'Workspace',
};

const categoryOrder: CommandCategory[] = ['action', 'workspace', 'tool'];

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-rounded ${className}`} aria-hidden="true">{name}</span>;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function openSona(prompt: string, contextLabel: string, context?: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent('assistant:open', {
    detail: {
      prompt,
      contextLabel,
      context: {
        source: 'suite-command-palette',
        approvalRequired: true,
        ...context,
      },
    },
  }));
}

export default function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const showLauncher = pathname !== '/';
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands = useMemo<SuiteCommand[]>(() => {
    const registeredTools = suiteToolRegistry as readonly SuiteToolDefinition[];
    const toolCommands: SuiteCommand[] = registeredTools.map(tool => ({
      id: `tool-${tool.id}`,
      label: tool.title,
      description: tool.mobileDescription || tool.subtitle,
      icon: tool.icon,
      category: tool.id === 'dashboard' ? 'workspace' : 'tool',
      path: tool.mobileHref || tool.path,
      keywords: [
        tool.id,
        tool.title,
        tool.subtitle,
        tool.eyebrow,
        tool.group,
        tool.mobileLabel || '',
        tool.mobileActionLabel || '',
      ],
    }));

    const actionCommands: SuiteCommand[] = [
      {
        id: 'ask-sona-next-action',
        label: 'Ask Taco for next action',
        description: 'Review current context, risks, and what needs approval.',
        icon: 'auto_awesome',
        category: 'action',
        keywords: ['sona', 'coach', 'next', 'help', 'risk', 'approval'],
        recommended: true,
        action: () => openSona(
          'Review my current Talent Studio context and tell me the best next action. Show evidence, risks, and anything that needs my approval.',
          'Next action',
          { currentPath: pathname },
        ),
      },
      {
        id: 'prepare-application-packet',
        label: 'Create application packet',
        description: 'Ask Taco to prepare resume, cover letter, and screening notes for review.',
        icon: 'fact_check',
        category: 'action',
        keywords: ['packet', 'apply', 'application', 'cover letter', 'screening', 'resume', 'review'],
        recommended: true,
        action: () => openSona(
          'Create a review-first application packet from my saved jobs and resume context. Include resume edits, cover letter angle, screening answer notes, missing evidence, and approval checklist. Do not submit anything.',
          'Application packet',
          { artifactTargets: ['resume', 'cover-letter', 'screening-answers', 'approval-checklist'] },
        ),
      },
      {
        id: 'review-agent-queue',
        label: 'Review application queue',
        description: 'Open prepared packets that need a human decision.',
        icon: 'pending_actions',
        category: 'action',
        path: '/suite/agent/queue',
        keywords: ['queue', 'review', 'approval', 'packet', 'prepared'],
      },
      {
        id: 'upload-resume',
        label: 'Upload or check resume',
        description: 'Open Resume Studio in the fastest review path.',
        icon: 'upload_file',
        category: 'action',
        path: '/suite/resume?mobileAction=check',
        keywords: ['upload', 'resume', 'cv', 'check', 'proof'],
      },
      {
        id: 'save-job',
        label: 'Save a job',
        description: 'Open Job Search to capture a role before building a packet.',
        icon: 'bookmark_add',
        category: 'action',
        path: '/suite/job-search?intent=save-job',
        keywords: ['save', 'job', 'role', 'posting', 'opportunity'],
      },
      {
        id: 'due-follow-ups',
        label: 'Review follow-ups',
        description: 'Open applications that need a reply, nudge, or decision.',
        icon: 'forward_to_inbox',
        category: 'action',
        path: '/suite/applications?mobileView=followups',
        keywords: ['follow up', 'email', 'recruiter', 'application', 'due'],
      },
      {
        id: 'start-mock-interview',
        label: 'Start mock interview',
        description: 'Open Interview Studio in quick drill mode.',
        icon: 'interpreter_mode',
        category: 'action',
        path: '/suite/interview-sim?mode=quick_drill',
        keywords: ['interview', 'mock', 'practice', 'drill', 'prep'],
      },
      {
        id: 'billing',
        label: 'Open billing and plan',
        description: 'Review plan, limits, Stripe billing, and upgrade options.',
        icon: 'credit_card',
        category: 'workspace',
        path: '/suite/settings?tab=subscription',
        keywords: ['billing', 'stripe', 'plan', 'subscription', 'upgrade', 'usage'],
      },
    ];

    return [...actionCommands, ...toolCommands];
  }, [pathname]);

  const filteredCommands = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return commands;

    return commands.filter(command => {
      const haystack = [
        command.label,
        command.description,
        command.category,
        ...command.keywords,
      ].map(normalize).join(' ');
      return haystack.includes(needle);
    });
  }, [commands, query]);

  const groupedCommands = useMemo(() => {
    return categoryOrder.reduce<Record<CommandCategory, SuiteCommand[]>>((groups, category) => {
      groups[category] = filteredCommands.filter(command => command.category === category);
      return groups;
    }, { action: [], tool: [], workspace: [] });
  }, [filteredCommands]);

  const selectedCommand = filteredCommands[selectedIndex];

  const closePalette = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const openPalette = useCallback(() => {
    setIsOpen(true);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const executeCommand = useCallback((command?: SuiteCommand) => {
    if (!command) return;
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);

    if (command.action) {
      command.action();
      return;
    }

    if (command.path) router.push(command.path);
  }, [router]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openPalette();
      }
      if (event.key === 'Escape' && isOpen) {
        event.preventDefault();
        closePalette();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closePalette, isOpen, openPalette]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (selectedIndex <= filteredCommands.length - 1) return;
    setSelectedIndex(Math.max(filteredCommands.length - 1, 0));
  }, [filteredCommands.length, selectedIndex]);

  const handlePaletteKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex(index => Math.min(index + 1, Math.max(filteredCommands.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      executeCommand(selectedCommand);
    }
  };

  return (
    <>
      {showLauncher && (
        <button
          type="button"
          onClick={openPalette}
          className="elevation-card fixed bottom-5 left-1/2 z-30 hidden min-h-11 -translate-x-1/2 items-center gap-2 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30 lg:flex"
          aria-label="Open command palette"
        >
          <Icon name="search" className="text-[17px]" />
          <span>Command</span>
          <kbd className="rounded-[7px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--text-muted)]">
            Cmd K
          </kbd>
        </button>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-start justify-center bg-[color-mix(in_srgb,var(--bg-deep)_82%,transparent)] px-3 pt-[12vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          onMouseDown={closePalette}
        >
          <div
            className="elevation-raised w-full max-w-2xl overflow-hidden rounded-[22px] border border-[var(--border-subtle)] bg-[var(--card-bg)]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex min-w-0 items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3">
              <Icon name="search" className="shrink-0 text-[21px] text-[var(--text-muted)]" />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handlePaletteKeyDown}
                placeholder="Search tools or run an action"
                className="min-h-11 min-w-0 flex-1 bg-transparent text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                aria-label="Search commands"
                aria-activedescendant={selectedCommand ? `command-${selectedCommand.id}` : undefined}
              />
              <button
                type="button"
                onClick={closePalette}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
                aria-label="Close command palette"
              >
                <Icon name="close" className="text-[18px]" />
              </button>
            </div>

            <div className="max-h-[58vh] overflow-y-auto p-2">
              {filteredCommands.length === 0 ? (
                <div className="px-4 py-10 text-center" role="status">
                  <Icon name="search_off" className="mx-auto text-[30px] text-[var(--text-muted)]" />
                  <h2 className="mt-3 text-sm font-semibold text-[var(--text-primary)]">No matching command</h2>
                  <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[var(--text-muted)]">
                    Try resume, packet, follow-up, billing, interview, or Taco.
                  </p>
                </div>
              ) : (
                categoryOrder.map((category) => {
                  const categoryCommands = groupedCommands[category];
                  if (categoryCommands.length === 0) return null;

                  return (
                    <section key={category} className="py-1" aria-label={categoryLabels[category]}>
                      <h2 className="px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                        {categoryLabels[category]}
                      </h2>
                      <div className="space-y-1">
                        {categoryCommands.map((command) => {
                          const globalIndex = filteredCommands.findIndex(item => item.id === command.id);
                          const selected = globalIndex === selectedIndex;

                          return (
                            <button
                              key={command.id}
                              id={`command-${command.id}`}
                              type="button"
                              onClick={() => executeCommand(command)}
                              onMouseEnter={() => setSelectedIndex(globalIndex)}
                              className={`flex w-full min-w-0 items-center gap-3 rounded-[14px] border px-3 py-3 text-left transition ${
                                selected
                                  ? 'border-[var(--border)] bg-[var(--bg-hover)]'
                                  : 'border-transparent hover:bg-[var(--bg-elevated)]'
                              }`}
                            >
                              <span className="icon-shell-neutral inline-grid h-10 w-10 shrink-0 place-items-center rounded-[13px] border">
                                <Icon name={command.icon} className="icon-neutral text-[21px]" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex min-w-0 flex-wrap items-center gap-2">
                                  <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
                                    {command.label}
                                  </span>
                                  {command.recommended && (
                                    <span className="rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-muted)]">
                                      Review first
                                    </span>
                                  )}
                                </span>
                                <span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">
                                  {command.description}
                                </span>
                              </span>
                              <Icon
                                name={command.action ? 'bolt' : 'arrow_forward'}
                                className={`shrink-0 text-[17px] ${selected ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'}`}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })
              )}
            </div>

            <div className="flex min-w-0 items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3">
              <div className="hidden min-w-0 items-center gap-2 text-xs text-[var(--text-muted)] sm:flex">
                <TalentConsultingMark className="h-5 w-5 rounded-[7px]" />
                <span className="truncate">Review-first actions. Nothing submits without approval.</span>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-[var(--text-muted)]">
                <span className="hidden sm:inline">Move</span>
                <kbd className="rounded-[7px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5">Up</kbd>
                <kbd className="rounded-[7px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5">Down</kbd>
                <span>Run</span>
                <kbd className="rounded-[7px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5">Enter</kbd>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
