import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifySalonOwner, adminErrorStatus } from "@/lib/admin-auth";
import { parseDayKey, israelWallTimeToInstant } from "@/lib/timezone";
import { bookSlotTx } from "@/lib/server/booking-lock";
import { upsertSalonClient } from "@/lib/server/salon-clients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Owner-gated manual appointment creation. Replaces the old client-SDK
 * `createAdminAppointment`, which wrote directly into the status collection and
 * BYPASSED the booking lock (double-booking vector). All creation now flows
 * through the single `bookSlotTx` primitive so the per-day mutex + overlap check
 * are enforced. Admin may override availability rules (no slot generation) but
 * never double-book; times are resolved in Asia/Jerusalem server-side.
 */
const BodySchema = z.object({
  salonId:         z.string().min(1).max(100),
  date:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime:       z.string().regex(/^\d{2}:\d{2}$/),
  serviceId:       z.string().min(1).max(100),
  serviceName:     z.string().min(1).max(200),
  serviceDuration: z.number().int().positive().max(600),
  servicePrice:    z.number().nonnegative().optional(),
  clientId:        z.string().min(1).max(128),
  clientName:      z.string().min(1).max(100),
  clientPhone:     z.string().max(20).optional(),
  notes:           z.string().max(1000).optional(),
  status:          z.enum(["approved", "pending"]).default("approved"),
});

export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid-body" }, { status: 400 });
  }
  const {
    salonId, date, startTime, serviceId, serviceName, serviceDuration,
    servicePrice, clientId, clientName, clientPhone, notes, status,
  } = parsed.data;

  // Owner-only.
  const auth = await verifySalonOwner(req.headers.get("authorization"), salonId);
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: adminErrorStatus(auth.error) });
  }

  const adminDb = getAdminDb();

  // Validate salon is active.
  const salonSnap = await adminDb.collection("salons").doc(salonId).get();
  if (!salonSnap.exists || salonSnap.data()?.status !== "active") {
    return NextResponse.json({ ok: false, error: "salon-not-found" }, { status: 404 });
  }

  try {
    // Resolve wall-clock date/time → Israel-tz instants (no device-tz drift).
    const { year, monthIndex, day } = parseDayKey(date);
    const [hh, mm] = startTime.split(":").map(Number);
    const startDate = israelWallTimeToInstant(year, monthIndex, day, hh, mm);
    const endDate   = new Date(startDate.getTime() + serviceDuration * 60_000);
    const dayStart  = Timestamp.fromDate(israelWallTimeToInstant(year, monthIndex, day,     0, 0));
    const dayEnd    = Timestamp.fromDate(israelWallTimeToInstant(year, monthIndex, day + 1, 0, 0));

    const targetCollection = status === "approved" ? "appointmentsApproved" : "appointmentsPending";

    const apptData: Record<string, unknown> = {
      salonId,
      clientId,
      clientName,
      clientPhone: clientPhone ?? "",
      serviceId,
      serviceName,
      serviceDuration,
      startTime: Timestamp.fromDate(startDate),
      endTime:   Timestamp.fromDate(endDate),
      status,
      isGuest:   false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (servicePrice != null) apptData.servicePrice = servicePrice;
    if (notes) apptData.notes = notes;

    let appointmentId: string;
    try {
      appointmentId = await bookSlotTx(adminDb, {
        salonId, dayKey: date, dayStart, dayEnd,
        start: startDate, end: endDate,
        targetCollection,
        apptData,
      });
    } catch (txErr) {
      if (txErr instanceof Error && txErr.message === "SLOT_TAKEN") {
        return NextResponse.json({ ok: false, error: "slot-taken" }, { status: 409 });
      }
      throw txErr;
    }

    // Register a real account holder in the salon's client directory (skip free-text walk-ins).
    if (clientId !== "admin_entry") {
      await upsertSalonClient(adminDb, salonId, {
        clientId, name: clientName, phone: clientPhone ?? "",
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, appointmentId });
  } catch (err) {
    console.error("[admin/appointments/create] error:", err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
