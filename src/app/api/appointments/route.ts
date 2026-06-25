import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { generateDaySlots } from "@/lib/booking-logic";
import { parseDayKey, israelWallTimeToInstant } from "@/lib/timezone";
import { checkRateLimit, rateKey } from "@/lib/server/rate-limit";
import { readLockAndCheckOverlap, lockBumpData } from "@/lib/server/booking-lock";
import { adminSalonCol, adminSalonSubDoc } from "@/lib/server/salon-path-admin";
import type { AvailabilityRule, BlockedTime } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const GUEST_IP_MAX    = 10;
const GUEST_PHONE_MAX =  3;

const BodySchema = z.object({
  salonId:         z.string().min(1).max(100),
  dayKey:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime:       z.string().datetime(),
  endTime:         z.string().datetime(),
  serviceId:       z.string().min(1).max(100),
  serviceName:     z.string().min(1).max(200),
  serviceDuration: z.number().int().positive().max(600),
  clientName:      z.string().min(1).max(100).optional(),
  clientPhone:     z.string().min(1).max(20).optional(),
});

export async function POST(req: NextRequest) {
  const adminDb   = getAdminDb();
  const adminAuth = getAdminAuth();

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid-body" }, { status: 400 });
  }
  const {
    salonId, dayKey, startTime: startIso, endTime: endIso,
    serviceId, serviceName, serviceDuration,
    clientName: bodyName, clientPhone: bodyPhone,
  } = parsed.data;

  // Validate salon.
  const salonSnap = await adminDb.collection("salons").doc(salonId).get();
  if (!salonSnap.exists || salonSnap.data()?.status !== "active") {
    return NextResponse.json({ ok: false, error: "salon-not-found" }, { status: 404 });
  }

  const startDate = new Date(startIso);
  const endDate   = new Date(endIso);

  // Resolve identity.
  let uid: string | null = null;
  let isGuest = true;
  let resolvedName  = bodyName  ?? "";
  let resolvedPhone = bodyPhone ?? "";

  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    try {
      const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
      uid = decoded.uid;
      isGuest = false;
      const userSnap = await adminDb.collection("users").doc(uid).get();
      if (userSnap.exists) {
        const u = userSnap.data()!;
        resolvedName  = (u.name  as string) || resolvedName;
        resolvedPhone = (u.phone as string) || resolvedPhone;
      }
    } catch {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  if (isGuest) {
    if (!resolvedName || !resolvedPhone) {
      return NextResponse.json({ ok: false, error: "guest-missing-fields" }, { status: 400 });
    }
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    const [ipOk, phoneOk] = await Promise.all([
      checkRateLimit(rateKey("appt_ip",    ip),            GUEST_IP_MAX),
      checkRateLimit(rateKey("appt_phone", resolvedPhone), GUEST_PHONE_MAX),
    ]);
    if (!ipOk || !phoneOk) {
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }
  }

  if (startDate.getTime() <= Date.now()) {
    return NextResponse.json({ ok: false, error: "slot-in-past" }, { status: 409 });
  }
  if (endDate.getTime() <= startDate.getTime()) {
    return NextResponse.json({ ok: false, error: "invalid-times" }, { status: 400 });
  }

  try {
    const { year, monthIndex, day } = parseDayKey(dayKey);
    const dayStart = Timestamp.fromDate(israelWallTimeToInstant(year, monthIndex, day,     0, 0));
    const dayEnd   = Timestamp.fromDate(israelWallTimeToInstant(year, monthIndex, day + 1, 0, 0));

    const salonRef = adminDb.collection("salons").doc(salonId);

    const [rulesSnap, blockedSnap, serviceSnap, pendSnap, apprSnap] = await Promise.all([
      salonRef.collection("availabilityRules").get(),
      salonRef.collection("blockedTimes").get(),
      salonRef.collection("services").doc(serviceId).get(),
      salonRef.collection("appointmentsPending").where("startTime", ">=", dayStart).where("startTime", "<", dayEnd).get(),
      salonRef.collection("appointmentsApproved").where("startTime", ">=", dayStart).where("startTime", "<", dayEnd).get(),
    ]);

    const rules   = rulesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as AvailabilityRule);
    const blocked = blockedSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as BlockedTime);

    const existing: Array<{ start: Date; end: Date }> = [];
    for (const snap of [pendSnap, apprSnap]) {
      for (const docSnap of snap.docs) {
        const d  = docSnap.data();
        const st = d.startTime as Timestamp | undefined;
        const et = d.endTime   as Timestamp | undefined;
        if (!st || !et) continue;
        if (d.status !== "pending" && d.status !== "approved") continue;
        existing.push({ start: st.toDate(), end: et.toDate() });
      }
    }

    const slots = generateDaySlots(dayKey, serviceDuration, rules, blocked, existing);
    const requestedSlot = slots.find(
      (s) => s.startTime.getTime() === startDate.getTime() && s.endTime.getTime() === endDate.getTime()
    );
    if (!requestedSlot) {
      return NextResponse.json({ ok: false, error: "slot-not-found" }, { status: 409 });
    }
    if (!requestedSlot.available) {
      return NextResponse.json({ ok: false, error: "slot-taken" }, { status: 409 });
    }

    const servicePrice = serviceSnap.exists
      ? (serviceSnap.data()?.price as number | undefined)
      : undefined;

    let guestToken: string | null = null;
    let guestAccessTokenHash: string | undefined;
    if (isGuest) {
      guestToken = randomBytes(32).toString("base64url");
      guestAccessTokenHash = createHash("sha256").update(guestToken).digest("hex");
    }

    const newRef = salonRef.collection("appointmentsPending").doc();
    const apptData: Record<string, unknown> = {
      salonId,
      clientId:        uid ?? "guest",
      clientName:      resolvedName,
      clientPhone:     resolvedPhone,
      serviceId,
      serviceName,
      serviceDuration,
      startTime:       Timestamp.fromDate(startDate),
      endTime:         Timestamp.fromDate(endDate),
      status:          "pending",
      isGuest,
      createdAt:       FieldValue.serverTimestamp(),
      updatedAt:       FieldValue.serverTimestamp(),
    };
    if (servicePrice != null) apptData.servicePrice = servicePrice;
    if (guestAccessTokenHash) apptData.guestAccessTokenHash = guestAccessTokenHash;

    try {
      await adminDb.runTransaction(async (tx) => {
        const { taken, lockRef } = await readLockAndCheckOverlap(
          adminDb, tx, salonId, dayKey, dayStart, dayEnd, startDate, endDate
        );
        if (taken) throw new Error("SLOT_TAKEN");
        tx.set(lockRef, lockBumpData(dayKey), { merge: true });
        tx.create(newRef, apptData);
      });
    } catch (txErr) {
      if (txErr instanceof Error && txErr.message === "SLOT_TAKEN") {
        return NextResponse.json({ ok: false, error: "slot-taken" }, { status: 409 });
      }
      throw txErr;
    }

    return NextResponse.json({
      ok: true,
      appointmentId: newRef.id,
      ...(guestToken ? { guestToken } : {}),
    });
  } catch (err) {
    console.error("[appointments/create] error:", err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
