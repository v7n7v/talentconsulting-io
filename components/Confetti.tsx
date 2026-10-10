'use client';

import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';

const TACO_CONFETTI_COLORS = ['#ff5b35', '#a82c18', '#151515', '#fffaf5', '#f2ebe3'];

// Hook to trigger confetti celebration
export function useConfetti() {
    const fire = (options?: confetti.Options) => {
        const defaults: confetti.Options = {
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            colors: TACO_CONFETTI_COLORS,
        };

        confetti({
            ...defaults,
            ...options,
        });
    };

    const fireMultiple = () => {
        const duration = 3 * 1000;
        const animationEnd = Date.now() + duration;

        const interval = setInterval(() => {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                clearInterval(interval);
                return;
            }

            const particleCount = 50 * (timeLeft / duration);

            confetti({
                particleCount,
                startVelocity: 30,
                spread: 360,
                origin: {
                    x: Math.random(),
                    y: Math.random() - 0.2,
                },
                colors: TACO_CONFETTI_COLORS,
            });
        }, 250);
    };

    const fireSides = () => {
        confetti({
            particleCount: 50,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: TACO_CONFETTI_COLORS,
        });
        confetti({
            particleCount: 50,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: TACO_CONFETTI_COLORS,
        });
    };

    return { fire, fireMultiple, fireSides };
}

// Standalone function for importing
export const celebrateSuccess = () => {
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: TACO_CONFETTI_COLORS,
    });
};
