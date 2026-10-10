import { redirect } from 'next/navigation';
import { workspaceCompatibilityHref, type CompatibilityQuery } from '@/lib/workspace-compatibility';
export default async function WeeklyPage({ searchParams }: { searchParams: Promise<CompatibilityQuery> }) {
  redirect(workspaceCompatibilityHref('/suite/intelligence?tab=weekly', await searchParams));
}
