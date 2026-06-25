import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminMessaging } from "@/lib/firebase-admin";
import { verifySalonOwner, adminErrorStatus } from "@/lib/admin-auth";
import { getTokens, deleteToken } from "@/lib/firestore/push-tokens-admin";
import type { Message } from "firebase-admin/messaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CHANNEL = "appointment-reminders";

const BodySchema = z.object({
  salonId:       z.string().min(1).max(100),
  clientId:      z.string().min(1).max(128),
  title:         z.string().min(1).max(200),
  body:          z.string().min(1).max(1000),
  appointmentId: z.string().min(1).max(200).optional(),
});

export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid-body" }, { status: 400 });
  }
  const { salonId, clientId, title, body, appointmentId } = parsed.data;

  const auth = await verifySalonOwner(req.headers.get("authorization"), salonId);
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: adminErrorStatus(auth.error) });
  }

  try {
    if (clientId === "guest") {
      return NextResponse.json({ ok: true, skipped: "guest" });
    }

    const tokens = await getTokens(clientId);
    if (tokens.length === 0) {
      return NextResponse.json({ ok: true, skipped: "no-token" });
    }

    const link = `/${salonId}/my-appointments`;
    const messages: Message[] = tokens.map((token) => ({
      token,
      notification: { title, body },
      data: { route: link, ...(appointmentId ? { appointmentId } : {}) },
      android: { priority: "high", notification: { channelId: CHANNEL, sound: "default" } },
      apns: { payload: { aps: { sound: "default" } } },
      webpush: { fcmOptions: { link } },
    }));

    const resp = await getAdminMessaging().sendEach(messages);

    let sent = 0;
    let pruned = 0;
    const prunes: Promise<void>[] = [];
    resp.responses.forEach((res, i) => {
      if (res.success) { sent++; return; }
      const code = res.error?.code ?? "";
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token" ||
        code === "messaging/invalid-argument"
      ) {
        prunes.push(deleteToken(clientId, tokens[i]));
        pruned++;
      }
    });
    await Promise.all(prunes);

    return NextResponse.json({ ok: true, sent, pruned });
  } catch (err) {
    console.error("[notify-client-approval] error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
