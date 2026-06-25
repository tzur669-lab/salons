import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminMessaging } from "@/lib/firebase-admin";
import { verifySalonOwner, adminErrorStatus } from "@/lib/admin-auth";
import { getTokens } from "@/lib/firestore/push-tokens-admin";
import type { Message } from "firebase-admin/messaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CHANNEL = "appointment-reminders";

const BodySchema = z.object({
  salonId: z.string().min(1).max(100),
});

/**
 * Salon-owner self-test for push notifications. Sends a real push to the
 * caller's own device(s) to verify FCM is wired up correctly.
 */
export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: "invalid-body" }, { status: 400 });
  }
  const { salonId } = parsed.data;

  const auth = await verifySalonOwner(req.headers.get("authorization"), salonId);
  if ("error" in auth) {
    return NextResponse.json({ ok: false, reason: auth.error }, { status: adminErrorStatus(auth.error) });
  }

  try {
    const tokens = await getTokens(auth.uid);
    if (tokens.length === 0) {
      return NextResponse.json({ ok: false, reason: "no-token" });
    }

    const link = `/${salonId}/admin`;
    const messages: Message[] = tokens.map((token) => ({
      token,
      notification: { title: "בדיקת התראות 🔔", body: "אם קיבלת את זה — ההתראות עובדות ✅" },
      data: { route: link },
      android: { priority: "high", notification: { channelId: CHANNEL, sound: "default" } },
      apns: { payload: { aps: { sound: "default" } } },
      webpush: { fcmOptions: { link } },
    }));

    const resp = await getAdminMessaging().sendEach(messages);
    if (resp.successCount > 0) {
      return NextResponse.json({ ok: true, sent: resp.successCount, devices: tokens.length });
    }
    const firstErr = resp.responses.find((r) => !r.success)?.error;
    const code    = firstErr?.code    ?? "";
    const message = firstErr?.message ?? "all sends failed";
    console.error("[admin-test-push] FCM send failed:", code, message);
    return NextResponse.json({ ok: false, reason: "fcm-error", code, message });
  } catch (err) {
    console.error("[admin-test-push] admin-sdk error:", err);
    return NextResponse.json({ ok: false, reason: "admin-sdk", message: String(err) });
  }
}
