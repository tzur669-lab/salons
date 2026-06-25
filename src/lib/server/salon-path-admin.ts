/**
 * SERVER-ONLY. Admin-SDK path helpers for the multi-tenant Firestore layout.
 * Use these inside API routes / cron handlers; never import into client components.
 */
import type { Firestore } from "firebase-admin/firestore";

/** Reference to salons/{salonId} parent document (Admin SDK). */
export const adminSalonDocRef = (db: Firestore, salonId: string) =>
  db.collection("salons").doc(salonId);

/** Reference to a subcollection under salons/{salonId} (Admin SDK). */
export const adminSalonCol = (db: Firestore, salonId: string, collName: string) =>
  db.collection("salons").doc(salonId).collection(collName);

/** Reference to a specific doc in a salon subcollection (Admin SDK). */
export const adminSalonSubDoc = (
  db: Firestore,
  salonId: string,
  collName: string,
  docId: string
) => db.collection("salons").doc(salonId).collection(collName).doc(docId);
