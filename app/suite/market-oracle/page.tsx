import { redirect } from 'next/navigation';
import { workspaceCompatibilityHref, type CompatibilityQuery } from '@/lib/workspace-compatibility';
export default async function MarketOraclePage({ searchParams }: { searchParams: Promise<CompatibilityQuery> }) {
  redirect(workspaceCompatibilityHref('/suite/job-search?view=analysis', await searchParams));
}
