import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { generateDaySlots } from "@/lib/booking-logic";
import { israelDayKey, parseDayKey, israelWallTimeToInstant } from "@/lib/timezone";
import { readLockAndCheckOverlap, lockBumpData } from "@/lib/server/booking-lock";
import type { AvailabilityRule, BlockedTime } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_RESCHEDULES = 3;

const BodySchema = z.object({
  salonId:       z.string().min(1).max(100),
  appointmentId: z.string().min(1).max(200),
  startTime:     z.string().datetime(),
  endTime:       z.string().datetime(),
});

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let uid: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(authHeader.slice(7));
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid-token" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid-body" }, { status: 400 });
  }
  const { salonId, appointmentId, startTime: startIso, endTime: endIso } = parsed.data;
  const startDate = new Date(startIso);
  const endDate   = new Date(endIso);

  if (startDate.getTime() <= Date.now()) {
    return NextResponse.json({ ok: false, error: "slot-in-past" }, { status: 409 });
  }
  if (endDate.getTime() <= startDate.getTime()) {
    return NextResponse.json({ ok: false, error: "invalid-times" }, { status: 400 });
  }

  try {
    const adminDb  = getAdminDb();
    const salonRef = adminDb.collection("salons").doc(salonId);
    const pendingRef  = salonRef.collection("appointmentsPending").doc(appointmentId);
    const approvedRef = salonRef.collection("appointmentsApproved").doc(appointmentId);
    const [pSnap, aSnap] = await Promise.all([pendingRef.get(), approvedRef.get()]);

    const fromApproved = !pSnap.exists && aSnap.exists;
    const snap = pSnap.exists ? pSnap : aSnap.exists ? aSnap : null;
    if (!snap) {
      return NextResponse.json({ ok: false, error: "not-found" }, { status: 404 });
    }
    const data = snap.data()!;
    if (data.clientId !== uid) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    if (data.status !== "pending" && data.status !== "approved") {
      return NextResponse.json({ ok: false, error: "not-reschedulable" }, { status: 409 });
    }
    if ((data.startTime as Timestamp).toMillis() <= Date.now()) {
      return NextResponse.json({ ok: false, error: "already-started" }, { status: 409 });
    }
    if (((data.rescheduleCount as number) ?? 0) >= MAX_RESCHEDULES) {
      return NextResponse.json({ ok: false, error: "reschedule-limit" }, { status: 409 });
    }

    const serviceDuration = data.serviceDuration as number;
    if (endDate.getTime() - startDate.getTime() !== serviceDuration * 60_000) {
      return NextResponse.json({ ok: false, error: "duration-mismatch" }, { status: 400 });
    }

    const dayKey = israelDayKey(startDate);
    const { year, monthIndex, day } = parseDayKey(dayKey);
    const dayStart = Timestamp.fromDate(israelWallTimeToInstant(year, monthIndex, day, 0, 0));
    const dayEnd   = Timestamp.fromDate(israelWallTimeToInstant(year, monthIndex, day + 1, 0, 0));

    const [rulesSnap, blockedSnap, pendDaySnap, apprDaySnap] = await Promise.all([
      salonRef.collection("availabilityRules").get(),
      salonRef.collection("blockedTimes").get(),
      salonRef.collection("appointmentsPending").where("startTime", ">=", dayStart).where("startTime", "<", dayEnd).get(),
      salonRef.collection("appointmentsApproved").where("startTime", ">=", dayStart).where("startTime", "<", dayEnd).get(),
    ]);

    const rules   = rulesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as AvailabilityRule);
    const blocked = blockedSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as BlockedTime);

    const existing: Array<{ start: Date; end: Date }> = [];
    for (const dSnap of [...pendDaySnap.docs, ...apprDaySnap.docs]) {
      if (dSnap.id === appointmentId) continue;
      const d  = dSnap.data();
      if (d.status !== "pending" && d.status !== "approved") continue;
      const st = d.startTime as Timestamp | undefined;
      const et = d.endTime   as Timestamp | undefined;
      if (!st || !et) continue;
      existing.push({ start: st.toDate(), end: et.toDate() });
    }

    const slot = generateDaySlots(dayKey, serviceDuration, rules, blocked, existing).find(
      (s) => s.startTime.getTime() === startDate.getTime() && s.endTime.getTime() === endDate.getTime()
    );
    if (!slot) {
      return NextResponse.json({ ok: false, error: "slot-not-found" }, { status: 409 });
    }
    if (!slot.available) {
      return NextResponse.json({ ok: false, error: "slot-taken" }, { status: 409 });
    }

    try {
      await adminDb.runTransaction(async (tx) => {
        const ref = fromApproved ? approvedRef : pendingRef;
        const cur = await tx.get(ref);
        if (!cur.exists) throw new Error("GONE");
        const c = cur.data()!;
        if (c.clientId !== uid) throw new Error("FORBIDDEN");
        if (c.status !== "pending" && c.status !== "approved") throw new Error("BAD_STATUS");

        const { taken, lockRef } = await readLockAndCheckOverlap(
          adminDb, tx, salonId, dayKey, dayStart, dayEnd, startDate, endDate, appointmentId
        );
        if (taken) throw new Error("SLOT_TAKEN");

        tx.set(lockRef, lockBumpData(dayKey), { merge: true });

        const updates: Record<string, unknown> = {
          startTime:       Timestamp.fromDate(startDate),
          endTime:         Timestamp.fromDate(endDate),
          status:          "pending",
          rescheduleCount: ((c.rescheduleCount as number) ?? 0) + 1,
          updatedAt:       FieldValue.serverTimestamp(),
          adminNotifiedAt: FieldValue.delete(),
        };
        if (!c.originalStartTime) updates.originalStartTime = c.startTime;

        if (fromApproved) {
          tx.set(pendingRef, { ...c, ...updates });
          tx.delete(approvedRef);
        } else {
          tx.update(pendingRef, updates);
        }
      });
    } catch (txErr) {
      const msg = txErr instanceof Error ? txErr.message : "";
      if (msg === "SLOT_TAKEN")  return NextResponse.json({ ok: false, error: "slot-taken" },         { status: 409 });
      if (msg === "GONE")        return NextResponse.json({ ok: false, error: "not-found" },           { status: 404 });
      if (msg === "FORBIDDEN")   return NextResponse.json({ ok: false, error: "forbidden" },           { status: 403 });
      if (msg === "BAD_STATUS")  return NextResponse.json({ ok: false, error: "not-reschedulable" },  { status: 409 });
      throw txErr;
    }

    return NextResponse.json({ ok: true, appointmentId });
  } catch (err) {
    console.error("[reschedule-request] error:", err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
