'use client';

import { useEffect, useState } from 'react';
import { AssistantMarkMotion, type AssistantMarkMotionSize, type AssistantMarkMotionState } from '@/components/assistant';
import { SuiteToolShell } from '@/components/suite/SuiteToolChrome';
import { useMicrophoneActivity } from './useMicrophoneActivity';

const states: Array<{ id: Exclude<AssistantMarkMotionState, 'responding'>; label: string }> = [
  { id: 'idle', label: 'Idle' },
  { id: 'listening', label: 'Listening' },
  { id: 'thinking', label: 'Thinking' },
  { id: 'speaking', label: 'Speaking' },
  { id: 'success', label: 'Success' },
  { id: 'error', label: 'Error' },
  { id: 'locked', label: 'Locked' },
];

const sizes: Array<{ id: AssistantMarkMotionSize; label: string; pixels: number }> = [
  { id: 'xs', label: 'XS', pixels: 28 },
  { id: 'sm', label: 'SM', pixels: 40 },
  { id: 'md', label: 'MD', pixels: 56 },
  { id: 'lg', label: 'LG', pixels: 96 },
];

const stressMarks = Array.from({ length: 24 }, (_, index) => ({
  id: `stress-${index}`,
  state: states[index % states.length].id,
  activity: (index % 5) / 4,
}));

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={onChange} className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
      <span className={`relative h-6 w-11 rounded-full border transition-colors ${checked ? 'border-[var(--accent)] bg-[var(--accent-dim)]' : 'border-[var(--border)] bg-[var(--bg-hover)]'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full transition-transform ${checked ? 'translate-x-5 bg-[var(--accent)]' : 'translate-x-0.5 bg-[var(--text-muted)]'}`} />
      </span>
      {label}
    </button>
  );
}

function PreviewStage({ surface, label, state, activity }: { surface: string; label: string; state: Exclude<AssistantMarkMotionState, 'responding'>; activity: number }) {
  return (
    <figure className={`grid min-h-[320px] place-items-center border border-[var(--border-subtle)] p-8 ${surface}`}>
      <AssistantMarkMotion size="lg" state={state} activity={activity} title={`Taco ${state} preview on ${label}`} />
      <figcaption className="self-end text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</figcaption>
    </figure>
  );
}

