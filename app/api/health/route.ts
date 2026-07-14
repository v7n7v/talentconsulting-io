/**
 * Health Check API — safe production endpoint
 * GET /api/health
 *
 * Returns ONLY operational status. No secret names or env var enumeration.
 * Detailed diagnostics are behind admin auth in /api/admin/users.
 */
import { NextResponse } from 'next/server';
import { stagingDeploymentIdentityFingerprint } from '@/lib/staging-deployment-identity';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    stagingDeploymentIdentity: stagingDeploymentIdentityFingerprint(process.env),
  });
}
