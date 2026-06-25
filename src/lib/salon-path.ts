/**
 * Client-SDK path helpers for the multi-tenant Firestore layout.
 * All per-salon data lives under salons/{salonId}/…
 * Global collections (users, pushTokens, loginRateLimit) stay at the root.
 */
import { collection, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

/** Reference to the salons/{salonId} parent document. */
export const salonDocRef = (salonId: string) =>
  doc(db, "salons", salonId);

/** Reference to a subcollection under salons/{salonId}. */
export const salonCol = (salonId: string, collName: string) =>
  collection(db, "salons", salonId, collName);

/** Reference to a specific document in a salon subcollection. */
export const salonSubDoc = (salonId: string, collName: string, docId: string) =>
  doc(db, "salons", salonId, collName, docId);
