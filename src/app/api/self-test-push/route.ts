import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAuth, getAdminMessaging } from "@/lib/firebase-admin";
import { getTokens, deleteToken } from "@/lib/firestore/push-tokens-admin";
import type { Message } from "firebase-admin/messaging";

const BodySchema = z.object({
  salonId: z.string().min(1).max(100).optional(),
});

// firebase-admin uses Node APIs → must NOT run on the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CHANNEL = "appointment-reminders"; // must match the native channel id

/**
 * Self-test for push notifications — for ANY logged-in user (not admin-only,
 * unlike /api/admin-test-push). Runs the REAL reminder push path to the caller's
 * OWN device and returns the precise outcome, so the failing gate is visible.
 * Used by the Notification Diagnostics panel to confirm/deny delivery on device.
 *
 * Response shapes:
 *   { ok: true }                                       → FCM accepted the message
 *   { ok: false, reason: "no-token" }                  → no device token stored for this user
 *   { ok: false, reason: "fcm-error", code, message }  → FCM rejected (the smoking gun)
 *   { ok: false, reason: "admin-sdk", message }        → Admin SDK couldn't init (creds)
 *   { ok: false, reason: "unauthorized" | "invalid-token" }
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  const salonId = parsed.success ? (parsed.data.salonId ?? "") : "";

  try {
    const adminAuth = getAdminAuth();

    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ ok: false, reason: "invalid-token" }, { status: 401 });
    }

    // Gate 1 — is a device token stored for this user?
    const tokens = await getTokens(decoded.uid);
    if (tokens.length === 0) {
      return NextResponse.json({ ok: false, reason: "no-token" });
    }

    const link = salonId ? `/${salonId}/my-appointments` : "/my-appointments";

    // Gate 2 — does FCM accept + deliver to at least one device (real channel)?
    const messages: Message[] = tokens.map((token) => ({
      token,
      notification: {
        title: "בדיקת התראות 🔔",
        body: "אם קיבלת את זה — ההתראות עובדות ✅",
      },
      data: { route: link },
      android: { priority: "high", notification: { channelId: CHANNEL, sound: "default" } },
      apns: { payload: { aps: { sound: "default" } } },
      webpush: { fcmOptions: { link } },
    }));

    const resp = await getAdminMessaging().sendEach(messages);

    // Prune dead tokens so the diagnostic count stays honest.
    const prunes: Promise<void>[] = [];
    resp.responses.forEach((res, i) => {
      const code = res.success ? "" : res.error?.code ?? "";
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token" ||
        code === "messaging/invalid-argument"
      ) {
        prunes.push(deleteToken(decoded.uid, tokens[i]));
      }
    });
    await Promise.all(prunes);

    if (resp.successCount > 0) {
      return NextResponse.json({ ok: true, sent: resp.successCount, devices: tokens.length });
    }
    const firstErr = resp.responses.find((r) => !r.success)?.error;
    const code = firstErr?.code ?? "";
    const message = firstErr?.message ?? "all sends failed";
    console.error("[self-test-push] FCM send failed:", code, message);
    return NextResponse.json({ ok: false, reason: "fcm-error", code, message });
  } catch (err) {
    // Admin SDK init / credential failure (cert threw on first use).
    console.error("[self-test-push] admin-sdk error:", err);
    return NextResponse.json({ ok: false, reason: "admin-sdk", message: String(err) });
  }
}
