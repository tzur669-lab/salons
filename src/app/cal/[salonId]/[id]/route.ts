import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { buildGoogleCalendarLink } from "@/lib/google-calendar";
import type { Timestamp } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTIONS = [
  "appointmentsApproved",
  "appointmentsPending",
  "appointmentsCompleted",
  "appointmentsRejected",
] as const;

interface AppointmentDoc {
  serviceName: string;
  startTime: Timestamp;
  endTime: Timestamp;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ salonId: string; id: string }> }
) {
  const { salonId, id } = await params;
  const home = new URL("/", req.url);

  if (!salonId || !id) return NextResponse.redirect(home, 302);

  try {
    const db = getAdminDb();
    const salonRef = db.collection("salons").doc(salonId);

    let appt: AppointmentDoc | null = null;
    for (const coll of COLLECTIONS) {
      const snap = await salonRef.collection(coll).doc(id).get();
      if (snap.exists) {
        appt = snap.data() as AppointmentDoc;
        break;
      }
    }

    if (!appt || !appt.startTime || !appt.endTime) {
      return NextResponse.redirect(home, 302);
    }

    let address: string | undefined;
    let salonName: string | undefined;
    try {
      const salonSnap = await salonRef.get();
      salonName = salonSnap.data()?.displayName;
      const clinicSnap = await salonRef.collection("clinicSettings").doc("main").get();
      const addr = clinicSnap.data()?.address;
      if (typeof addr === "string" && addr.trim()) address = addr;
    } catch {
      // ignore — location and name are optional
    }

    const calendarUrl = buildGoogleCalendarLink({
      title: `תור ל${appt.serviceName}${salonName ? ` - ${salonName}` : ""}`,
      startTime: appt.startTime.toDate(),
      endTime: appt.endTime.toDate(),
      description: `שירות: ${appt.serviceName}`,
      location: address,
    });

    return NextResponse.redirect(calendarUrl, 302);
  } catch (err) {
    console.error("[cal/[salonId]/[id]] redirect failed:", err);
    return NextResponse.redirect(home, 302);
  }
}
