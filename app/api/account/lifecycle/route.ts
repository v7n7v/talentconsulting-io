import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminAuth } from '@/lib/firebase-admin';

const ALLOWED_ACTIONS = new Set(['deactivate', 'delete']);

export async function POST(req: NextRequest) {
    try {
        const guard = await guardApiRoute(req, { rateLimit: 3, rateLimitWindow: 60_000 });
        if (guard.error) return guard.error;

        const { action } = await req.json();

        if (!action || !ALLOWED_ACTIONS.has(action)) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const userId = guard.user.uid;
        const userRecord = await getAdminAuth().getUser(userId).catch(() => null);
        
        if (!userRecord) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        console.log(`[Account Lifecycle] Initiated ${action} for authenticated user ${userId.slice(0, 8)}…`);

        // TODO: Integrate with chosen Email Provider (Resend, SendGrid, etc.)
        // 1. Generate secure token/OTP
        // 2. Save token to Firestore
        // 3. Dispatch email with link/code

        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 800));

        return NextResponse.json({ 
            success: true, 
            message: `Verification email sent for ${action}.`
        });

    } catch (error: any) {
        console.error('[Account Lifecycle Error]:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
