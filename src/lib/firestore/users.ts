import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { salonCol } from "@/lib/salon-path";
import type { AppUser, ClientNote } from "@/types";

// ── User CRUD (global — users/ stays at the Firestore root) ──────────────────

export async function getUser(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as AppUser;
}

export async function createUser(
  uid: string,
  data: Omit<AppUser, "id" | "createdAt" | "phoneVerified">
): Promise<void> {
  await setDoc(doc(db, "users", uid), {
    ...data,
    role: "client",
    createdAt: serverTimestamp(),
    phoneVerified: false,
  });
}

export async function updateUserPhone(uid: string, phone: string, verified = true): Promise<void> {
  await updateDoc(doc(db, "users", uid), { phone, phoneVerified: verified });
}

export async function setHistoryClearedAt(uid: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), { historyClearedAt: serverTimestamp() });
}

/**
 * A salon's own clients, read from the per-salon directory
 * (salons/{salonId}/clients). Replaces the old getAllClients() global scan that
 * read every "client" user across the whole platform (cross-tenant leak + cost).
 */
export async function getSalonClients(salonId: string): Promise<AppUser[]> {
  const snap = await getDocs(salonCol(salonId, "clients"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AppUser);
}

// ── Client notes (per-salon, lives under salons/{salonId}/clientNotes/) ───────

export async function addClientNote(
  salonId: string,
  clientId: string,
  note: string,
  adminId: string
): Promise<ClientNote> {
  const col = salonCol(salonId, "clientNotes");
  const ref = doc(col);
  await setDoc(ref, {
    clientId,
    note,
    createdAt: serverTimestamp(),
    updatedBy: adminId,
  });
  return { id: ref.id, clientId, note, createdAt: null as any, updatedBy: adminId };
}

export async function getClientNotes(salonId: string, clientId: string): Promise<ClientNote[]> {
  const q = query(
    salonCol(salonId, "clientNotes"),
    where("clientId", "==", clientId)
  );
  const snap = await getDocs(q);
  const notes = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClientNote);
  return notes.sort((a, b) => {
    const at = a.createdAt?.toDate?.()?.getTime() ?? 0;
    const bt = b.createdAt?.toDate?.()?.getTime() ?? 0;
    return bt - at;
  });
}
