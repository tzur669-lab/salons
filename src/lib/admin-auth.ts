import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

/**
 * SERVER-ONLY. The single source of truth for "is this request from the owner
 * of salon X?".
 *
 * Owner === the verified UID matches salons/{salonId}.ownerUid in Firestore.
 * There is no global admin role in the multi-tenant platform. Each salon has
 * exactly one owner (the technician who created it via /onboard).
 *
 * Returns { uid } on success, or { error } with a reason for the HTTP response.
 */
export type AdminAuthResult =
  | { uid: string }
  | { error: "unauthorized" | "invalid-token" | "forbidden" };

export async function verifySalonOwner(
  authHeader: string | null,
  salonId: string
): Promise<AdminAuthResult> {
  if (!authHeader?.startsWith("Bearer ")) return { error: "unauthorized" };

  let uid: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(authHeader.slice(7));
    uid = decoded.uid;
  } catch {
    return { error: "invalid-token" };
  }

  const salonSnap = await getAdminDb()
    .collection("salons")
    .doc(salonId)
    .get();

  if (salonSnap.data()?.ownerUid === uid) return { uid };

  return { error: "forbidden" };
}

/** Maps an auth error to its HTTP status. */
export function adminErrorStatus(
  error: "unauthorized" | "invalid-token" | "forbidden"
): number {
  return error === "forbidden" ? 403 : 401;
}
