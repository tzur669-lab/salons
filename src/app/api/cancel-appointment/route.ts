import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BodySchema = z.object({
  salonId:       z.string().min(1).max(100),
  appointmentId: z.string().min(1).max(200),
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
  const { salonId, appointmentId } = parsed.data;

  try {
    const adminDb  = getAdminDb();
    const salonRef = adminDb.collection("salons").doc(salonId);
    const pendingRef  = salonRef.collection("appointmentsPending").doc(appointmentId);
    const snap = await pendingRef.get();

    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "not-pending" }, { status: 409 });
    }
    const data = snap.data()!;
    if (data.clientId !== uid) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    if (data.status !== "pending" && data.status !== "change_requested") {
      return NextResponse.json({ ok: false, error: "not-cancellable" }, { status: 409 });
    }

    const rejectedRef = salonRef.collection("appointmentsRejected").doc(appointmentId);
    const batch = adminDb.batch();
    batch.set(rejectedRef, { ...data, status: "cancelled", updatedAt: Timestamp.now() });
    batch.delete(pendingRef);
    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[cancel-appointment] error:", err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
