import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import type { Message } from "firebase-admin/messaging";
import { getAdminDb, getAdminMessaging } from "@/lib/firebase-admin";
import { getTokensForUsers, deleteToken } from "@/lib/firestore/push-tokens-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REMINDER_CHANNEL = "appointment-reminders";

const WINDOW_MS      = 70 * 60 * 1000;
const DUE_MS         = 60 * 60 * 1000;
const MAX_PER_RUN    = 200;
const MAX_ATTEMPTS   = 5;
const STALE_CLAIM_MS = 5 * 60 * 1000;
// Sweep: each doc costs 2 batch ops (set completed + delete approved). Keeping ≤240 docs
// per run (480 ops) stays safely under Firestore's 500-op batch limit. Repeat runs clear
// any backlog left over from outages or the first run after wiring up the cron scheduler.
const SWEEP_LIMIT    = 240;

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface DueAppointment {
  id: string;
  salonId: string;
  salonName: string;
  clientId: string;
  clientName: string;
  serviceName: string;
  attempts: number;
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

async function handle(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const auth  = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !secretMatches(token, cronSecret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const adminDb        = getAdminDb();
    const adminMessaging = getAdminMessaging();
    const now     = Date.now();
    const horizon = Timestamp.fromMillis(now + WINDOW_MS);
    const nowTs   = Timestamp.fromMillis(now);

    // ── 0. Sweep past approved appointments → completed (cross-salon collectionGroup) ──
    // Limited to SWEEP_LIMIT docs per run (2 batch ops each → stays under 500-op limit).
    // Any backlog beyond SWEEP_LIMIT is processed by subsequent cron runs.
    const pastSnap = await adminDb
      .collectionGroup("appointmentsApproved")
      .where("endTime", "<=", Timestamp.fromMillis(now))
      .limit(SWEEP_LIMIT)
      .get();

    if (!pastSnap.empty) {
      let sweepBatch = adminDb.batch();
      let sweepOps   = 0;
      let sweepCount = 0;
      for (const d of pastSnap.docs) {
        if (d.data().status !== "approved") continue;
        // Path: salons/{salonId}/appointmentsApproved/{id}
        const salonId = d.ref.parent.parent?.id;
        if (!salonId) continue;
        const completedRef = adminDb
          .collection("salons").doc(salonId)
          .collection("appointmentsCompleted").doc(d.id);
        sweepBatch.set(completedRef, {
          ...d.data(),
          status: "completed",
          updatedAt: FieldValue.serverTimestamp(),
        });
        sweepBatch.delete(d.ref);
        sweepOps  += 2; // set + delete
        sweepCount++;
        // Flush at 480 ops (safety margin below the 500-op limit).
        if (sweepOps >= 480) {
          await sweepBatch.commit().catch((e) =>
            console.error("[appointment-reminders] sweep batch failed:", e)
          );
          sweepBatch = adminDb.batch();
          sweepOps   = 0;
        }
      }
      if (sweepCount > 0 && sweepOps > 0) {
        await sweepBatch.commit().catch((e) =>
          console.error("[appointment-reminders] sweep failed:", e)
        );
      }
    }

    // ── 1. Approved appointments starting within the next 70 minutes (cross-salon) ──
    // Capped at MAX_PER_RUN; appointments beyond the cap are picked up by the next run.
    const snap = await adminDb
      .collectionGroup("appointmentsApproved")
      .where("startTime", ">=", nowTs)
      .where("startTime", "<=", horizon)
      .orderBy("startTime")
      .limit(MAX_PER_RUN)
      .get();

    // Pre-load salon names for the appointments we'll process.
    const salonIds = new Set<string>();
    for (const doc of snap.docs) {
      const sId = doc.ref.parent.parent?.id;
      if (sId) salonIds.add(sId);
    }
    const salonNameMap = new Map<string, string>();
    await Promise.all([...salonIds].map(async (sId) => {
      const sSnap = await adminDb.collection("salons").doc(sId).get();
      const name  = (sSnap.data()?.displayName as string | undefined) ?? sId;
      salonNameMap.set(sId, name);
    }));

    // ── 2. Build candidate list ──
    const candidates: DueAppointment[] = [];
    for (const doc of snap.docs) {
      if (candidates.length >= MAX_PER_RUN) break;
      const d      = doc.data();
      const salonId = doc.ref.parent.parent?.id;
      if (!salonId) continue;
      if (d.status !== "approved")  continue;
      if (d.reminderSentAt)         continue;
      if (d.reminderFailed)         continue;
      const attempts = (d.reminderAttempts as number) ?? 0;
      if (attempts >= MAX_ATTEMPTS) continue;
      const claimedAt = d.reminderClaimedAt as Timestamp | undefined;
      if (claimedAt && now - claimedAt.toMillis() < STALE_CLAIM_MS) continue;
      const clientId = d.clientId as string | undefined;
      if (!clientId || clientId === "guest") continue;
      const startMs = (d.startTime as Timestamp).toMillis();
      if (startMs - now > DUE_MS) continue;
      candidates.push({
        id:          doc.id,
        salonId,
        salonName:   salonNameMap.get(salonId) ?? salonId,
        clientId,
        clientName:  (d.clientName  as string) ?? "",
        serviceName: (d.serviceName as string) ?? "",
        attempts,
      });
    }

    if (candidates.length === 0) {
      return await done(adminDb, { ok: true, checked: snap.size, confirmed: 0, retrying: 0, failedPermanently: 0, skipped: 0, pruned: 0 });
    }

    // ── 3. Tokens per client ──
    const tokenMap   = await getTokensForUsers(candidates.map((a) => a.clientId));
    const withTokens = candidates.filter((a) => (tokenMap.get(a.clientId) ?? []).length > 0);
    const skipped    = candidates.length - withTokens.length;

    // ── 4. CLAIM each candidate ──
    const claimedTs = Timestamp.fromMillis(now);
    const claimed: DueAppointment[] = [];
    for (const appt of withTokens) {
      const ref = adminDb.collection("salons").doc(appt.salonId)
        .collection("appointmentsApproved").doc(appt.id);
      try {
        const ok = await adminDb.runTransaction(async (tx) => {
          const s = await tx.get(ref);
          if (!s.exists) return false;
          const d = s.data()!;
          if (d.status !== "approved" || d.reminderSentAt || d.reminderFailed) return false;
          const a = (d.reminderAttempts as number) ?? 0;
          if (a >= MAX_ATTEMPTS) return false;
          const c = d.reminderClaimedAt as Timestamp | undefined;
          if (c && now - c.toMillis() < STALE_CLAIM_MS) return false;
          tx.update(ref, { reminderClaimedAt: claimedTs, reminderAttempts: a + 1 });
          return true;
        });
        if (ok) claimed.push({ ...appt, attempts: appt.attempts + 1 });
      } catch (e) {
        console.error(`[appointment-reminders] claim failed for ${appt.id}:`, e);
      }
    }

    if (claimed.length === 0) {
      return await done(adminDb, { ok: true, checked: snap.size, confirmed: 0, retrying: 0, failedPermanently: 0, skipped, pruned: 0 });
    }

    // ── 5. Build messages ──
    const pairs: { appt: DueAppointment; token: string }[] = [];
    for (const appt of claimed) {
      for (const token of tokenMap.get(appt.clientId) ?? []) pairs.push({ appt, token });
    }

    const messages: Message[] = pairs.map(({ appt, token }) => {
      const link = `/${appt.salonId}/my-appointments`;
      return {
        token,
        notification: {
          title: `היי ${appt.clientName}! 💅`,
          body:  `מזכירה לך שיש לך תור ${appt.serviceName} אצל ${appt.salonName}. ניפגש 💖`,
        },
        data: { route: link, appointmentId: appt.id },
        android: {
          priority: "high",
          notification: { channelId: REMINDER_CHANNEL, sound: "default" },
        },
        apns: { payload: { aps: { sound: "default" } } },
        webpush: { fcmOptions: { link } },
      };
    });

    // ── 6. Send ──
    const batchResponse = await adminMessaging.sendEach(messages);

    const successByAppt = new Map<string, boolean>();
    for (const appt of claimed) successByAppt.set(appt.id, false);
    const prunes: Promise<void>[] = [];
    let pruned = 0;

    batchResponse.responses.forEach((res, i) => {
      const { appt, token } = pairs[i];
      if (res.success) {
        successByAppt.set(appt.id, true);
      } else {
        const code = res.error?.code ?? "";
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token" ||
          code === "messaging/invalid-argument"
        ) {
          prunes.push(deleteToken(appt.clientId, token));
          pruned++;
        }
        console.error(`[appointment-reminders] send failed for ${appt.id}:`, res.error?.message);
      }
    });

    await Promise.allSettled(prunes);

    // ── 7. CONFIRM ──
    const confirmBatch = adminDb.batch();
    const sentTs = Timestamp.fromMillis(Date.now());
    let confirmed = 0, retrying = 0, failedPermanently = 0;
    for (const appt of claimed) {
      const ref = adminDb.collection("salons").doc(appt.salonId)
        .collection("appointmentsApproved").doc(appt.id);
      if (successByAppt.get(appt.id)) {
        confirmBatch.update(ref, { reminderSentAt: sentTs, reminderClaimedAt: FieldValue.delete() });
        confirmed++;
      } else if (appt.attempts >= MAX_ATTEMPTS) {
        confirmBatch.update(ref, { reminderFailed: true, reminderClaimedAt: FieldValue.delete() });
        failedPermanently++;
      } else {
        confirmBatch.update(ref, { reminderClaimedAt: FieldValue.delete() });
        retrying++;
      }
    }
    await confirmBatch.commit().catch((e) =>
      console.error("[appointment-reminders] confirm batch failed:", e)
    );

    return await done(adminDb, { ok: true, checked: snap.size, confirmed, retrying, failedPermanently, skipped, pruned });
  } catch (err) {
    console.error("[appointment-reminders] error:", err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

const CRON_STATUS_DOC = "appointmentReminders";
async function done(
  adminDb: ReturnType<typeof getAdminDb>,
  body: Record<string, unknown>
): Promise<NextResponse> {
  await adminDb
    .collection("cronStatus").doc(CRON_STATUS_DOC)
    .set({ lastRunAt: Timestamp.fromMillis(Date.now()), lastResult: body }, { merge: true })
    .catch((e) => console.error("[appointment-reminders] heartbeat write failed:", e));
  const res = NextResponse.json(body);
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}
