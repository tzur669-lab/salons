import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminMessaging } from "@/lib/firebase-admin";
import { verifySalonOwner, adminErrorStatus } from "@/lib/admin-auth";
import { getAllUidsWithTokens, getTokens, deleteToken } from "@/lib/firestore/push-tokens-admin";
import type { Message } from "firebase-admin/messaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHANNEL = "appointment-reminders";
const DOWNLOAD_PATH = "/download";

const BodySchema = z.object({
  salonId: z.string().min(1).max(100),
  title:   z.string().min(1).max(200).optional(),
  body:    z.string().min(1).max(1000).optional(),
});

const DEFAULT_TITLE = "עדכון זמין לאפליקציה";
const DEFAULT_BODY  = "יצאה גרסה חדשה — הקליקי כאן לעדכון";

const FCM_BATCH = 500;
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid-body" }, { status: 400 });
  }
  const { salonId, title: rawTitle, body: rawBody } = parsed.data;

  const auth = await verifySalonOwner(req.headers.get("authorization"), salonId);
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: adminErrorStatus(auth.error) });
  }

  try {
    const adminMessaging = getAdminMessaging();
    const title = rawTitle?.trim() || DEFAULT_TITLE;
    const body  = rawBody?.trim()  || DEFAULT_BODY;
    const base  = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const downloadUrl = `${base}${DOWNLOAD_PATH}`;

    const uids = await getAllUidsWithTokens();
    const targets = (
      await Promise.all(
        uids.map(async (uid) => {
          const tokens = await getTokens(uid);
          return tokens.map((token) => {
            const message: Message = {
              token,
              notification: { title, body },
              data: { route: DOWNLOAD_PATH, url: downloadUrl },
              android: { priority: "high", notification: { channelId: CHANNEL, sound: "default" } },
              apns: { payload: { aps: { sound: "default" } } },
              webpush: { fcmOptions: { link: downloadUrl } },
            };
            return { uid, token, message };
          });
        })
      )
    ).flat();

    if (targets.length === 0) {
      return NextResponse.json({ ok: true, recipients: uids.length, sent: 0, pruned: 0 });
    }

    let sent = 0, pruned = 0;
    const prunes: Promise<void>[] = [];
    for (const batch of chunk(targets, FCM_BATCH)) {
      const resp = await adminMessaging.sendEach(batch.map((t) => t.message));
      resp.responses.forEach((res, i) => {
        if (res.success) { sent++; return; }
        const code = res.error?.code ?? "";
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token" ||
          code === "messaging/invalid-argument"
        ) {
          prunes.push(deleteToken(batch[i].uid, batch[i].token));
          pruned++;
        }
      });
    }
    await Promise.all(prunes);

    return NextResponse.json({ ok: true, recipients: uids.length, sent, pruned });
  } catch (err) {
    console.error("[notify-update] error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
