import { getAdminDb } from "@/lib/firebase-admin";

/**
 * Server-only fixed-window rate limiter backed by Firestore `loginRateLimit/{key}`.
 *
 * The collection is `allow read, write: if false` in firestore.rules — only the
 * Admin SDK (which bypasses rules) touches it. Shared by every auth/recovery route
 * (login-by-name, reset-password-by-phone) so they don't each reimplement it.
 * Call these INSIDE a request handler, never at module scope (Admin SDK is lazy).
 */

const DEFAULT_WINDOW_MINUTES = 15;

/** Normalize an arbitrary value (name, phone, IP) into a safe Firestore doc id. */
export function rateKey(prefix: string, value: string): string {
  return `${prefix}_${value.toLowerCase().replace(/[^a-z0-9]+/gi, "_").slice(0, 60)}`;
}

/** Fixed-window counter in loginRateLimit/{key}. Returns false when over the limit. */
export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMinutes: number = DEFAULT_WINDOW_MINUTES
): Promise<boolean> {
  const adminDb = getAdminDb();
  const ref = adminDb.collection("loginRateLimit").doc(key);
  const now = Date.now();

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.set(ref, { count: 1, resetAt: now + windowMinutes * 60_000 });
      return true;
    }
    const { count, resetAt } = snap.data()!;
    if (now > resetAt) {
      tx.set(ref, { count: 1, resetAt: now + windowMinutes * 60_000 });
      return true;
    }
    if (count >= maxAttempts) return false;
    tx.update(ref, { count: count + 1 });
    return true;
  });
}
