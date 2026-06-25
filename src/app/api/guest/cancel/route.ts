import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { checkRateLimit, rateKey } from "@/lib/server/rate-limit";
import { findAppointmentByGuestToken } from "@/lib/server/guest-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const GUEST_IP_MAX = 20;

const BodySchema = z.object({
  salonId: z.string().min(1).max(100),
  token:   z.string().min(20).max(200),
});

export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid-body" }, { status: 400 });
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!(await checkRateLimit(rateKey("guest_cancel_ip", ip), GUEST_IP_MAX))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  try {
    const { salonId, token } = parsed.data;
    const lookup = await findAppointmentByGuestToken(salonId, token);
    if (!lookup) {
      return NextResponse.json({ ok: false, error: "not-found" }, { status: 404 });
    }
    if (lookup.coll !== "appointmentsPending") {
      return NextResponse.json({ ok: false, error: "not-cancellable" }, { status: 409 });
    }
    const status = lookup.data.status;
    if (status !== "pending" && status !== "change_requested") {
      return NextResponse.json({ ok: false, error: "not-cancellable" }, { status: 409 });
    }

    const adminDb  = getAdminDb();
    const salonRef = adminDb.collection("salons").doc(salonId);
    const pendingRef  = salonRef.collection("appointmentsPending").doc(lookup.id);
    const rejectedRef = salonRef.collection("appointmentsRejected").doc(lookup.id);

    const batch = adminDb.batch();
    batch.set(rejectedRef, { ...lookup.data, status: "cancelled", updatedAt: Timestamp.now() });
    batch.delete(pendingRef);
    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[guest/cancel] error:", err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
