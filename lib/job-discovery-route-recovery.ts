import { NextResponse } from 'next/server';
import {
  classifyJobDiscoveryResponse,
  type JobDiscoverySurface,
} from '@/lib/job-discovery-recovery';

export async function withJobDiscoveryRecovery(
  response: NextResponse,
  surface: JobDiscoverySurface,
): Promise<NextResponse> {
  const body = await response.clone().json().catch(() => ({})) as Record<string, unknown>;
  const recovery = classifyJobDiscoveryResponse(body, surface, response.status);
  return NextResponse.json({
    ...body,
    code: recovery.code,
    retryable: recovery.retryable,
    recovery,
  }, {
    status: response.status,
    headers: response.headers,
  });
}
