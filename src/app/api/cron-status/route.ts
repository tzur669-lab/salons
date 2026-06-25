import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifySalonOwner, adminErrorStatus } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const STALE_MINUTES = 30;

/**
 * Salon-owner only. Reports the appointment-reminders cron heartbeat so the
 * dashboard can warn when the external scheduler stops calling the endpoint.
 *
 * `stale` is only true once the cron HAS run before but not within STALE_MINUTES.
 */
export async function GET(req: NextRequest) {
  const salonId = req.nextUrl.searchParams.get("salonId") ?? "";
  if (!salonId) {
    return NextResponse.json({ ok: false, error: "missing-salonId" }, { status: 400 });
  }

  const auth = await verifySalonOwner(req.headers.get("authorization"), salonId);
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: adminErrorStatus(auth.error) });
  }

  try {
    const snap = await getAdminDb().collection("cronStatus").doc("appointmentReminders").get();
    const lastRunMs: number | null = snap.data()?.lastRunAt?.toMillis?.() ?? null;
    const ageMinutes = lastRunMs == null ? null : Math.round((Date.now() - lastRunMs) / 60000);
    const stale = ageMinutes != null && ageMinutes > STALE_MINUTES;

    const res = NextResponse.json({
      ok: true,
      lastRunAt: lastRunMs ? new Date(lastRunMs).toISOString() : null,
      ageMinutes,
      stale,
      staleThresholdMinutes: STALE_MINUTES,
    });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err) {
    console.error("[cron-status] error:", err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
