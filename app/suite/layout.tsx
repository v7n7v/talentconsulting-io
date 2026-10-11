import type { Metadata } from 'next';
import WorkspaceFrame from '@/components/workspace/WorkspaceFrame';
import { ToolGuidanceProvider } from '@/components/guidance/ToolGuidanceProvider';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function SuiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WorkspaceFrame><ToolGuidanceProvider>{children}</ToolGuidanceProvider></WorkspaceFrame>;
}
