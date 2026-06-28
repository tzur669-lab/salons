/**
 * SERVER-ONLY. Reads the salons/{salonId} root document via the Admin SDK for
 * server components and route handlers. Reuses the lazy, memoized `getAdminDb()`
 * (HMR-safe: guards on getApps().length so hot-reload never re-initializes).
 *
 * Returns only plain string fields — the `createdAt` Timestamp is intentionally
 * omitted so the result crosses the RSC→client props boundary without conversion.
 * Never import into a client component.
 */
import { getAdminDb } from "@/lib/firebase-admin";

export interface SalonBasic {
  displayName: string;
  status: "active" | "inactive";
}

export async function getSalonServer(salonId: string): Promise<SalonBasic | null> {
  try {
    const snap = await getAdminDb().collection("salons").doc(salonId).get();
    if (!snap.exists) return null;
    const data = snap.data() as { displayName?: string; status?: string };
    return {
      displayName: data.displayName ?? salonId,
      status: (data.status ?? "inactive") as "active" | "inactive",
    };
  } catch (err) {
    console.error("getSalonServer failed:", err);
    return null;
  }
}
