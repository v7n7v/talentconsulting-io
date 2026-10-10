'use client';

import { useState, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TooltipProps {
  content: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export default function Tooltip({ 
  content, 
  children, 
  position = 'top',
  delay = 300 
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const showTooltip = () => {
    const id = setTimeout(() => setIsVisible(true), delay);
    setTimeoutId(id);
  };

  const hideTooltip = () => {
    if (timeoutId) clearTimeout(timeoutId);
    setIsVisible(false);
  };

  const positionStyles = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  const arrowStyles = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-[var(--bg-elevated)] border-x-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-[var(--bg-elevated)] border-x-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-[var(--bg-elevated)] border-y-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-[var(--bg-elevated)] border-y-transparent border-l-transparent',
  };

  const motionVariants = {
    top: { initial: { opacity: 0, y: 5 }, animate: { opacity: 1, y: 0 } },
    bottom: { initial: { opacity: 0, y: -5 }, animate: { opacity: 1, y: 0 } },
    left: { initial: { opacity: 0, x: 5 }, animate: { opacity: 1, x: 0 } },
    right: { initial: { opacity: 0, x: -5 }, animate: { opacity: 1, x: 0 } },
  };

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={motionVariants[position].initial}
            animate={motionVariants[position].animate}
            exit={motionVariants[position].initial}
            transition={{ duration: 0.15 }}
            className={`absolute z-50 ${positionStyles[position]} pointer-events-none`}
          >
            <div className="elevation-raised px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm font-medium whitespace-nowrap border border-[var(--border-subtle)]">
              {content}
            </div>
            <div className={`absolute w-0 h-0 border-4 ${arrowStyles[position]}`} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Shortcut badge tooltip
export function ShortcutTooltip({ 
  shortcut, 
  children 
}: { 
  shortcut: string; 
  children: ReactNode 
}) {
  return (
    <Tooltip content={shortcut}>
      {children}
    </Tooltip>
  );
}
