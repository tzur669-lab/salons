import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { getAdminDb, getAdminStorage } from "@/lib/firebase-admin";
import { verifySalonOwner, adminErrorStatus } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Owner-gated "import image by URL" for the portfolio. The owner pastes a Google
 * Drive share link (or a direct image URL); the server downloads the bytes (no
 * CORS on the server) and re-hosts them in our own Storage at
 * salons/{salonId}/gallery/*. The stored URL is always a firebasestorage.googleapis.com
 * link → renders reliably + permanently (independent of Drive sharing), and the host
 * is already whitelisted for next/image.
 */
const BodySchema = z.object({
  salonId: z.string().min(1).max(100),
  url: z.string().url().max(2000),
});

const MAX_BYTES = 10 * 1024 * 1024; // matches the Storage rule cap

/** Extracts a Google Drive file id from the common share-link shapes. */
function driveFileId(u: URL): string | null {
  const host = u.hostname.toLowerCase();
  if (host === "drive.google.com" || host === "docs.google.com") {
    const fileMatch = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileMatch) return fileMatch[1];
    const idParam = u.searchParams.get("id");
    if (idParam) return idParam;
    const dMatch = u.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (dMatch) return dMatch[1];
  }
  if (host === "lh3.googleusercontent.com") {
    const m = u.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
  }
  return null;
}

/** Drive links → a fetchable image endpoint; everything else is used as-is. */
function normalizeImageUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  const id = driveFileId(u);
  // thumbnail endpoint returns a real JPEG and avoids the virus-scan HTML interstitial
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w2000` : raw;
}

/** Rejects non-https and obvious internal hosts (basic SSRF guard). */
function isSafeUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a === 169 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) {
      return false;
    }
  }
  return true;
}

export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "bad-url" }, { status: 400 });
  }
  const { salonId, url } = parsed.data;

  // Owner-only.
  const auth = await verifySalonOwner(req.headers.get("authorization"), salonId);
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: adminErrorStatus(auth.error) });
  }

  // Salon must exist + be active.
  const salonSnap = await getAdminDb().collection("salons").doc(salonId).get();
  if (!salonSnap.exists || salonSnap.data()?.status !== "active") {
    return NextResponse.json({ ok: false, error: "salon-not-found" }, { status: 404 });
  }

  const target = normalizeImageUrl(url);
  if (!isSafeUrl(target)) {
    return NextResponse.json({ ok: false, error: "bad-url" }, { status: 400 });
  }

  try {
    const res = await fetch(target, {
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; SalonsBot/1.0)" },
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "fetch-failed" }, { status: 422 });
    }
    const contentType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("image/")) {
      // Drive returns text/html for non-public files or non-image pages.
      return NextResponse.json({ ok: false, error: "not-an-image" }, { status: 422 });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0) {
      return NextResponse.json({ ok: false, error: "not-an-image" }, { status: 422 });
    }
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "too-large" }, { status: 413 });
    }

    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (!bucketName) {
      console.error("[gallery-import] missing NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET");
      return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
    }

    const token = randomUUID();
    const path = `salons/${salonId}/gallery/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await getAdminStorage()
      .bucket(bucketName)
      .file(path)
      .save(buf, {
        contentType,
        resumable: false,
        metadata: { metadata: { firebaseStorageDownloadTokens: token } },
      });

    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    return NextResponse.json({ ok: true, url: publicUrl });
  } catch (err) {
    console.error("[gallery-import] error:", err);
    return NextResponse.json({ ok: false, error: "fetch-failed" }, { status: 422 });
  }
}
