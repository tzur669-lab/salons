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

export interface BookSlotParams {
  salonId: string;
  dayKey: string;
  dayStart: Timestamp;
  dayEnd: Timestamp;
  start: Date;
  end: Date;
  /** Target status collection, e.g. "appointmentsPending" | "appointmentsApproved". */
  targetCollection: string;
  /** The full appointment document to write (server timestamps included by caller). */
  apptData: Record<string, unknown>;
  /** Appointment id to ignore in the overlap check (reschedule — skip own slot). */
  excludeId?: string;
}

/**
 * The single slot-allocating primitive. EVERY path that places an appointment on
 * the timeline (client booking, admin manual create, reschedule) MUST go through
 * this so the per-day mutex + overlap check are enforced atomically. Throws
 * `Error("SLOT_TAKEN")` when the interval overlaps an existing pending/approved
 * appointment. Returns the new document id.
 */
export async function bookSlotTx(db: Firestore, params: BookSlotParams): Promise<string> {
  const salonRef = db.collection("salons").doc(params.salonId);
  const newRef = salonRef.collection(params.targetCollection).doc();

  await db.runTransaction(async (tx) => {
    const { taken, lockRef } = await readLockAndCheckOverlap(
      db, tx, params.salonId, params.dayKey, params.dayStart, params.dayEnd,
      params.start, params.end, params.excludeId
    );
    if (taken) throw new Error("SLOT_TAKEN");
    tx.set(lockRef, lockBumpData(params.dayKey), { merge: true });
    tx.create(newRef, params.apptData);
  });

  return newRef.id;
}
