'use client';

import WorkspaceFrame from '@/components/workspace/WorkspaceFrame';

export default function SuiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WorkspaceFrame>{children}</WorkspaceFrame>;
}
