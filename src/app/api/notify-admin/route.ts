import sgMail from "@sendgrid/mail";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";
import type { Message } from "firebase-admin/messaging";
import { getAdminDb, getAdminMessaging } from "@/lib/firebase-admin";
import { getTokensForUsers, deleteToken } from "@/lib/firestore/push-tokens-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHANNEL = "appointment-reminders";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

const BodySchema = z.object({
  salonId:       z.string().min(1).max(100),
  appointmentId: z.string().min(1).max(200),
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );
}

async function pushToOwner(ownerUid: string, salonId: string, payload: { title: string; body: string }): Promise<void> {
  try {
    const adminMessaging = getAdminMessaging();
    const tokenMap = await getTokensForUsers([ownerUid]);
    const tokens = tokenMap.get(ownerUid) ?? [];
    if (tokens.length === 0) return;

    const link = `/${salonId}/admin`;
    const messages: Message[] = tokens.map((token) => ({
      token,
      notification: { title: payload.title, body: payload.body },
      data: { route: link },
      android: { priority: "high", notification: { channelId: CHANNEL, sound: "default" } },
      apns: { payload: { aps: { sound: "default" } } },
      webpush: { fcmOptions: { link } },
    }));

    const resp = await adminMessaging.sendEach(messages);
    const prunes: Promise<void>[] = [];
    resp.responses.forEach((res, i) => {
      if (res.success) return;
      const code = res.error?.code ?? "";
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token" ||
        code === "messaging/invalid-argument"
      ) {
        prunes.push(deleteToken(ownerUid, tokens[i]));
      }
    });
    await Promise.all(prunes);
  } catch (err) {
    console.error("[notify-admin] push error:", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid-body" }, { status: 400 });
    }
    const { salonId, appointmentId } = parsed.data;

    const adminDb = getAdminDb();

    // Verify salon exists and get ownerUid + ownerEmail.
    const salonSnap = await adminDb.collection("salons").doc(salonId).get();
    if (!salonSnap.exists) {
      return NextResponse.json({ ok: true, skipped: "salon-not-found" });
    }
    const salonData = salonSnap.data()!;
    const ownerUid: string = salonData.ownerUid ?? "";

    // Read the real pending appointment — source of truth (unauthenticated route).
    const ref = adminDb.collection("salons").doc(salonId).collection("appointmentsPending").doc(appointmentId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: true, skipped: "not-found" });
    }
    const data = snap.data()!;

    // Idempotency stamp — only the first caller sends.
    let proceed = false;
    try {
      await adminDb.runTransaction(async (tx) => {
        const latest = await tx.get(ref);
        if (!latest.exists || latest.data()!.adminNotifiedAt) {
          proceed = false;
          return;
        }
        tx.update(ref, { adminNotifiedAt: Timestamp.now() });
        proceed = true;
      });
    } catch (err) {
      console.error("[notify-admin] idempotency transaction failed:", err);
      return NextResponse.json({ ok: false, error: "stamp_failed" }, { status: 500 });
    }
    if (!proceed) {
      return NextResponse.json({ ok: true, skipped: "already-notified" });
    }

    const clientName  = String(data.clientName  ?? "");
    const clientPhone = String(data.clientPhone  ?? "");
    const serviceName = String(data.serviceName  ?? "");
    const isGuest     = data.isGuest === true;
    const startTime: Date = data.startTime instanceof Timestamp ? data.startTime.toDate() : new Date();

    const dateStr = startTime.toLocaleDateString("he-IL", {
      timeZone: "Asia/Jerusalem", weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
    const timeStr = startTime.toLocaleTimeString("he-IL", {
      timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit",
    });

    const guestLabel  = isGuest ? " (אורח/ת ללא חשבון)" : "";
    const approvalUrl = `${APP_URL}/${salonId}/admin/appointments`;
    const salonName   = String(salonData.displayName ?? salonId);

    // Resolve the salon's alert recipient from the owner's (private) user doc:
    // explicit notificationEmail first, then the real login email — never a global
    // fallback (that would leak one salon's bookings into another owner's inbox).
    let adminEmail = "";
    if (ownerUid) {
      const ownerSnap = await adminDb.collection("users").doc(ownerUid).get();
      const owner = ownerSnap.data() ?? {};
      const explicit = (owner.notificationEmail as string | undefined)?.trim();
      const login = owner.authEmail as string | undefined;
      if (explicit) adminEmail = explicit;
      else if (login && !login.includes("noemail_")) adminEmail = login;
    }

    if (adminEmail && process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      try {
        await sgMail.send({
          to: adminEmail,
          from: { email: process.env.SENDGRID_FROM, name: salonName },
          subject: `💅 תור חדש — ${clientName}`,
          html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #fdf6f0; border-radius: 16px;">
          <h2 style="color: #c9a882; margin-bottom: 8px;">💅 בקשת תור חדשה!</h2>
          <p style="color: #555; margin-bottom: 24px;">התקבלה בקשת תור חדשה מ-<strong>${escapeHtml(clientName)}</strong>.</p>
          <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden;">
            <tr style="border-bottom: 1px solid #f0e8e0;"><td style="padding: 12px 16px; color: #888; width: 35%;">שם</td><td style="padding: 12px 16px; font-weight: bold; color: #333;">${escapeHtml(clientName)}${guestLabel}</td></tr>
            <tr style="border-bottom: 1px solid #f0e8e0;"><td style="padding: 12px 16px; color: #888;">טלפון</td><td style="padding: 12px 16px; font-weight: bold; color: #333; direction: ltr;">${escapeHtml(clientPhone)}</td></tr>
            <tr style="border-bottom: 1px solid #f0e8e0;"><td style="padding: 12px 16px; color: #888;">שירות</td><td style="padding: 12px 16px; font-weight: bold; color: #333;">${escapeHtml(serviceName)}</td></tr>
            <tr style="border-bottom: 1px solid #f0e8e0;"><td style="padding: 12px 16px; color: #888;">תאריך</td><td style="padding: 12px 16px; font-weight: bold; color: #333;">${dateStr}</td></tr>
            <tr><td style="padding: 12px 16px; color: #888;">שעה</td><td style="padding: 12px 16px; font-weight: bold; color: #333;">${timeStr}</td></tr>
          </table>
          <div style="margin-top: 24px; text-align: center;">
            <a href="${approvalUrl}" style="display: inline-block; padding: 14px 32px; background: #c9a882; color: white; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 16px;">✓ לאישור / דחיית התור</a>
          </div>
        </div>`,
        });
      } catch (err) {
        console.error("[notify-admin] email failed:", err);
      }
    }

    if (ownerUid) {
      await pushToOwner(ownerUid, salonId, {
        title: "הזמנה חדשה 💅",
        body: `${clientName} קבעה תור ל-${serviceName}`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[notify-admin] error:", err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
