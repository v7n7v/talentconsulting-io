'use client';

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

type AdminSparklineTone = 'cobalt' | 'healthy' | 'degraded' | 'critical' | 'violet';

interface AdminSparklineProps {
  values: readonly number[];
  label: string;
  tone?: AdminSparklineTone;
  showTooltip?: boolean;
  className?: string;
}

const TONE_VARIABLES: Record<AdminSparklineTone, string> = {
  cobalt: 'var(--taco-accent-text)',
  healthy: 'var(--admin-healthy)',
  degraded: 'var(--admin-degraded)',
  critical: 'var(--admin-critical)',
  violet: 'var(--admin-violet)',
};

export function AdminSparkline({
  values,
  label,
  tone = 'cobalt',
  showTooltip = false,
  className = '',
}: AdminSparklineProps) {
  const data = values.map((value, index) => ({ index, value }));

  return (
    <div className={`admin-sparkline ${className}`} role="img" aria-label={label}>
      {data.length > 1 ? (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 3, right: 2, bottom: 3, left: 2 }} accessibilityLayer={false}>
            {showTooltip ? (
              <Tooltip
                cursor={false}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const value = payload[0]?.value;
                  return (
                    <span className="admin-sparkline-tooltip">
                      {typeof value === 'number' ? value.toLocaleString() : '—'}
                    </span>
                  );
                }}
              />
            ) : null}
            <Line
              type="monotone"
              dataKey="value"
              stroke={TONE_VARIABLES[tone]}
              strokeWidth={1.8}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <span className="admin-sparkline-empty">No trend</span>
      )}
    </div>
  );
}
