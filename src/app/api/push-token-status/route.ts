import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { getTokenStatus } from "@/lib/firestore/push-tokens-admin";

// firebase-admin uses Node APIs → must NOT run on the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Reports how many devices THIS user has registered server-side, and how fresh
 * the most recent one is — without exposing token values. Lets the Notification
 * Diagnostics panel show "N device(s), updated X ago" and catch the stale/missing
 * token case (e.g. a token that rotated while the app was force-stopped).
 *
 * Response: { ok: true, hasToken, deviceCount, tokenUpdatedAt, serverTime }
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return noStore({ ok: false, reason: "unauthorized" }, 401);
  }

  try {
    const adminAuth = getAdminAuth();

    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    } catch {
      return noStore({ ok: false, reason: "invalid-token" }, 401);
    }

    const { count, latest } = await getTokenStatus(decoded.uid);

    return noStore({
      ok: true,
      hasToken: count > 0,
      deviceCount: count,
      tokenUpdatedAt: latest,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[push-token-status] error:", err);
    return noStore({ ok: false, reason: "admin-sdk", message: String(err) }, 500);
  }
}

function noStore(body: Record<string, unknown>, status = 200): NextResponse {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}
