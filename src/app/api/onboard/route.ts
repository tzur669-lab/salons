import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

const body = z.object({
  inviteCode: z.string().min(1).max(100),
  displayName: z.string().min(2).max(60).trim(),
  englishName: z.string().max(60).trim().optional(),
  phone: z.string().min(9).max(20).trim(),
  address: z.string().min(2).max(200).trim(),
  openTime: z.string().regex(/^\d{2}:\d{2}$/),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/),
  openDays: z.array(z.number().int().min(0).max(6)).min(1),
  notificationEmail: z.union([z.string().email().max(200), z.literal("")]).optional(),
});

/** Converts "סלון דנה" → "salon-dana" — URL-safe slug. */
function slugify(text: string): string {
  const hebrewToLatin: Record<string, string> = {
    א: "a", ב: "b", ג: "g", ד: "d", ה: "h", ו: "v", ז: "z",
    ח: "ch", ט: "t", י: "y", כ: "k", ך: "k", ל: "l", מ: "m",
    ם: "m", נ: "n", ן: "n", ס: "s", ע: "e", פ: "p", ף: "p",
    צ: "tz", ץ: "tz", ק: "k", ר: "r", ש: "sh", ת: "t",
  };
  let out = "";
  for (const ch of text) {
    out += hebrewToLatin[ch] ?? ch;
  }
  return out
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

// Expand CODE_ALPHABET to base-32 (e.g. "23456789ABCDEFGHJKLMNPQRSTUVWXYZ") in a future version if needed.
const CODE_LENGTH = 4;
const CODE_ALPHABET = "0123456789";

/** Finds an available 4-digit salon code. Retries up to 10 times on collision (1-in-10000 chance per try). */
async function resolveUniqueCode(db: FirebaseFirestore.Firestore): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    const snap = await db.collection("salonCodes").doc(code).get();
    if (!snap.exists) return code;
  }
  throw new Error("code-collision");
}

