import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAuth } from "@/lib/firebase-admin";
import { saveToken, deleteToken, type PushPlatform } from "@/lib/firestore/push-tokens-admin";

// firebase-admin uses Node APIs → must NOT run on the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_PLATFORMS: PushPlatform[] = ["android", "ios", "web"];

// Platform is a non-critical tag — never reject a valid token over an odd value.
function normalizePlatform(p: unknown): PushPlatform {
  return VALID_PLATFORMS.includes(p as PushPlatform) ? (p as PushPlatform) : "web";
}

const PostSchema = z.object({
  token: z.string().min(20).max(4096),
  platform: z.string().optional(),
});
const DeleteSchema = z.object({
  token: z.string().min(20).max(4096),
});

/**
 * The uid is derived ONLY from a verified Firebase ID token — never from the body.
 * Previously the route trusted a body `userId`, so anyone could register their own
 * device under the admin's (public) uid and receive every client's bookings/reminders.
 */
async function uidFromAuth(req: NextRequest): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(header.slice(7));
    return decoded.uid;
  } catch {
    return null;
  }
}

/** Register / refresh a device token (one doc per device under the caller's uid). */
export async function POST(req: NextRequest) {
  try {
    const uid = await uidFromAuth(req);
    if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const parsed = PostSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid-body" }, { status: 400 });
    }
    await saveToken(uid, parsed.data.token, normalizePlatform(parsed.data.platform));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[register-push-token] POST", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** Remove a device token (called on logout so the device stops receiving). */
export async function DELETE(req: NextRequest) {
  try {
    const uid = await uidFromAuth(req);
    if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const parsed = DeleteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid-body" }, { status: 400 });
    }
    await deleteToken(uid, parsed.data.token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[register-push-token] DELETE", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
