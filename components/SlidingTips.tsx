'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const TIPS = [
    // core features
    { icon: 'bar_chart', text: 'Track your market value in real-time with Market Oracle' },
    { icon: 'description', text: 'Create targeted resumes with Liquid Resume' },
    { icon: 'view_carousel', text: 'Master concepts with AI-generated Study Cards' },

    // analysis & tools
    { icon: 'search', text: 'Analyze any JD to find hidden requirements' },
    { icon: 'my_location', text: 'Get matched with the best job opportunities' },
    { icon: 'work', text: 'Generate compelling job descriptions with AI' },

    // customization
    { icon: 'edit_document', text: 'Generate cover letters that match your resume tone' },
    { icon: 'palette', text: 'Edit your portfolio theme in Settings' },
    { icon: 'sync', text: 'Sync your LinkedIn profile for auto-updates' },

    // productivity
    { icon: 'bolt', text: 'Use shortcuts to navigate the dashboard faster' },
    { icon: 'smartphone', text: 'Talent Suite works great on mobile too' },
    { icon: 'notifications', text: 'Enable notifications for job alerts' },
    { icon: 'handshake', text: 'Share your verified profile with recruiters' }
];

export default function SlidingTips() {
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % TIPS.length);
        }, 6000);

        return () => clearInterval(timer);
    }, []);

    return (
        <div
            className="absolute right-full top-1/2 -translate-y-1/2 mr-8 h-10 w-[600px] overflow-hidden pointer-events-none hidden md:block"
            style={{
                maskImage: 'linear-gradient(to right, transparent, black 15%)',
                WebkitMaskImage: 'linear-gradient(to right, transparent, black 15%)'
            }}
        >
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentIndex}
                    initial={{ x: 50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -20, opacity: 0 }}
                    transition={{
                        type: "spring",
                        stiffness: 100,
                        damping: 20,
                        mass: 1
                    }}
                    className="flex items-center justify-end gap-3 w-full h-full text-right"
                >
                    <span className="text-xs text-silver font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                        {TIPS[currentIndex].text}
                    </span>
                    <span className="flex-shrink-0 w-6 text-center text-lg leading-none select-none grayscale opacity-60 material-symbols-rounded">
                        {TIPS[currentIndex].icon}
                    </span>
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
