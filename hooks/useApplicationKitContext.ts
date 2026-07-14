'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  type ApplicationKitContext,
  EMPTY_APPLICATION_KIT_CONTEXT,
  loadApplicationKitContext,
  saveApplicationKitContext,
} from '@/lib/application-kit';

export function useApplicationKitContext() {
  const [context, setContext] = useState<ApplicationKitContext>({ ...EMPTY_APPLICATION_KIT_CONTEXT });

  useEffect(() => {
    setContext(loadApplicationKitContext());
  }, []);

  const updateContext = useCallback((patch: Partial<ApplicationKitContext>) => {
    setContext(prev => {
      const next = saveApplicationKitContext({ ...prev, ...patch });
      return next;
    });
  }, []);

  const replaceContext = useCallback((nextContext: ApplicationKitContext) => {
    setContext(saveApplicationKitContext(nextContext));
  }, []);

  return { context, updateContext, replaceContext };
}
