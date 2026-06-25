import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Salon } from "@/types";

/** Fetch a salon doc by its slug/ID. Returns null if missing. */
export async function getSalon(salonId: string): Promise<Salon | null> {
  const snap = await getDoc(doc(db, "salons", salonId));
  if (!snap.exists()) return null;
  return { slug: snap.id, ...snap.data() } as Salon;
}

/** Create a new salon document (called by the onboard API route via Admin SDK). */
export async function createSalon(
  salonId: string,
  data: Omit<Salon, "slug" | "createdAt">
): Promise<void> {
  await setDoc(doc(db, "salons", salonId), {
    ...data,
    slug: salonId,
    status: "active",
    createdAt: serverTimestamp(),
  });
}

/** Update a salon's top-level fields. */
export async function updateSalon(
  salonId: string,
  data: Partial<Omit<Salon, "slug" | "createdAt" | "ownerUid">>
): Promise<void> {
  await updateDoc(doc(db, "salons", salonId), data);
}
