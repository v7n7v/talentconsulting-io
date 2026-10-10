import { redirect } from 'next/navigation';
import { workspaceCompatibilityHref, type CompatibilityQuery } from '@/lib/workspace-compatibility';
export default async function QueuePage({ searchParams }: { searchParams: Promise<CompatibilityQuery> }) {
  redirect(workspaceCompatibilityHref('/suite/applications?view=review', await searchParams));
}
