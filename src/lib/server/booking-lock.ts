import { Timestamp } from "firebase-admin/firestore";
import type { Firestore, Transaction, DocumentReference } from "firebase-admin/firestore";

/**
 * SERVER-ONLY. Per-salon double-booking prevention via a per-day mutex doc
 * at salons/{salonId}/slotLocks/{dayKey}.
 *
 * See the original design rationale in the Roni Nails codebase. The mechanism
 * is unchanged — only the Firestore path is now salon-scoped.
 */

// Collections (relative to the salon) whose docs occupy a slot.
const ACTIVE_COLLS = ["appointmentsPending", "appointmentsApproved"] as const;

export interface OverlapCheckResult {
  taken: boolean;
  lockRef: DocumentReference;
}

/**
 * Reads the per-salon day mutex and re-queries that salon's active appointments
 * to check for overlaps. All reads; caller writes lockRef + appointment after.
 *
 * @param excludeId  appointment ID to ignore (for reschedule — skip own slot).
 */
export async function readLockAndCheckOverlap(
  db: Firestore,
  tx: Transaction,
  salonId: string,
  dayKey: string,
  dayStart: Timestamp,
  dayEnd: Timestamp,
  start: Date,
  end: Date,
  excludeId?: string
): Promise<OverlapCheckResult> {
  const salonRef = db.collection("salons").doc(salonId);
  const lockRef = salonRef.collection("slotLocks").doc(dayKey);

  // 1. Read the mutex — forces competing transactions for the same day to retry.
  await tx.get(lockRef);

  // 2. Re-query that salon's active appointments inside the transaction.
  const snaps = await Promise.all(
    ACTIVE_COLLS.map((c) =>
      tx.get(
        salonRef
          .collection(c)
          .where("startTime", ">=", dayStart)
          .where("startTime", "<", dayEnd)
      )
    )
  );

  const startMs = start.getTime();
  const endMs   = end.getTime();
  let taken = false;

  for (const snap of snaps) {
    for (const docSnap of snap.docs) {
      if (excludeId && docSnap.id === excludeId) continue;
      const d = docSnap.data();
      if (d.status !== "pending" && d.status !== "approved") continue;
      const st = d.startTime as Timestamp | undefined;
      const et = d.endTime  as Timestamp | undefined;
      if (!st || !et) continue;
      if (startMs < et.toMillis() && endMs > st.toMillis()) {
        taken = true;
        break;
      }
    }
    if (taken) break;
  }

  return { taken, lockRef };
}

/** Mutex bump data written by the caller after a successful (not-taken) check. */
export function lockBumpData(dayKey: string): Record<string, unknown> {
  return { dayKey, lastBookingAt: Timestamp.now() };
}
