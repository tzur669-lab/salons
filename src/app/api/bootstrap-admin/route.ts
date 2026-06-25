import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * This route is retired. Salons has no global admin — each salon's owner is
 * determined by salons/{salonId}.ownerUid set during onboarding.
 * Use /api/onboard to register a new salon.
 */
export async function POST() {
  return NextResponse.json(
    { ok: false, error: "This route has been retired. Use /api/onboard to register a salon." },
    { status: 410 }
  );
}
