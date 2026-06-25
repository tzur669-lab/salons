import {
  updateDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  Timestamp,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { salonCol, salonSubDoc } from "@/lib/salon-path";
import type { Appointment, AppointmentStatus } from "@/types";

// ─── Four collections by status ────────────────────────────────────────────
const COLL_PENDING   = "appointmentsPending";
const COLL_APPROVED  = "appointmentsApproved";
const COLL_REJECTED  = "appointmentsRejected";
const COLL_COMPLETED = "appointmentsCompleted";
const ALL_COLLS      = [COLL_PENDING, COLL_APPROVED, COLL_REJECTED, COLL_COMPLETED] as const;

function collectionForStatus(status: AppointmentStatus): string {
  if (status === "approved")                           return COLL_APPROVED;
  if (status === "completed")                          return COLL_COMPLETED;
  if (status === "rejected" || status === "cancelled") return COLL_REJECTED;
  return COLL_PENDING;
}

async function safeDocs(salonId: string, q: ReturnType<typeof query>): Promise<Appointment[]> {
  try {
    const snap = await getDocs(q);
    return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()) as Appointment);
  } catch (err) {
    console.warn("[appointments] query failed, skipping collection:", err);
    return [];
  }
}

async function findCollection(
  salonId: string,
  id: string
): Promise<{ coll: string; data: Record<string, unknown> } | null> {
  for (const coll of ALL_COLLS) {
    const s = await getDoc(salonSubDoc(salonId, coll, id));
    if (s.exists()) return { coll, data: s.data() as Record<string, unknown> };
  }
  return null;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function getAppointment(salonId: string, id: string): Promise<Appointment | null> {
  for (const coll of ALL_COLLS) {
    const snap = await getDoc(salonSubDoc(salonId, coll, id));
    if (snap.exists()) return { id: snap.id, ...snap.data() } as Appointment;
  }
  return null;
}

export async function getClientAppointments(salonId: string, clientId: string): Promise<Appointment[]> {
  const results = await Promise.all(
    ALL_COLLS.map((coll) =>
      safeDocs(salonId, query(salonCol(salonId, coll), where("clientId", "==", clientId)))
    )
  );
  return results
    .flat()
    .sort((a, b) => b.startTime.toMillis() - a.startTime.toMillis());
}

export async function getAllAppointments(salonId: string): Promise<Appointment[]> {
  const results = await Promise.all(
    ALL_COLLS.map((coll) =>
      safeDocs(salonId, query(salonCol(salonId, coll), orderBy("startTime", "desc")))
    )
  );
  return results
    .flat()
    .sort((a, b) => b.startTime.toMillis() - a.startTime.toMillis());
}

export async function getTodayAppointments(salonId: string): Promise<Appointment[]> {
  const start = new Date(); start.setHours(0,  0,  0,   0);
  const end   = new Date(); end.setHours(23, 59, 59, 999);
  const results = await Promise.all(
    [COLL_PENDING, COLL_APPROVED, COLL_COMPLETED].map((coll) =>
      safeDocs(salonId, query(
        salonCol(salonId, coll),
        where("startTime", ">=", Timestamp.fromDate(start)),
        where("startTime", "<=", Timestamp.fromDate(end)),
        orderBy("startTime")
      ))
    )
  );
  return results
    .flat()
    .sort((a, b) => a.startTime.toMillis() - b.startTime.toMillis());
}

export async function updateAppointmentStatus(
  salonId: string,
  id: string,
  newStatus: AppointmentStatus
): Promise<void> {
  const found = await findCollection(salonId, id);
  if (!found) throw new Error(`Appointment ${id} not found in any collection`);

  const targetColl = collectionForStatus(newStatus);

  if (found.coll === targetColl) {
    await updateDoc(salonSubDoc(salonId, found.coll, id), {
      status:    newStatus,
      updatedAt: serverTimestamp(),
    });
  } else {
    const batch = writeBatch(db);
    batch.set(salonSubDoc(salonId, targetColl, id), {
      ...found.data,
      status:    newStatus,
      updatedAt: serverTimestamp(),
    });
    batch.delete(salonSubDoc(salonId, found.coll, id));
    await batch.commit();
  }
}

export async function cancelAppointment(salonId: string, id: string): Promise<void> {
  return updateAppointmentStatus(salonId, id, "cancelled");
}

export async function getUpcomingAppointments(salonId: string): Promise<Appointment[]> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const results = await Promise.all(
    [COLL_PENDING, COLL_APPROVED].map((coll) =>
      safeDocs(salonId, query(
        salonCol(salonId, coll),
        where("startTime", ">=", Timestamp.fromDate(tomorrow)),
        orderBy("startTime")
      ))
    )
  );
  return results
    .flat()
    .sort((a, b) => a.startTime.toMillis() - b.startTime.toMillis());
}

export function subscribeToPendingAppointments(
  salonId: string,
  callback: (appointments: Appointment[]) => void
): () => void {
  return onSnapshot(
    query(salonCol(salonId, COLL_PENDING), orderBy("createdAt", "desc")),
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Appointment));
    },
    (err) => {
      console.warn("[appointments] pending snapshot failed:", err);
    }
  );
}

export function subscribeToAppointments(
  salonId: string,
  callback: (appointments: Appointment[]) => void
): () => void {
  const buckets = new Map<string, Map<string, Appointment>>(
    ALL_COLLS.map((c) => [c, new Map()])
  );

  function emit() {
    const all = Array.from(buckets.values())
      .flatMap((m) => Array.from(m.values()))
      .sort((a, b) => b.startTime.toMillis() - a.startTime.toMillis());
    callback(all);
  }

  const unsubs = ALL_COLLS.map((coll) =>
    onSnapshot(
      query(salonCol(salonId, coll), orderBy("startTime", "desc")),
      (snap) => {
        const map = buckets.get(coll)!;
        map.clear();
        snap.docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() } as Appointment));
        emit();
      },
      (err) => {
        console.warn(`[appointments] snapshot on '${coll}' failed:`, err);
      }
    )
  );

  return () => unsubs.forEach((u) => u());
}

export async function markPastAppointmentsAsCompleted(salonId: string): Promise<number> {
  const now = Timestamp.now();
  const snap = await getDocs(
    query(salonCol(salonId, COLL_APPROVED), where("endTime", "<=", now))
  );
  const docsToMove = snap.docs.filter((d) => d.data().status === "approved");
  if (docsToMove.length === 0) return 0;

  const batch = writeBatch(db);
  docsToMove.forEach((d) => {
    batch.set(salonSubDoc(salonId, COLL_COMPLETED, d.id), {
      ...d.data(),
      status: "completed",
      updatedAt: serverTimestamp(),
    });
    batch.delete(salonSubDoc(salonId, COLL_APPROVED, d.id));
  });
  await batch.commit();
  return docsToMove.length;
}
