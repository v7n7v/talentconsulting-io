import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminStorage } from '@/lib/firebase-admin';

/**
 * Delete a resume the client uploaded to Storage and then abandoned.
 *
 * The resumable path uploads to Firebase Storage first and calls the parse
 * route second, so a cancel between those two steps leaves a real resume —
 * name, employers, dates, sometimes an address — sitting in the bucket with
 * nothing scheduled to remove it.
 *
 * storage.rules denies client deletes outright (`allow read, update, delete,
 * list: if false`), which is correct: the client should not be able to reach
 * into the bucket. So cleanup goes through the Admin SDK here, and the only
 * thing this route will delete is an object under the caller's own prefix.
 *
 * NOTHING SITS BEHIND THIS ROUTE. This file used to say a bucket lifecycle rule
 * was the backstop for a browser closed before the call lands. There is no such
 * rule: `firebase.json`'s storage key is `{"rules": "storage.rules"}` and no
 * lifecycle configuration exists anywhere in the repo. Creating it is an
 * UNCOMPLETED OWNER ACTION and the command is in
 * `docs/storage-retention-runbook.md`. Until it has been run, this route and the
 * parse route's own cleanup are the entire retention story for abandoned
 * resume PII.
 */

const RESUME_UPLOAD_PREFIX = 'resume_uploads/';

/**
 * A `{ storagePath, idToken }` body is a couple of KB at the very outside.
 * The sibling route refuses a body it has not bounded first; so does this one.
 */
const MAX_BODY_BYTES = 8 * 1024;

export async function POST(req: NextRequest) {
    try {
        // A declared length is required, not merely respected: without one there
        // is no bound to enforce before the read below, and both real callers —
        // `fetch` with a string body and `sendBeacon` with a Blob — always set
        // it. The sibling route answers 411 for the same reason.
        const contentLengthHeader = req.headers.get('content-length');
        const contentLength = Number(contentLengthHeader);
        if (!contentLengthHeader || !Number.isFinite(contentLength) || contentLength <= 0) {
            return NextResponse.json(
                { code: 'PARSE_FAILED', error: 'The request size could not be verified.', message: 'The request size could not be verified.' },
                { status: 411 },
            );
        }
        if (contentLength > MAX_BODY_BYTES) {
            return NextResponse.json(
                { code: 'FILE_TOO_LARGE', error: 'Request body too large.', message: 'Request body too large.' },
                { status: 413 },
            );
        }

        // ── The body is read before the guard, and only because of the beacon. ──
        //
        // `navigator.sendBeacon` is the one dispatch that reliably survives a
        // `pagehide` handler, and it CANNOT SET HEADERS — so the unload path in
        // lib/upload/upload-transport.ts has nowhere to put a bearer except the
        // body. Without this, the single upload exit no promise can cover (tab
        // close between the bucket write and the parse) leaves a real resume
        // behind for good.
        //
        // This is not an auth bypass: the token below goes through exactly the
        // same `guardApiRoute` -> `verifyIdToken` path as an Authorization
        // header, and an invalid one is rejected identically. The cost of
        // reading first is bounded by the Content-Length gate above — a few KB,
        // against the `verifyIdToken` the guard was always going to run.
        const raw = await req.text().catch(() => '');
        if (raw.length > MAX_BODY_BYTES) {
            return NextResponse.json(
                { code: 'FILE_TOO_LARGE', error: 'Request body too large.', message: 'Request body too large.' },
                { status: 413 },
            );
        }
        let body: Record<string, unknown> | null = null;
        try {
            body = raw ? JSON.parse(raw) : null;
        } catch {
            body = null;
        }

        let guardTarget = req;
        const beaconToken = typeof body?.idToken === 'string' ? body.idToken : '';
        if (beaconToken && !req.headers.get('authorization')) {
            const headers = new Headers(req.headers);
            headers.set('authorization', `Bearer ${beaconToken}`);
            guardTarget = new NextRequest(req.url, { method: 'POST', headers });
        }

        // Anonymous callers are not admitted: only a signed-in user can create
        // one of these objects, so only a signed-in user can abandon one. The
        // rate limit is generous because cancelling is not abuse — it is the
        // user changing their mind, and the cleanup needs to land.
        const guard = await guardApiRoute(guardTarget, {
            rateLimit: 30,
            rateLimitWindow: 60_000,
            skipUsageCap: true,
        });
        if (guard.error) return guard.error;

        const storagePath = typeof body?.storagePath === 'string' ? body.storagePath : '';
        if (!storagePath) {
            return NextResponse.json(
                { code: 'PARSE_FAILED', error: 'No storage path provided.', message: 'No storage path provided.' },
                { status: 400 },
            );
        }

        const expectedPrefix = `${RESUME_UPLOAD_PREFIX}${guard.user.uid}/`;
        if (!storagePath.startsWith(expectedPrefix) || storagePath.includes('..')) {
            return NextResponse.json(
                { code: 'PARSE_FAILED', error: 'Invalid resume upload path.', message: 'Invalid resume upload path.' },
                { status: 403 },
            );
        }

        await getAdminStorage().bucket().file(storagePath).delete({ ignoreNotFound: true });
        return NextResponse.json({ deleted: true });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown abandon error';
        console.warn('[api/gauntlet/parse-resume/abandon] Cleanup failed:', message);
        // Deliberately not a 500 to the client: the upload is already gone from
        // the user's point of view, and a failed cleanup is not something the
        // user can act on. It is not silent either — `deleted: false` is what
        // the client now logs, because nothing else will remove this object.
        return NextResponse.json({ deleted: false }, { status: 202 });
    }
}
