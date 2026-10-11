'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';

const stableFraction = (value: number) => {
    const result = Math.sin(value * 12.9898) * 43758.5453;
    return result - Math.floor(result);
};

const STAR_FIELD = Array.from({ length: 50 }, (_, index) => ({
    top: `${(stableFraction(index + 1) * 100).toFixed(3)}%`,
    left: `${(stableFraction(index + 101) * 100).toFixed(3)}%`,
    duration: stableFraction(index + 201) * 3 + 2,
    delay: stableFraction(index + 301) * 2,
}));

export default function NotFound() {
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            setMousePosition({
                x: (e.clientX / window.innerWidth - 0.5) * 20,
                y: (e.clientY / window.innerHeight - 0.5) * 20,
            });
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    return (
        <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[var(--bg-deep)]">
            {/* Animated Background */}
            <div className="absolute inset-0">
                {/* Floating orbs */}
                <motion.div
                    animate={{
                        x: mousePosition.x * 2,
                        y: mousePosition.y * 2,
                    }}
                    transition={{ type: 'spring', stiffness: 50, damping: 30 }}
                    className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full blur-[120px] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]"
                />
                <motion.div
                    animate={{
                        x: mousePosition.x * -1.5,
                        y: mousePosition.y * -1.5,
                    }}
                    transition={{ type: 'spring', stiffness: 50, damping: 30 }}
                    className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full blur-[100px] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]"
                />

                {/* Stars */}
                {STAR_FIELD.map((star, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0.2, 1, 0.2] }}
                        transition={{
                            duration: star.duration,
                            repeat: Infinity,
                            delay: star.delay,
                        }}
                        className="absolute w-1 h-1 rounded-full bg-[var(--text-primary)]"
                        style={{
                            top: star.top,
                            left: star.left,
                        }}
                    />
                ))}
            </div>

            {/* Content */}
            <div className="relative z-10 text-center px-6">
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                >
                    {/* 404 Number */}
                    <motion.h1
                        className="text-[180px] md:text-[250px] font-black leading-none text-[var(--accent)]"
                    >
                        404
                    </motion.h1>

                    {/* Glitch effect subtitle */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="relative"
                    >
                        <h2 className="text-2xl md:text-4xl font-bold text-[var(--text-primary)] mb-4">
                            Lost in the <span className="text-[var(--accent)]">Digital Void</span>
                        </h2>
                        <p className="text-[var(--text-secondary)] text-lg max-w-md mx-auto mb-8">
                            The page you're looking for has drifted into another dimension.
                            Let's get you back on track.
                        </p>
                    </motion.div>

                    {/* Navigation buttons */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="flex flex-col sm:flex-row items-center justify-center gap-4"
                    >
                        <Link
                            href="/"
                            className="btn-primary group relative inline-flex items-center gap-2 px-8 py-4"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                            </svg>
                            Return Home
                        </Link>

                        <Link
                            href="/suite"
                            className="btn-secondary inline-flex items-center gap-2 px-8 py-4"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                            </svg>
                            Go to Dashboard
                        </Link>
                    </motion.div>
                </motion.div>

                {/* Astronaut illustration */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="mt-12"
                >
                    <motion.div
                        animate={{
                            y: [0, -10, 0],
                            rotate: [0, 5, 0, -5, 0],
                        }}
                        transition={{
                            duration: 6,
                            repeat: Infinity,
                            ease: 'easeInOut',
                        }}
                        className="text-8xl"
                    >
                        <span className="material-symbols-rounded text-8xl text-[var(--accent)]">rocket_launch</span>
                    </motion.div>
                </motion.div>
            </div>

        </div>
    );
}
