'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { authFetch } from '@/lib/auth-fetch';
import { useStore } from '@/lib/store';

/** Rendering and completion both bind to the authenticated owner. */
export function useOwnedResource<T>(url: string, validate?: (value: unknown) => boolean) {
  const owner = useStore(state => state.user?.uid || null);
  const serial = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ owner: string | null; data: T | null; loading: boolean; error: string | null }>({ owner, data: null, loading: !!owner, error: null });
  const reload = useCallback(async () => {
    const ticket = ++serial.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    if (!owner) { setState({ owner, data: null, loading: false, error: null }); return; }
    const current = () => ticket === serial.current && owner === useStore.getState().user?.uid && !abort.signal.aborted;
    setState(previous => ({ owner, data: previous.owner === owner ? previous.data : null, loading: true, error: null }));
    try {
      const response = await authFetch(url, { signal: abort.signal });
      if (!response.ok) throw new Error('This information could not be loaded. Please try again.');
      const data = await response.json() as T;
      if (validate && !validate(data)) throw new Error('The server returned incomplete information. Please retry.');
      if (current()) setState({ owner, data, loading: false, error: null });
    } catch (error) {
      if (current()) setState(previous => ({ owner, data: previous.owner === owner ? previous.data : null, loading: false,
        error: error instanceof Error ? error.message : 'Could not load this information.' }));
    }
  }, [owner, url, validate]);
  useEffect(() => {
    void reload();
    return () => { serial.current += 1; controller.current?.abort(); };
  }, [reload]);
  return state.owner === owner ? { ...state, reload } : { owner, data: null, loading: !!owner, error: null, reload };
}
