'use client';

import DashboardPreviewHome from '@/components/landing/DashboardPreviewHome';

interface HeroSectionProps {
  onGetStarted: () => void;
  onShowLogin: () => void;
  onShowSignup: () => void;
  isAuthenticated: boolean;
}

export default function HeroSection(props: HeroSectionProps) {
  return <DashboardPreviewHome {...props} />;
}
