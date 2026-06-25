import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { rateKey, checkRateLimit } from "@/lib/server/rate-limit";
import { e164ToLocal } from "@/lib/phone";

// firebase-admin uses Node APIs → must NOT run on the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phone-based password reset for LOGGED-OUT users (login screen "שכחתי סיסמה" → SMS).
 *
 * The client proves possession of a phone via Firebase phone-auth OTP
 * (signInWithPhoneNumber → confirm), which signs it into a phone-keyed session and
 * yields an ID token whose `phone_number` claim is cryptographically verified. It
 * then POSTs that token here. We NEVER trust a client-typed phone string — only the
 * verified claim — and resolve the REAL account server-side via the Admin SDK.
 *
 * Two bugs this route fixes vs. the old client-only flow:
 *  - The old code looked up `users` by phone from an UNAUTHENTICATED client → the
 *    tightened firestore.rules denied it (permission-denied), so SMS never worked.
 *  - `signInWithPhoneNumber` created a brand-new GHOST Auth account (phones were
 *    never linked as a phone provider), and `updatePassword` set the password on the
 *    ghost, not the real account. Here the server resets the REAL account, deletes
 *    the ghost, and LINKS the phone number to the real account so the ghost is never
 *    recreated again.
 */

const PHONE_MAX_ATTEMPTS = 5; // one phone: 5 reset attempts / 15 min
const IP_MAX_ATTEMPTS = 20; // one IP can't grind many phones
const AUTH_FRESHNESS_SECONDS = 15 * 60; // the OTP session must be recent

interface Candidate {
  uid: string;
  name: string;
}

export async function POST(req: NextRequest) {
  try {
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    // ── 1. Body ──
    const body = (await req.json().catch(() => ({}))) as {
      newPassword?: string;
      disambiguateIndex?: number;
    };
    const { newPassword, disambiguateIndex } = body;
    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: "weak_password" }, { status: 400 });
    }

    // ── 2. Verify the OTP-proven ID token ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);

    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }

    const phoneNumber = decoded.phone_number;
    if (!phoneNumber) {
      return NextResponse.json({ error: "no_phone" }, { status: 403 });
    }
    // The phone session must be recent — don't let an old token be replayed.
    if (Date.now() / 1000 - (decoded.auth_time ?? 0) > AUTH_FRESHNESS_SECONDS) {
      return NextResponse.json({ error: "stale_auth" }, { status: 401 });
    }

    // ── 3. Rate limit (per phone + per IP) ──
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    if (!(await checkRateLimit(rateKey("rpphone", phoneNumber), PHONE_MAX_ATTEMPTS))) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    if (!(await checkRateLimit(rateKey("rpip", ip), IP_MAX_ATTEMPTS))) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    // ── 4. Resolve real account(s) by the VERIFIED phone ──
    const localPhone = e164ToLocal(phoneNumber);
    const usersSnap = await adminDb
      .collection("users")
      .where("phone", "==", localPhone)
      .limit(10)
      .get();

    // Sort by uid so candidate order — and disambiguateIndex — is stable across requests.
    const candidates: Candidate[] = usersSnap.docs
      .map((d) => ({ uid: d.id, name: (d.data().name as string) ?? "" }))
      .sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));

    const callerUid = decoded.uid;

    // Ghost = the throwaway phone-only account the OTP just signed into. Safety rail:
    // only ever delete an account that has NO email and ONLY phone providers, and is
    // not itself a matched candidate. A real account always has a password/google
    // provider, so this can never delete a real user.
    async function isGhost(uid: string): Promise<boolean> {
      if (candidates.some((c) => c.uid === uid)) return false;
      try {
        const u = await adminAuth.getUser(uid);
        return !u.email && u.providerData.every((p) => p.providerId === "phone");
      } catch {
        return false;
      }
    }

    async function deleteGhost(uid: string): Promise<void> {
      await adminDb.recursiveDelete(adminDb.collection("pushTokens").doc(uid)).catch(() => {});
      await adminDb.collection("users").doc(uid).delete().catch(() => {});
      await adminAuth.deleteUser(uid).catch(() => {});
    }

    // ── 5. No account registered to this phone ──
    if (candidates.length === 0) {
      if (await isGhost(callerUid)) await deleteGhost(callerUid);
      return NextResponse.json({ error: "phone_not_found" }, { status: 404 });
    }

    // ── 6. Multiple accounts share this phone → disambiguate (caller proved the phone) ──
    const hasValidIndex =
      disambiguateIndex !== undefined &&
      disambiguateIndex >= 0 &&
      disambiguateIndex < candidates.length;

    if (candidates.length > 1 && !hasValidIndex) {
      return NextResponse.json({
        type: "ambiguous",
        accounts: candidates.map((c, index) => ({ index, name: c.name })),
      });
    }

    const target = hasValidIndex ? candidates[disambiguateIndex!] : candidates[0];

    // The salon owner's account is recoverable by email only.
    if (target.uid === process.env.NEXT_PUBLIC_ADMIN_UID) {
      return NextResponse.json({ error: "admin_blocked" }, { status: 403 });
    }

    // ── 7. Clean up the ghost (frees the phone number in Auth) before linking ──
    if (callerUid !== target.uid && (await isGhost(callerUid))) {
      await deleteGhost(callerUid);
    }

    // ── 8. Reset the REAL account + link the phone so no ghost is recreated next time ──
    try {
      await adminAuth.updateUser(target.uid, {
        password: newPassword,
        phoneNumber,
      });
    } catch (err) {
      // Some other account legitimately holds this phone provider — still reset the
      // password, just don't move the number.
      if ((err as { code?: string })?.code === "auth/phone-number-already-exists") {
        await adminAuth.updateUser(target.uid, { password: newPassword });
      } else {
        throw err;
      }
    }

    // Post-reset hygiene: kill any existing sessions; the phone is now truly verified.
    await adminAuth.revokeRefreshTokens(target.uid).catch(() => {});
    await adminDb.collection("users").doc(target.uid).update({ phoneVerified: true }).catch(() => {});

    const token = await adminAuth.createCustomToken(target.uid);
    return NextResponse.json({ type: "success", token });
  } catch (err) {
    console.error("[reset-password-by-phone]", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
