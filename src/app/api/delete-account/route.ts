import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

// firebase-admin uses Node APIs → must NOT run on the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Permanently deletes the authenticated user's account and all associated data.
 * Required by Apple App Store Guideline 5.1.1(v).
 *
 * Multi-tenant: a user may have data in MANY salons, so every sweep is a
 * collectionGroup query keyed by clientId == uid (per-salon subcollections live at
 * salons/{salonId}/...). Previously these queried root-level collections that don't
 * exist in the multi-tenant model, so NOTHING was actually deleted. Auth is removed
 * LAST so a mid-way failure stays retryable (the caller's ID token keeps verifying):
 *   1. pushTokens/{uid} + its tokens/ subcollection (recursiveDelete)
 *   2. the user's appointments in every salon → ANONYMIZED (name/phone cleared,
 *      clientId severed) rather than deleted, so each salon keeps its schedule/stats
 *      with zero personal data — see HANDOFF "account deletion".
 *   3. clientNotes about the user (every salon)
 *   4. per-salon client-directory entries (salons/{salonId}/clients/{uid})
 *   5. users/{uid}
 *   6. revoke refresh tokens, then delete the Auth user
 */
const APPOINTMENT_COLLECTIONS = [
  "appointmentsPending",
  "appointmentsApproved",
  "appointmentsRejected",
  "appointmentsCompleted",
];

export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idToken = authHeader.slice(7);
  let uid: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    // 1. Push tokens (doc + tokens/ subcollection).
    await adminDb.recursiveDelete(adminDb.collection("pushTokens").doc(uid)).catch(() => {});

    // 2. Anonymize the user's appointments in every salon (strip PII, sever link).
    for (const coll of APPOINTMENT_COLLECTIONS) {
      const snap = await adminDb.collectionGroup(coll).where("clientId", "==", uid).get();
      if (snap.empty) continue;
      // Chunk into batches well under the 500-op limit.
      let batch = adminDb.batch();
      let ops = 0;
      for (const docSnap of snap.docs) {
        batch.update(docSnap.ref, {
          clientId: "deleted",
          clientName: "(חשבון נמחק)",
          clientPhone: "",
          updatedAt: Timestamp.now(),
        });
        if (++ops >= 400) {
          await batch.commit();
          batch = adminDb.batch();
          ops = 0;
        }
      }
      if (ops > 0) await batch.commit();
    }

    // 3. Admin notes about this client (every salon).
    const notesSnap = await adminDb.collectionGroup("clientNotes").where("clientId", "==", uid).get();
    if (!notesSnap.empty) {
      let batch = adminDb.batch();
      let ops = 0;
      for (const docSnap of notesSnap.docs) {
        batch.delete(docSnap.ref);
        if (++ops >= 400) {
          await batch.commit();
          batch = adminDb.batch();
          ops = 0;
        }
      }
      if (ops > 0) await batch.commit();
    }

    // 4. Per-salon client-directory entries (salons/{salonId}/clients/{uid}).
    const memberSnap = await adminDb.collectionGroup("clients").where("clientId", "==", uid).get();
    if (!memberSnap.empty) {
      let batch = adminDb.batch();
      let ops = 0;
      for (const docSnap of memberSnap.docs) {
        batch.delete(docSnap.ref);
        if (++ops >= 400) {
          await batch.commit();
          batch = adminDb.batch();
          ops = 0;
        }
      }
      if (ops > 0) await batch.commit();
    }

    // 5. The user document.
    await adminDb.collection("users").doc(uid).delete();

    // 5. Kill sessions, then remove the login itself (last → retry-safe).
    await adminAuth.revokeRefreshTokens(uid).catch(() => {});
    await adminAuth.deleteUser(uid);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[delete-account]", err);
    return NextResponse.json({ error: "Deletion failed" }, { status: 500 });
  }
}
