import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { generateDaySlots } from "@/lib/booking-logic";
import { parseDayKey, israelWallTimeToInstant } from "@/lib/timezone";
import { adminSalonCol } from "@/lib/server/salon-path-admin";
import type { AvailabilityRule, BlockedTime } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BodySchema = z.object({
  salonId:         z.string().min(1).max(100),
  dayKey:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  serviceDuration: z.number().int().positive().max(600),
});

const ACTIVE_COLLS = ["appointmentsPending", "appointmentsApproved"] as const;

export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid-body" }, { status: 400 });
  }
  const { salonId, dayKey, serviceDuration } = parsed.data;

  try {
    const adminDb = getAdminDb();

    // Validate the salon exists.
    const salonSnap = await adminDb.collection("salons").doc(salonId).get();
    if (!salonSnap.exists || salonSnap.data()?.status !== "active") {
      return NextResponse.json({ ok: false, error: "salon-not-found" }, { status: 404 });
    }

    const { year, monthIndex, day } = parseDayKey(dayKey);
    const startTs = Timestamp.fromDate(israelWallTimeToInstant(year, monthIndex, day, 0, 0));
    const endTs   = Timestamp.fromDate(israelWallTimeToInstant(year, monthIndex, day + 1, 0, 0));

    const [rulesSnap, blockedSnap, ...apptSnaps] = await Promise.all([
      adminSalonCol(adminDb, salonId, "availabilityRules").get(),
      adminSalonCol(adminDb, salonId, "blockedTimes").get(),
      ...ACTIVE_COLLS.map((c) =>
        adminSalonCol(adminDb, salonId, c)
          .where("startTime", ">=", startTs)
          .where("startTime", "<",  endTs)
          .get()
      ),
    ]);

    const rules   = rulesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as AvailabilityRule);
    const blocked = blockedSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as BlockedTime);

    const existing: Array<{ start: Date; end: Date }> = [];
    for (const snap of apptSnaps) {
      for (const docSnap of snap.docs) {
        const d  = docSnap.data();
        const st = d.startTime as Timestamp | undefined;
        const et = d.endTime   as Timestamp | undefined;
        if (!st || !et) continue;
        if (d.status !== "pending" && d.status !== "approved") continue;
        existing.push({ start: st.toDate(), end: et.toDate() });
      }
    }

    const now = Date.now();
    const slots = generateDaySlots(dayKey, serviceDuration, rules, blocked, existing)
      .filter((s) => s.startTime.getTime() > now)
      .map((s) => ({
        startTime: s.startTime.toISOString(),
        endTime:   s.endTime.toISOString(),
        available: s.available,
      }));

    const res = NextResponse.json({ ok: true, slots });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err) {
    console.error("[availability] error:", err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
