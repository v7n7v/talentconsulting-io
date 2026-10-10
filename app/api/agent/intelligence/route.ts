import { NextRequest } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { generateRecommendations, generateProfileSummary } from '@/lib/career-recommendations';
import { getOrComputeTwin, invalidateTwin, exportTwinJSON } from '@/lib/career-twin';
import { buildSonaBrief } from '@/lib/assistant/context';
import { monitor } from '@/lib/monitor';
import { DEMO_USER_ID, getDemoIntelligenceResponse, isDemoModeEnabled } from '@/lib/demo-mode';

export async function GET(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 20, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  const uid = guard.user.uid;
  const exportMode = new URL(req.url).searchParams.get('export') === 'true';

  try {
    if (isDemoModeEnabled() && uid === DEMO_USER_ID) {
      const demo = getDemoIntelligenceResponse();
      if (exportMode) {
        return new Response(JSON.stringify({
          profile: demo.profile,
          background: demo.twin.background,
          memory: demo.twin.memory,
          behavioralCoverage: demo.twin.behavioralBank,
          meta: {
            completeness: demo.twin.completeness.score,
            exportable: demo.twin.exportable,
            demo: true,
          },
        }, null, 2), {
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': 'attachment; filename="career-profile-demo.json"',
          },
        });
      }

      return new Response(JSON.stringify(demo), { headers: { 'Content-Type': 'application/json' } });
    }

    // Get or compute the persistent twin
    const twin = await getOrComputeTwin(uid);

    // Export mode — return clean JSON for external tools
    if (exportMode) {
      return new Response(JSON.stringify(exportTwinJSON(twin)), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="career-profile.json"',
        },
      });
    }

    const recommendations = generateRecommendations(twin);
    const summary = generateProfileSummary(twin);

    return new Response(JSON.stringify({
      profile: twin,
      recommendations,
      summary,
      sonaBrief: buildSonaBrief(twin),
      twin: {
        completeness: twin.completeness,
        behavioralBank: twin.behavioralBank,
        background: twin.background,
        memory: twin.memory,
        exportable: twin.exportable,
      },
      cached: twin.cacheOrigin === 'persisted',
      computedAt: twin.computedAt,
      dataVersion: twin.version,
      cacheOrigin: twin.cacheOrigin,
      sourceReads: twin.sourceReads,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('Intelligence API error:', e);
    monitor.critical('Tool: agent/intelligence', String(e));
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

// POST to invalidate twin (called after tool usage)
export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 30, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  const uid = guard.user.uid;
  if (isDemoModeEnabled() && uid === DEMO_USER_ID) {
    return new Response(JSON.stringify({ success: true, message: 'Demo Career Twin refreshed' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await invalidateTwin(uid);


  return new Response(JSON.stringify({ success: true, message: 'Twin invalidated' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
