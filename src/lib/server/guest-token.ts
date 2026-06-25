import { createHash } from "crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";

/**
 * SERVER-ONLY. Shared helpers for the guest appointment-recovery flow.
 * Token lookup is now scoped to a specific salon for isolation.
 */

const GUEST_COLLS = [
  "appointmentsPending",
  "appointmentsApproved",
  "appointmentsRejected",
  "appointmentsCompleted",
] as const;

export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface GuestAppointmentLookup {
  salonId: string;
  coll: string;
  id: string;
  data: FirebaseFirestore.DocumentData;
}

/** Find the appointment whose stored hash matches this token within a specific salon. */
export async function findAppointmentByGuestToken(
  salonId: string,
  token: string
): Promise<GuestAppointmentLookup | null> {
  const adminDb = getAdminDb();
  const hash = hashGuestToken(token);
  const salonRef = adminDb.collection("salons").doc(salonId);

  for (const coll of GUEST_COLLS) {
    const snap = await salonRef
      .collection(coll)
      .where("guestAccessTokenHash", "==", hash)
      .limit(1)
      .get();
    if (!snap.empty) {
      const d = snap.docs[0];
      return { salonId, coll, id: d.id, data: d.data() };
    }
  }
  return null;
}

/** Trim a stored appointment document down to the fields a guest may see. */
export function toGuestView(lookup: GuestAppointmentLookup) {
  const d = lookup.data;
  const start = d.startTime as Timestamp | undefined;
  const end   = d.endTime   as Timestamp | undefined;
  return {
    id: lookup.id,
    serviceName:     (d.serviceName     as string)           ?? "",
    servicePrice:    (d.servicePrice    as number | undefined) ?? null,
    serviceDuration: (d.serviceDuration as number | undefined) ?? null,
    clientName:      (d.clientName      as string)           ?? "",
    startTime: start ? start.toDate().toISOString() : null,
    endTime:   end   ? end.toDate().toISOString()   : null,
    status:    (d.status as string) ?? "pending",
  };
}
