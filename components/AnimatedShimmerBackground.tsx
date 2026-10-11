'use client';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function AnimatedShimmerBackground() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  // Abstract gradient orbs — no images. The shimmer is the effect; its colour is
  // the brand accent at low alpha via color-mix, so it reads correctly in both
  // themes without a colour branch.
  const orbs = [
    { top: '5%', left: '10%', size: 300, color: 'color-mix(in srgb, var(--accent) 6%, transparent)', delay: 0 },
    { top: '20%', right: '5%', size: 400, color: 'color-mix(in srgb, var(--accent) 5%, transparent)', delay: 2 },
    { top: '50%', left: '5%', size: 350, color: 'color-mix(in srgb, var(--accent) 4%, transparent)', delay: 4 },
    { top: '70%', right: '15%', size: 280, color: 'color-mix(in srgb, var(--accent) 4%, transparent)', delay: 1 },
  ];

  return (
    <div className="absolute inset-x-0 top-0 h-[900px] z-0 overflow-hidden pointer-events-none">
      {orbs.map((orb, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            top: orb.top,
            left: orb.left,
            right: orb.right,
            width: orb.size,
            height: orb.size,
            background: `radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
            filter: 'blur(40px)',
          }}
          animate={{ 
            y: [-15, 15, -15],
            opacity: [0.6, 1, 0.6],
          }}
          transition={{
            y: { duration: 12 + i * 3, repeat: Infinity, ease: 'easeInOut', delay: orb.delay },
            opacity: { duration: 8 + i * 2, repeat: Infinity, ease: 'easeInOut', delay: orb.delay },
          }}
        />
      ))}

      {/* Bottom fade */}
      <div 
        className="absolute bottom-0 inset-x-0 h-40 z-10"
        style={{ background: `linear-gradient(to top, var(--bg-deep), transparent)` }}
      />
    </div>
  );
}
