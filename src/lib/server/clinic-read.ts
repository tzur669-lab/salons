/**
 * SERVER-ONLY. Reads salons/{salonId}/clinicSettings/main via the Admin SDK for
 * server components (the salon home + portfolio pages). Reuses the lazy, memoized
 * `getAdminDb()` (HMR-safe: it guards on getApps().length, so a dev-mode hot reload
 * never re-initializes the Admin app → no "duplicate app" crash).
 *
 * `ClinicSettings` has NO Firestore Timestamp fields (only strings/booleans/arrays),
 * so the returned object is plain JSON and crosses the RSC→client props boundary
 * without any Timestamp-serialization conversion. Never import into a client component.
 */
import { getAdminDb } from "@/lib/firebase-admin";
import { adminSalonSubDoc } from "@/lib/server/salon-path-admin";
import type { ClinicSettings } from "@/types";

export async function getClinicSettingsServer(
  salonId: string
): Promise<ClinicSettings | null> {
  try {
    const snap = await adminSalonSubDoc(getAdminDb(), salonId, "clinicSettings", "main").get();
    if (!snap.exists) return null;
    return snap.data() as ClinicSettings;
  } catch (err) {
    // A missing credential or transient read failure must not crash the page —
    // the client SalonProvider still loads/redirects. Treat as "no settings yet".
    console.error("getClinicSettingsServer failed:", err);
    return null;
  }
}