function StateMatrix({ activity }: { activity: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
      {states.map(item => (
        <div key={item.id} className="grid min-h-[132px] place-items-center rounded-[8px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
          <AssistantMarkMotion size="md" state={item.id} activity={activity} title={`Taco ${item.label}`} />
          <span className="self-end text-[11px] font-semibold text-[var(--text-secondary)]">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function TacoMotionLab() {
  const [selectedState, setSelectedState] = useState<Exclude<AssistantMarkMotionState, 'responding'>>('idle');
  const [activity, setActivity] = useState(0.46);
  const [autoCycle, setAutoCycle] = useState(false);
  const microphone = useMicrophoneActivity();
  const previewState = microphone.active ? 'listening' : selectedState;
  const previewActivity = microphone.active ? microphone.level : activity;

  useEffect(() => {
    if (!autoCycle || microphone.active) return;
    const timer = window.setInterval(() => {
      setSelectedState(current => {
        const index = states.findIndex(item => item.id === current);
        return states[(index + 1) % states.length].id;
      });
    }, 2200);
    return () => window.clearInterval(timer);
  }, [autoCycle, microphone.active]);

  const handleMicrophone = async () => {
    if (!microphone.active) setAutoCycle(false);
    await microphone.toggle();
  };

  return (
    <SuiteToolShell variant="workbench" className="!pt-16 lg:!pt-6" contentClassName="gap-6">
      <header className="border-b border-[var(--border-subtle)] pb-5 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">Taco identity</p>
            <h1 className="mt-1 text-2xl font-bold text-[var(--text-primary)]">Motion lab</h1>
          </div>
          <span className="rounded-full border border-[var(--accent)] bg-[var(--accent-dim)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">Review candidate</span>
        </div>
      </header>

      <section className="grid min-w-0 gap-4 border-b border-[var(--border-subtle)] pb-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <div className="min-w-0">
          <p className="mb-2 text-[11px] font-semibold text-[var(--text-muted)]">State</p>
          <div className="grid max-w-full grid-cols-4 gap-1 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1 sm:flex sm:overflow-x-auto" role="group" aria-label="Taco state">
            {states.map(item => (
              <button
                key={item.id}
                type="button"
                aria-pressed={selectedState === item.id && !microphone.active}
                onClick={() => { setSelectedState(item.id); setAutoCycle(false); }}
                className={`min-h-11 min-w-0 rounded-[5px] px-1.5 text-[11px] font-semibold transition-colors sm:shrink-0 sm:px-3 sm:text-xs ${selectedState === item.id && !microphone.active ? 'border border-[var(--border)] bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(190px,1fr)_auto_auto] sm:items-end">
          <label className="block min-w-0">
            <span className="mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold text-[var(--text-muted)]">
              Activity
              <span className="tabular-nums text-[var(--text-secondary)]">{Math.round(previewActivity * 100)}%</span>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(activity * 100)}
              disabled={microphone.active}
              onChange={event => setActivity(Number(event.target.value) / 100)}
              className="box-content h-2 w-full cursor-pointer py-[18px] accent-[var(--accent)] disabled:opacity-45"
              aria-label="Taco activity level"
            />
          </label>
          <Toggle checked={autoCycle} onChange={() => setAutoCycle(value => !value)} label="Auto cycle" />
          <button
            type="button"
            onClick={handleMicrophone}
            className={`inline-flex h-11 items-center gap-2 rounded-[6px] border px-3 text-xs font-semibold transition-colors ${microphone.active ? 'border-transparent bg-[var(--success)] text-[var(--accent-on)]' : 'border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
            aria-pressed={microphone.active}
          >
            <span className="material-symbols-rounded text-[17px]">{microphone.active ? 'mic' : 'mic_none'}</span>
            {microphone.active ? 'Listening live' : 'Microphone'}
          </button>
        </div>
        {microphone.error && <p className="text-xs text-[var(--danger)]" role="status">{microphone.error}</p>}
      </section>

      <section aria-labelledby="primary-preview-title">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="primary-preview-title" className="text-sm font-semibold text-[var(--text-primary)]">Primary preview</h2>
          <span className="text-xs capitalize text-[var(--text-muted)]">{previewState}</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <PreviewStage surface="bg-[var(--bg-deep)]" label="App surface" state={previewState} activity={previewActivity} />
          <PreviewStage surface="bg-[var(--paper)]" label="Paper" state={previewState} activity={previewActivity} />
        </div>
      </section>

      <section aria-labelledby="state-system-title">
        <h2 id="state-system-title" className="mb-3 text-sm font-semibold text-[var(--text-primary)]">State system</h2>
        <StateMatrix activity={activity} />
      </section>

      <section aria-labelledby="size-system-title" className="border-t border-[var(--border-subtle)] pt-6">
        <h2 id="size-system-title" className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Size system</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {sizes.map(item => (
            <div key={item.id} className="grid min-h-[150px] place-items-center rounded-[8px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
              <AssistantMarkMotion size={item.id} state={previewState} activity={previewActivity} title={`Taco ${item.label} size`} />
              <span className="self-end text-[11px] font-semibold text-[var(--text-secondary)]">{item.label} · {item.pixels}px</span>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="stress-title" className="border-t border-[var(--border-subtle)] pt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="stress-title" className="text-sm font-semibold text-[var(--text-primary)]">Multi-instance stress</h2>
          <span className="text-xs tabular-nums text-[var(--text-muted)]">24 × 28px</span>
        </div>
        <div className="grid grid-cols-6 place-items-center gap-4 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5 sm:grid-cols-8 md:grid-cols-12">
          {stressMarks.map(mark => <AssistantMarkMotion key={mark.id} size="xs" state={mark.state} activity={mark.activity} />)}
        </div>
      </section>
    </SuiteToolShell>
  );
}
