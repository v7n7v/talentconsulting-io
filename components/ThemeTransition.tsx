'use client';

/**
 * ThemeTransition — Cinematic dawn/dusk sweep overlay
 * 
 * Light mode (dawn): Coral and paper sweep from top → bottom
 * Dark mode (dusk): Ink and coral sweep from bottom → top
 * 
 * Includes floating particles (stars for dusk, light rays for dawn)
 * and a subtle gradient that dissipates to reveal the new theme.
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ThemeTransitionProps {
  isTransitioning: boolean;
  targetTheme: 'light' | 'dark';
  onComplete: () => void;
}

export default function ThemeTransition({ isTransitioning, targetTheme, onComplete }: ThemeTransitionProps) {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; size: number; delay: number }>>([]);

  useEffect(() => {
    if (isTransitioning) {
      // Generate particles
      const newParticles = Array.from({ length: 20 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 4 + 2,
        delay: Math.random() * 0.3,
      }));
      setParticles(newParticles);
    }
  }, [isTransitioning]);

  const isDawn = targetTheme === 'light';

  // Keep the transition within Taco's paper, ink, and coral palette.
  const gradient = isDawn
    ? 'linear-gradient(180deg, var(--taco-coral) 0%, var(--taco-coral-ink) 20%, var(--taco-coral) 40%, var(--taco-soft) 65%, var(--taco-paper) 82%, rgba(255,250,245,0) 100%)'
    : 'linear-gradient(0deg, var(--taco-ink) 0%, var(--taco-muted) 15%, var(--taco-coral-ink) 32%, var(--taco-coral) 52%, var(--taco-coral) 68%, var(--taco-soft) 84%, rgba(21,21,21,0) 100%)';

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {isTransitioning && (
        <motion.div
          className="fixed inset-0 z-[9999] pointer-events-none"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          {/* Main sweep */}
          <motion.div
            className="absolute inset-0"
            initial={{
              clipPath: isDawn
                ? 'inset(0% 0% 100% 0%)'   // Start hidden at top
                : 'inset(100% 0% 0% 0%)',   // Start hidden at bottom
            }}
            animate={{
              clipPath: 'inset(0% 0% 0% 0%)', // Reveal fully
            }}
            transition={{
              duration: 0.7,
              ease: [0.22, 1, 0.36, 1], // Custom ease-out
            }}
            style={{ background: gradient }}
          />

          {/* Particles layer */}
          {particles.map((p) => (
            <motion.div
              key={p.id}
              className="absolute rounded-full"
              style={{
                left: `${p.x}%`,
                top: isDawn ? `${p.y}%` : `${100 - p.y}%`,
                width: p.size,
                height: p.size,
                background: isDawn
                  ? `rgba(255, 91, 53, ${0.6 + Math.random() * 0.4})`
                  : `rgba(255, 250, 245, ${0.4 + Math.random() * 0.5})`,
                boxShadow: isDawn
                  ? `0 0 ${p.size * 3}px rgba(198, 182, 255, 0.55)`
                  : `0 0 ${p.size * 2}px rgba(198, 182, 255, 0.4)`,
              }}
              initial={{
                opacity: 0,
                scale: 0,
                y: isDawn ? -30 : 30,
              }}
              animate={{
                opacity: [0, 1, 0.7, 0],
                scale: [0, 1.5, 1, 0],
                y: isDawn ? [0, 60, 120] : [0, -60, -120],
              }}
              transition={{
                duration: 1.0,
                delay: p.delay + 0.15,
                ease: 'easeOut',
              }}
            />
          ))}

          {/* Sun/Moon orb at center */}
          <motion.div
            className="absolute left-1/2 -translate-x-1/2"
            style={{
              top: isDawn ? '15%' : undefined,
              bottom: isDawn ? undefined : '15%',
            }}
            initial={{
              opacity: 0,
              scale: 0,
            }}
            animate={{
              opacity: [0, 0.9, 0.7, 0],
              scale: [0, 1, 1.2, 0.5],
            }}
            transition={{
              duration: 0.9,
              ease: 'easeInOut',
            }}
          >
            <div
              className="w-16 h-16 rounded-full"
              style={{
                background: isDawn
                  ? 'radial-gradient(circle, var(--taco-paper) 0%, var(--taco-coral) 50%, rgba(255,91,53,0) 70%)'
                  : 'radial-gradient(circle, var(--taco-paper) 0%, var(--taco-soft) 40%, rgba(242,235,227,0) 70%)',
                boxShadow: isDawn
                  ? '0 0 60px 20px rgba(198,182,255,0.4), 0 0 120px 60px rgba(198,182,255,0.2)'
                  : '0 0 40px 15px rgba(198,182,255,0.3), 0 0 80px 40px rgba(198,182,255,0.15)',
              }}
            />
          </motion.div>

          {/* Light rays (dawn only) */}
          {isDawn && (
            <motion.div
              className="absolute inset-0 overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.4, 0] }}
              transition={{ duration: 1.0, delay: 0.2 }}
            >
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={`ray-${i}`}
                  className="absolute origin-top"
                  style={{
                    top: '10%',
                    left: `${30 + i * 8}%`,
                    width: '2px',
                    height: '60%',
                    background: 'linear-gradient(180deg, rgba(255,91,53,0.5) 0%, rgba(255,91,53,0) 100%)',
                    transform: `rotate(${-15 + i * 6}deg)`,
                  }}
                  initial={{ scaleY: 0, opacity: 0 }}
                  animate={{ scaleY: [0, 1, 0.5], opacity: [0, 0.6, 0] }}
                  transition={{ duration: 0.8, delay: 0.2 + i * 0.05 }}
                />
              ))}
            </motion.div>
          )}

          {/* Star twinkles (dusk only) */}
          {!isDawn && (
            <>
              {[...Array(12)].map((_, i) => (
                <motion.div
                  key={`star-${i}`}
                  className="absolute"
                  style={{
                    left: `${10 + Math.random() * 80}%`,
                    top: `${10 + Math.random() * 60}%`,
                  }}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{
                    opacity: [0, 1, 0.5, 1, 0],
                    scale: [0, 1, 0.8, 1, 0],
                  }}
                  transition={{
                    duration: 1.0,
                    delay: 0.3 + i * 0.06,
                    ease: 'easeInOut',
                  }}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="var(--taco-paper)">
                    <path d="M4 0L4.5 3L8 4L4.5 5L4 8L3.5 5L0 4L3.5 3Z" opacity="0.8" />
                  </svg>
                </motion.div>
              ))}
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
