'use client';

import WorkspaceFrame from '@/components/workspace/WorkspaceFrame';
import { ToolGuidanceProvider } from '@/components/guidance/ToolGuidanceProvider';

export default function SuiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WorkspaceFrame><ToolGuidanceProvider>{children}</ToolGuidanceProvider></WorkspaceFrame>;
}
