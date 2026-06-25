import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, rateKey } from "@/lib/server/rate-limit";
import { findAppointmentByGuestToken, toGuestView } from "@/lib/server/guest-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const GUEST_IP_MAX = 30;

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
  if (!(await checkRateLimit(rateKey("guest_view_ip", ip), GUEST_IP_MAX))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  try {
    const lookup = await findAppointmentByGuestToken(parsed.data.salonId, parsed.data.token);
    if (!lookup) {
      return NextResponse.json({ ok: false, error: "not-found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, appointment: toGuestView(lookup) });
  } catch (err) {
    console.error("[guest/appointment] error:", err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
