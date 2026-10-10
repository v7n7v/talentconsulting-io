'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import {
  type ApplicationKitContext, type ApplicationKitOutputKey, EMPTY_APPLICATION_KIT_CONTEXT, loadApplicationKitContext,
  saveApplicationKitContext, mergeApplicationKitContext, subscribeApplicationKit,
  captureApplicationKitGuard, applicationKitScope,
} from '@/lib/application-kit';

export function useApplicationKitContext(scope?: string) {
  const ownerId = useStore(state => state.user?.uid || 'guest');
  // Route subscriptions ensure the scope changes when client navigation changes.
  const pathname = usePathname();
  const params = useSearchParams();
  const scopeId = scope || applicationKitScope();
  const lifecycle = useRef(0);
  useEffect(() => { lifecycle.current += 1; return () => { lifecycle.current += 1; }; }, [ownerId, scopeId]);
  const getSnapshot = useCallback(() => loadApplicationKitContext({ ownerId, scopeId }), [ownerId, scopeId, pathname, params]);
  const context = useSyncExternalStore(subscribeApplicationKit, getSnapshot, () => EMPTY_APPLICATION_KIT_CONTEXT);
  const updateContext = useCallback((patch: Partial<ApplicationKitContext>) =>
    mergeApplicationKitContext(patch, { ownerId, scopeId }), [ownerId, scopeId]);
  const replaceContext = useCallback((next: ApplicationKitContext) =>
    saveApplicationKitContext(next, { ownerId, scopeId }), [ownerId, scopeId]);
  const captureGuard = useCallback((outputKey?: ApplicationKitOutputKey) => {
    const generation = lifecycle.current;
    const current = captureApplicationKitGuard({ ownerId, scopeId, outputKey });
    return () => generation === lifecycle.current && current();
  }, [ownerId, scopeId]);
  return { context, updateContext, replaceContext, captureGuard };
}
