import { createHash } from "crypto";
import { getAdminDb } from "@/lib/firebase-admin";

/**
 * Server-side (Admin SDK) helpers for per-user FCM device tokens.
 *
 * Schema: `pushTokens/{uid}/tokens/{tokenHash}` → { token, platform, updatedAt }
 * where tokenHash = sha256(token). One doc PER DEVICE, so a user can have an
 * Android app AND an iPhone PWA at the same time without one overwriting the
 * other (the bug with the old single `pushTokens/{uid}.token` field).
 *
 * Back-compat: getTokens() also reads the legacy top-level `pushTokens/{uid}.token`
 * so devices registered before this change keep receiving until they re-register
 * into the subcollection on next launch. Tokens are deduped across both sources.
 */

export type PushPlatform = "android" | "ios" | "web";

const PUSH_TOKENS_COLL = "pushTokens";
const TOKENS_SUB = "tokens";

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Store/refresh a device token under the user (idempotent on the token value). */
export async function saveToken(uid: string, token: string, platform: PushPlatform): Promise<void> {
  const db = getAdminDb();
  await db
    .collection(PUSH_TOKENS_COLL)
    .doc(uid)
    .collection(TOKENS_SUB)
    .doc(tokenHash(token))
    .set({ token, platform, updatedAt: new Date().toISOString() }, { merge: true });
}

/** Remove a specific device token (prune-on-failure, or logout). */
export async function deleteToken(uid: string, token: string): Promise<void> {
  const db = getAdminDb();
  await db
    .collection(PUSH_TOKENS_COLL)
    .doc(uid)
    .collection(TOKENS_SUB)
    .doc(tokenHash(token))
    .delete()
    .catch(() => {});
  // Also clear the legacy top-level token if it matches, so it isn't re-sent.
  const legacyRef = db.collection(PUSH_TOKENS_COLL).doc(uid);
  const legacy = await legacyRef.get();
  if (legacy.data()?.token === token) {
    await legacyRef.delete().catch(() => {});
  }
}

/** All distinct device tokens for one user (subcollection + legacy field). */
export async function getTokens(uid: string): Promise<string[]> {
  const db = getAdminDb();
  const userRef = db.collection(PUSH_TOKENS_COLL).doc(uid);
  const [subSnap, legacySnap] = await Promise.all([
    userRef.collection(TOKENS_SUB).get(),
    userRef.get(),
  ]);
  const tokens = new Set<string>();
  subSnap.forEach((d) => {
    const t = d.data()?.token as string | undefined;
    if (t) tokens.add(t);
  });
  const legacy = legacySnap.data()?.token as string | undefined;
  if (legacy) tokens.add(legacy);
  return [...tokens];
}

/**
 * All uids that have at least one registered device (subcollection parent OR
 * legacy doc). `listDocuments()` returns parents that exist ONLY via a
 * subcollection (the new per-device schema), which a normal `.get()` query
 * would miss. Used by the admin "update available" broadcast.
 */
export async function getAllUidsWithTokens(): Promise<string[]> {
  const db = getAdminDb();
  const refs = await db.collection(PUSH_TOKENS_COLL).listDocuments();
  return refs.map((r) => r.id);
}

/** Batched per-user token lookup for the cron (small N — capped upstream). */
export async function getTokensForUsers(uids: string[]): Promise<Map<string, string[]>> {
  const unique = [...new Set(uids)];
  const entries = await Promise.all(
    unique.map(async (uid) => [uid, await getTokens(uid)] as const)
  );
  return new Map(entries);
}

/** Most recent updatedAt + token count for a user (diagnostics). */
export async function getTokenStatus(uid: string): Promise<{ count: number; latest: string | null }> {
  const db = getAdminDb();
  const userRef = db.collection(PUSH_TOKENS_COLL).doc(uid);
  const [subSnap, legacySnap] = await Promise.all([
    userRef.collection(TOKENS_SUB).get(),
    userRef.get(),
  ]);
  let latest: string | null = null;
  const seen = new Set<string>();
  const consider = (token?: string, updatedAt?: string) => {
    if (!token || seen.has(token)) return;
    seen.add(token);
    if (updatedAt && (!latest || updatedAt > latest)) latest = updatedAt;
  };
  subSnap.forEach((d) => consider(d.data()?.token, d.data()?.updatedAt));
  consider(legacySnap.data()?.token, legacySnap.data()?.updatedAt);
  return { count: seen.size, latest };
}
