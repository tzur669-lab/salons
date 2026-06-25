import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { buildGoogleCalendarLink } from "@/lib/google-calendar";
import type { Timestamp } from "firebase-admin/firestore";

// firebase-admin uses Node APIs → must NOT run on the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Status-bucketed collections — the appointment lives in exactly one of them.
// Approved first since that is the common case for an approval calendar link.
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

/**
 * Short, shareable calendar link: GET /cal/[id] looks up the appointment via the
 * Admin SDK and 302-redirects to the (inherently long) Google Calendar
 * "add event" URL built from the live appointment data. This keeps the WhatsApp
 * approval message short and clean.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const home = new URL("/", req.url);

  if (!id) return NextResponse.redirect(home, 302);

  try {
    const db = getAdminDb();

    let appt: AppointmentDoc | null = null;
    for (const coll of COLLECTIONS) {
      const snap = await db.collection(coll).doc(id).get();
      if (snap.exists) {
        appt = snap.data() as AppointmentDoc;
        break;
      }
    }

    if (!appt || !appt.startTime || !appt.endTime) {
      return NextResponse.redirect(home, 302);
    }

    // Clinic address (best-effort — the event is still valid without a location).
    let address: string | undefined;
    try {
      const clinicSnap = await db.collection("clinicSettings").doc("main").get();
      const addr = clinicSnap.data()?.address;
      if (typeof addr === "string" && addr.trim()) address = addr;
    } catch {
      // ignore — location is optional
    }

    const calendarUrl = buildGoogleCalendarLink({
      title: `תור ל${appt.serviceName} רני חנימוב`,
      startTime: appt.startTime.toDate(),
      endTime: appt.endTime.toDate(),
      description: `שירות: ${appt.serviceName}`,
      location: address,
    });

    return NextResponse.redirect(calendarUrl, 302);
  } catch (err) {
    console.error("[cal/[id]] redirect failed:", err);
    return NextResponse.redirect(home, 302);
  }
}
