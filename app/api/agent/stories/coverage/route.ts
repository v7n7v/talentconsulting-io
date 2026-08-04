import { NextRequest } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { monitor } from '@/lib/monitor';
import { coverageFromStories, migrateLegacyStories, readStoryBankStories } from '@/lib/story-bank';

/**
 * GET /api/agent/stories/coverage
 *
 * Behavioral category coverage: how many of the fixed category list the user's
 * own saved stories actually touch. Pure counting over their own records —
 * nothing here is inferred and nothing is scored.
 *
 * This route did not exist. `app/suite/agent/stories/page.tsx` has been calling
 * it since the page was written, so the request 404'd, `coverage` stayed null
 * forever, and both the "Category coverage" tile and the coverage map badge
 * rendered a literal "..." for every user.
 */
export async function GET(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 20, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  try {
    /*
     * `readStoryBankStories`, not `listStoryBankStories`, for two reasons.
     *
     * It is a read: `listStoryBankStories` begins with `migrateLegacyStories`,
     * an untransacted read-then-write. The Story Bank page fires this route
     * and GET /api/agent/stories inside one Promise.all, so both handlers
     * would enter the migration, both would finish their canonical read before
     * either committed, and every legacy story would be written twice.
     *
     * And coverage is a count over the WHOLE bank. `listStoryBankStories`
     * paginates and silently clamps `limit` to 150, so above 150 stories it
     * would report categories as uncovered that the user's own data covers.
     */
    /*
     * Migrate first, THEN read.
     *
     * Skipping the migration closed the duplication race but opened a smaller
     * one: on the first load after deploy, an account whose stories still live
     * under `users/{uid}/stories` had an empty canonical collection here, so
     * this returned `totalStories: 0` with all 15 categories uncovered - while
     * the story list beside it rendered those same stories, migrated by the
     * sibling route in the same Promise.all. "0 of 15 categories" is an
     * assertion the data does not support.
     *
     * Entering the migration is safe now for a different reason than before:
     * `legacyCanonicalId` gives every legacy doc a deterministic canonical id,
     * so two concurrent migrations converge on the same documents instead of
     * minting duplicates. That was verified against a mock modelling
     * read-snapshot-then-deferred-commit: 6 writes, 3 documents.
     */
    await migrateLegacyStories(guard.user.uid);
    const stories = await readStoryBankStories(guard.user.uid);
    return new Response(JSON.stringify(coverageFromStories(stories)), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    monitor.critical('Tool: agent/stories/coverage', String(e));
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