/** Find an available slug. Appends -2, -3, … if taken. */
async function resolveUniqueSlug(db: FirebaseFirestore.Firestore, base: string): Promise<string> {
  const snap = await db.collection("salons").doc(base).get();
  if (!snap.exists) return base;
  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}-${i}`;
    const s = await db.collection("salons").doc(candidate).get();
    if (!s.exists) return candidate;
  }
  throw new Error("slug-collision");
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export async function POST(req: NextRequest) {
  // ── 1. Auth ───────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let uid: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(authHeader.slice(7));
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "invalid-token" }, { status: 401 });
  }

  // ── 2. Validate body ──────────────────────────────────────────────────────
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad-request", details: parsed.error.flatten() }, { status: 400 });
  }
  const { inviteCode, displayName, englishName, phone, address, openTime, closeTime, openDays, notificationEmail } = parsed.data;

  const db = getAdminDb();

  // ── 3–4. Atomically validate invite code + owner uniqueness ─────────────────
  // A transaction makes both checks race-safe: two concurrent onboard requests
  // with the same code, or from the same user, each consume at most one code slot
  // and create at most one salon — even under double-submit or parallel tabs.
  const codeRef = db.collection("inviteCodes").doc(inviteCode);
  try {
    await db.runTransaction(async (tx) => {
      const codeSnap = await tx.get(codeRef);
      if (!codeSnap.exists) throw Object.assign(new Error("invalid-invite-code"),   { httpStatus: 403 });
      const codeData = codeSnap.data()!;
      if (!codeData.active)  throw Object.assign(new Error("invite-code-inactive"), { httpStatus: 403 });
      const uses: number    = codeData.uses    ?? 0;
      const maxUses: number = codeData.maxUses ?? 1;
      if (uses >= maxUses)   throw Object.assign(new Error("invite-code-exhausted"), { httpStatus: 403 });

      const existingSnap = await tx.get(
        db.collection("salons").where("ownerUid", "==", uid).limit(1) as FirebaseFirestore.Query
      );
      if (!existingSnap.empty) {
        const existingId = existingSnap.docs[0].id;
        throw Object.assign(new Error("already-owner"), { httpStatus: 409, salonId: existingId });
      }

      // Atomically consume one use of the invite code.
      tx.update(codeRef, {
        uses: uses + 1,
        ...(uses + 1 >= maxUses ? { active: false } : {}),
        lastUsedBy: uid,
        lastUsedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (err: unknown) {
    const e = err as Error & { httpStatus?: number; salonId?: string };
    if (e.httpStatus) {
      const body: Record<string, unknown> = { error: e.message };
      if (e.salonId) body.salonId = e.salonId;
      return NextResponse.json(body, { status: e.httpStatus });
    }
    throw err;
  }

  // ── 5. Generate unique salonId slug ───────────────────────────────────────
  // Owner-chosen English name for the URL; falls back to auto-transliterating the
  // Hebrew display name when left empty.
  const base = slugify(englishName || displayName) || "salon";
  let salonId: string;
  try {
    salonId = await resolveUniqueSlug(db, base);
  } catch {
    return NextResponse.json({ error: "slug-collision" }, { status: 500 });
  }

  let salonCode: string;
  try {
    salonCode = await resolveUniqueCode(db);
  } catch {
    return NextResponse.json({ error: "code-collision" }, { status: 500 });
  }

  // ── 6. Build opening hours & availability rules ───────────────────────────
  const openDaysSet = new Set(openDays);
  const openingHours = Object.fromEntries(
    DAY_KEYS.map((key, idx) => [
      key,
      { open: openTime, close: closeTime, isOpen: openDaysSet.has(idx) },
    ])
  ) as Record<typeof DAY_KEYS[number], { open: string; close: string; isOpen: boolean }>;

  const rawPhone = phone.replace(/\D/g, "");
  const normalizedPhone = rawPhone.startsWith("0") ? rawPhone : `0${rawPhone}`;
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  // ── 7. Atomic write ───────────────────────────────────────────────────────
  const salonRef = db.collection("salons").doc(salonId);
  const batch = db.batch();

  // Public booking link, stored for convenience (Console visibility / sharing).
  // Derived from the slug — if the app domain ever changes this needs updating.
  const appUrl = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const bookingUrl = appUrl ? `${appUrl}/${salonId}` : `/${salonId}`;

  // salons/{salonId}
  batch.set(salonRef, {
    slug: salonId,
    displayName,
    ownerUid: uid,
    status: "active",
    bookingUrl,
    salonCode,
    createdAt: FieldValue.serverTimestamp(),
  });

  // salonCodes/{code} — reverse-index for native app first-launch binding
  batch.set(db.collection("salonCodes").doc(salonCode), {
    salonId,
    createdAt: FieldValue.serverTimestamp(),
  });

  // clinicSettings/main
  batch.set(salonRef.collection("clinicSettings").doc("main"), {
    name: displayName,
    phone: normalizedPhone,
    whatsappNumber: normalizedPhone,
    address,
    googleMapsUrl,
    instagramUrl: "",
    openingHours,
    galleryImages: [],
  });

  // paymentSettings/main
  batch.set(salonRef.collection("paymentSettings").doc("main"), {
    bitPhoneNumber: normalizedPhone,
    bitQrImageUrl: "",
    bitPayUrl: "",
    payboxPhoneNumber: normalizedPhone,
  });

  // availabilityRules — one recurring rule per open day
  for (const dayIdx of openDays) {
    const ruleRef = salonRef.collection("availabilityRules").doc();
    batch.set(ruleRef, {
      type: "recurring",
      dayOfWeek: dayIdx,
      openTime,
      closeTime,
      isOpen: true,
    });
  }

  // seed the owner's PRIVATE notification email (where booking alerts are sent)
  if (notificationEmail) {
    batch.set(db.collection("users").doc(uid), { notificationEmail }, { merge: true });
  }

  // Note: invite code consumption was already committed atomically in the transaction
  // above (steps 3–4). Do NOT update codeRef here.

  await batch.commit();

  return NextResponse.json({ salonId, salonCode });
}
