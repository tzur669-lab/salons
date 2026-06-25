import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifySalonOwner, adminErrorStatus } from "@/lib/admin-auth";
import { e164ToLocal } from "@/lib/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Salon-owner tool: list + clear the `loginRateLimit/{key}` blocks.
 *
 * The collection is `allow read, write: if false` in firestore.rules — only the
 * Admin SDK touches it. A client who exceeded the attempt limit is locked out for
 * 15 min; the owner can delete that client's counter here to unblock them instantly.
 *
 *   GET    ?salonId=xxx → list every counter
 *   DELETE { salonId, id } → remove one counter (unblocks immediately)
 */

const COLLECTION = "loginRateLimit";

const PREFIX_MAX: Record<string, number> = {
  rpphone: 5,
  rpip:    20,
  name:    5,
  ip:      20,
};
const DEFAULT_MAX = 5;

function describe(id: string): { type: string; label: string; max: number } {
  if (id.startsWith("rpphone_")) {
    const digits = id.slice("rpphone_".length).replace(/_/g, "");
    return { type: "איפוס סיסמה (טלפון)", label: e164ToLocal("+" + digits), max: PREFIX_MAX.rpphone };
  }
  if (id.startsWith("rpip_")) {
    return { type: "איפוס סיסמה (IP)", label: id.slice("rpip_".length).replace(/_/g, "."), max: PREFIX_MAX.rpip };
  }
  if (id.startsWith("name_")) {
    return { type: "התחברות (שם)", label: id.slice("name_".length).replace(/_/g, " ").trim(), max: PREFIX_MAX.name };
  }
  if (id.startsWith("ip_")) {
    return { type: "התחברות (IP)", label: id.slice("ip_".length).replace(/_/g, "."), max: PREFIX_MAX.ip };
  }
  return { type: "ניסיון התחברות", label: id.replace(/_/g, " ").trim() || id, max: DEFAULT_MAX };
}

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
    const now  = Date.now();
    const snap = await getAdminDb().collection(COLLECTION).get();
    const items = snap.docs.map((doc) => {
      const data = doc.data() as { count?: number; resetAt?: number };
      const count   = data.count   ?? 0;
      const resetAt = data.resetAt ?? 0;
      const { type, label, max } = describe(doc.id);
      const blocked     = count >= max && now < resetAt;
      const minutesLeft = blocked ? Math.max(1, Math.ceil((resetAt - now) / 60000)) : 0;
      return { id: doc.id, type, label, count, max, blocked, minutesLeft };
    });
    items.sort((a, b) => Number(b.blocked) - Number(a.blocked) || b.count - a.count);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error("[admin/rate-limits] list error:", err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

const DeleteSchema = z.object({
  salonId: z.string().min(1).max(100),
  id:      z.string().min(1).max(200),
});

export async function DELETE(req: NextRequest) {
  const parsed = DeleteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid-body" }, { status: 400 });
  }

  const auth = await verifySalonOwner(req.headers.get("authorization"), parsed.data.salonId);
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: adminErrorStatus(auth.error) });
  }

  try {
    await getAdminDb().collection(COLLECTION).doc(parsed.data.id).delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/rate-limits] delete error:", err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
