import { redirect } from 'next/navigation';
import { workspaceCompatibilityHref, type CompatibilityQuery } from '@/lib/workspace-compatibility';
export default async function QualityPage({ searchParams }: { searchParams: Promise<CompatibilityQuery> }) {
  redirect(workspaceCompatibilityHref('/suite/intelligence?tab=results', await searchParams));
}
