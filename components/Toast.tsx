'use client';

import { useEffect, useState } from 'react';

interface ToastMessage {
  message: string;
  icon: string;
  id: number;
}

let toastId = 0;
const toastListeners = new Set<(toast: ToastMessage) => void>();

export function showToast(message: string, icon: string = 'check_circle') {
  const toast: ToastMessage = { message, icon, id: toastId++ };
  toastListeners.forEach((listener) => listener(toast));
}

// Material icon names are lowercase alphanumeric with underscores
const isMaterialIcon = (str: string) => /^[a-z][a-z0-9_]*$/.test(str);

export default function Toast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const listener = (toast: ToastMessage) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 3000);
    };

    toastListeners.add(listener);
    return () => {
      toastListeners.delete(listener);
    };
  }, []);

  return (
    <div className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-auto sm:max-w-sm" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="glass flex w-full max-w-full items-center gap-3 rounded-xl px-4 py-3 neon-border animate-in slide-in-from-right duration-300 sm:px-6 sm:py-4"
        >
          {isMaterialIcon(toast.icon) ? (
            <span className="material-symbols-rounded text-xl">{toast.icon}</span>
          ) : (
            <span className="text-xl">{toast.icon}</span>
          )}
          <span className="text-sm">{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
