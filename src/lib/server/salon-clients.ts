/**
 * SERVER-ONLY. Per-salon client membership index at salons/{salonId}/clients/{uid}.
 *
 * Fixes the cross-tenant leak where the admin client list and the "update" broadcast
 * scanned the GLOBAL users/ collection. The directory is now scoped per salon: a thin
 * record written server-side when a REGISTERED client books. Display fields (name/phone)
 * are denormalized "as last booked" — consistent with the existing point-in-time
 * clientName/clientPhone snapshots on appointment docs; the canonical identity stays in
 * users/{uid}. Guests and free-text admin entries (no real account) are not indexed.
 */
import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

const NON_ACCOUNT_IDS = new Set(["guest", "admin_entry", "deleted"]);

/** Upsert a registered client into the salon's directory. Best-effort; never throws into the caller. */
export async function upsertSalonClient(
  db: Firestore,
  salonId: string,
  client: { clientId: string; name: string; phone: string }
): Promise<void> {
  if (!client.clientId || NON_ACCOUNT_IDS.has(client.clientId)) return;
  await db
    .collection("salons").doc(salonId)
    .collection("clients").doc(client.clientId)
    .set(
      {
        clientId: client.clientId,
        name:  client.name  ?? "",
        phone: client.phone ?? "",
        lastSeenAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

/** UIDs of a salon's own clients — the recipient scope for owner broadcasts. */
export async function listSalonClientUids(db: Firestore, salonId: string): Promise<string[]> {
  const snap = await db.collection("salons").doc(salonId).collection("clients").get();
  return snap.docs.map((d) => d.id);
}
