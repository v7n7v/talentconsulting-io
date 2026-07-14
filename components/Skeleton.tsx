'use client';

import { motion } from 'framer-motion';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export default function Skeleton({ 
  className = '', 
  variant = 'text',
  width,
  height,
  animation = 'pulse'
}: SkeletonProps) {
  const variantStyles = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-none',
    rounded: 'rounded-xl',
  };

  const animationStyles = {
    pulse: 'animate-pulse',
    wave: 'skeleton-wave',
    none: '',
  };

  return (
    <div
      className={`bg-white/10 ${variantStyles[variant]} ${animationStyles[animation]} ${className}`}
      style={{ width, height }}
    />
  );
}

// Skeleton card for loading states
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-2xl bg-white/5 border border-white/10 p-6 ${className}`}>
      <div className="flex items-start gap-4">
        <Skeleton variant="circular" width={48} height={48} />
        <div className="flex-1 space-y-2">
          <Skeleton width="60%" height={20} variant="rounded" />
          <Skeleton width="40%" height={16} variant="rounded" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton width="100%" height={16} variant="rounded" />
        <Skeleton width="90%" height={16} variant="rounded" />
        <Skeleton width="75%" height={16} variant="rounded" />
      </div>
    </div>
  );
}

// Skeleton table row
export function SkeletonTableRow({ columns = 4 }: { columns?: number }) {
  return (
    <tr className="border-b border-white/5">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton width={`${60 + Math.random() * 30}%`} height={16} variant="rounded" />
        </td>
      ))}
    </tr>
  );
}

// Full page loading skeleton
export function PageSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton width={200} height={32} variant="rounded" />
          <Skeleton width={300} height={20} variant="rounded" />
        </div>
        <Skeleton width={120} height={40} variant="rounded" />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <Skeleton width={40} height={40} variant="circular" className="mb-3" />
            <Skeleton width="50%" height={16} variant="rounded" className="mb-2" />
            <Skeleton width="70%" height={24} variant="rounded" />
          </div>
        ))}
      </div>

      {/* Content Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}

// Animated loading spinner
export function LoadingSpinner({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = {
    sm: 'w-5 h-5',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <motion.div
      className={`${sizes[size]} ${className}`}
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
    >
      <svg className="w-full h-full" viewBox="0 0 24 24" fill="none">
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="3"
        />
        <path
          d="M12 2C6.477 2 2 6.477 2 12"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </motion.div>
  );
}

// Branded loading screen
export function BrandedLoader({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="text-center">
        <motion.div
          animate={{ 
            scale: [1, 1.1, 1],
            rotate: [0, 5, -5, 0],
          }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/25"
        >
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
          </svg>
        </motion.div>
        <motion.p
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="text-slate-400"
        >
          {message}
        </motion.p>
      </div>
    </div>
  );
}
