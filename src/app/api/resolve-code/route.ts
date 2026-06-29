import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")?.trim() ?? "";
  if (code.length !== 4) {
    return NextResponse.json({ error: "invalid-code" }, { status: 400 });
  }
  const db = getAdminDb();
  const snap = await db.collection("salonCodes").doc(code).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  const { salonId } = snap.data() as { salonId: string };
  return NextResponse.json({ salonId });
}
