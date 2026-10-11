import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Skill Bridge — AI Skill Gap Analysis & Study Plans',
  description: 'Identify skill gaps between your resume and target roles. Get AI-generated study plans, learning resources, and progress tracking.',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function SkillBridgeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
