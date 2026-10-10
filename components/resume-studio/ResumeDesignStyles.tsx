'use client';

import { useEffect, useState } from 'react';
import type { CanonicalResume } from '@/lib/resume-normalizer';
import type { ResumeDesignConfig } from '@/lib/resume-design/types';
import {
  addResumeDesignStyle,
  applyResumeDesignStyle,
  createResumeDesignStyle,
  getResumeDesignStylesStorageKey,
  MAX_RESUME_DESIGN_STYLES,
  MAX_RESUME_DESIGN_STYLE_NAME,
  readResumeDesignStyles,
  serializeResumeDesignStyles,
  type ResumeDesignStyle,
} from '@/lib/resume-design/styles';

export interface ResumeDesignStylesProps {
  ownerId: string | null;
  resume: CanonicalResume;
  value: ResumeDesignConfig;
  onChange: (next: ResumeDesignConfig) => void;
}

export function ResumeDesignStyles({ ownerId, resume: _resume, value, onChange }: ResumeDesignStylesProps) {
  const storageKey = getResumeDesignStylesStorageKey(ownerId);
  const [loadedScope, setLoadedScope] = useState('');
  const [styles, setStyles] = useState<ResumeDesignStyle[]>([]);
  const [name, setName] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [replaceAvailable, setReplaceAvailable] = useState(false);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const session = ownerId === null;

  useEffect(() => {
    let raw: string | null;
    try {
      const storage = session ? window.sessionStorage : window.localStorage;
      raw = storage.getItem(storageKey);
      const result = readResumeDesignStyles(raw);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStyles(result.record.styles);
      setLoadError(result.error || '');
    } catch {
      setStyles([]);
      setLoadError('Saved styles are unavailable in this browser. You can retry or continue without them.');
    }
    setLoadedScope(storageKey);
  // Storage is an external browser system. The owner scope is also checked before rendering any loaded values.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, retry]);

  const persist = (next: ResumeDesignStyle[]) => {
    try {
      const storage = session ? window.sessionStorage : window.localStorage;
      storage.setItem(storageKey, serializeResumeDesignStyles(next));
      setStyles(next);
      setMessage('Saved.');
      setLoadError('');
      return true;
    } catch {
      setMessage('');
      setLoadError('The browser could not save this style. Your current design is still available; retry after checking browser storage settings.');
      return false;
    }
  };

  if (loadedScope !== storageKey) return <section className="border-y border-[var(--border-subtle)] px-4 py-4" aria-label="Saved design styles"><p role="status" className="text-xs text-[var(--text-secondary)]">Loading saved styles…</p></section>;

  const save = (replace = false) => {
    const cleanName = name.trim().slice(0, MAX_RESUME_DESIGN_STYLE_NAME);
    if (!cleanName) { setMessage('Enter a name before saving.'); return; }
    const candidate = createResumeDesignStyle(cleanName, value);
    const result = addResumeDesignStyle(styles, candidate, replace);
    if (result.status === 'duplicate') { setSelectedId(styles.find(style => style.name.toLowerCase() === cleanName.toLowerCase())?.id || ''); setReplaceAvailable(true); setMessage(`“${cleanName}” already exists. Replace it only if you want to overwrite that saved style.`); return; }
    if (result.status === 'limit') { setMessage(`You can save up to ${MAX_RESUME_DESIGN_STYLES} styles. Delete one to make room.`); return; }
    if (persist(result.styles)) {
      const saved = result.styles.find(style => style.name.toLowerCase() === cleanName.toLowerCase());
      setSelectedId(saved?.id || '');
      setName('');
      setReplaceAvailable(false);
      setMessage(result.status === 'replaced' ? `Replaced “${cleanName}”.` : `Saved “${cleanName}”.`);
    }
  };

  const clearInvalid = () => {
    if (persist([])) { setLoadError(''); setMessage('Saved list cleared.'); }
  };
  const selected = styles.find(style => style.id === selectedId);

  return <section className="border-y border-[var(--border-subtle)] px-4 py-4" aria-labelledby="resume-design-styles-title">
    <div className="mb-3 flex items-start justify-between gap-3"><div><p className="m-0 text-[11px] font-extrabold tracking-[.14em] text-[var(--accent)]">PERSONAL STYLES</p><h3 id="resume-design-styles-title" className="mb-1 mt-1 text-base font-extrabold text-[var(--text-primary)]">Save this look</h3><p className="m-0 text-[11px] leading-relaxed text-[var(--text-secondary)]">{session ? 'Saved for this session on this device. It clears when the session ends.' : 'Saved on this device for your signed-in account only.'}</p></div><span className="shrink-0 border border-[var(--border-subtle)] px-2 py-1 text-[11px] font-bold">{styles.length}/{MAX_RESUME_DESIGN_STYLES}</span></div>
    {loadError && <div className="mb-3 border border-[var(--accent)] bg-[var(--accent-dim)] p-3 text-xs text-[var(--text-primary)]" role="alert"><p>{loadError}</p><div className="flex flex-wrap gap-2"><button type="button" className="min-h-9 border border-current px-2 font-bold" onClick={() => setRetry(value => value + 1)}>Retry</button><button type="button" className="min-h-9 border border-current px-2 font-bold" onClick={clearInvalid}>Clear saved list</button></div></div>}
    <label className="grid gap-1 text-[11px] font-bold text-[var(--text-secondary)]">Style name<input className="min-h-10 w-full border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 text-sm text-[var(--text-primary)]" type="text" maxLength={MAX_RESUME_DESIGN_STYLE_NAME} value={name} onChange={event => { setName(event.target.value); setMessage(''); setReplaceAvailable(false); }} placeholder="e.g. Clear editorial" /></label>
    <button className="mt-2 min-h-10 border border-[var(--taco-action)] bg-[var(--taco-action)] px-3 text-xs font-bold text-[var(--taco-action-ink)] disabled:opacity-50" type="button" onClick={() => save()} disabled={!name.trim() || Boolean(loadError)}>Save current design</button>
    {replaceAvailable && <button className="ml-2 mt-2 min-h-10 border border-[var(--accent)] bg-[var(--accent-dim)] px-3 text-xs font-bold text-[var(--text-primary)]" type="button" onClick={() => save(true)}>Replace existing style</button>}
    {styles.length > 0 && <div className="mt-4 grid gap-2"><label className="grid gap-1 text-[11px] font-bold text-[var(--text-secondary)]">Saved styles<select className="min-h-10 w-full border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 text-sm text-[var(--text-primary)]" value={selectedId} onChange={event => { setSelectedId(event.target.value); setMessage(''); }}><option value="">Choose a style</option>{styles.map(style => <option key={style.id} value={style.id}>{style.name}</option>)}</select></label><div className="flex flex-wrap gap-2"><button className="min-h-10 border border-[var(--taco-action)] bg-[var(--taco-action)] px-3 text-xs font-bold text-[var(--taco-action-ink)] disabled:opacity-50" type="button" disabled={!selected} onClick={() => { if (selected) { onChange(applyResumeDesignStyle(value, selected)); setMessage(`Applied “${selected.name}”.`); } }}>Apply</button><button className="min-h-10 border border-[var(--border-subtle)] px-3 text-xs font-bold disabled:opacity-50" type="button" disabled={!selected} onClick={() => { if (selected && persist(styles.filter(style => style.id !== selected.id))) { setSelectedId(''); setMessage(`Deleted “${selected.name}”.`); } }}>Delete</button></div></div>}
    {message && <p className="mb-0 mt-3 text-xs text-[var(--text-secondary)]" role="status">{message}</p>}
  </section>;
}

export default ResumeDesignStyles;
