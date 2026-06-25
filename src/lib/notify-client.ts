import { auth } from "@/lib/firebase";
import type { Appointment } from "@/types";

/** "ביום שני בשעה 16:00" — built on the admin's Israel-tz device so it matches
 *  the dashboard / WhatsApp exactly (no server-tz ambiguity). */
function whenPhrase(appt: Appointment): string {
  const start = appt.startTime.toDate();
  const weekday = start.toLocaleDateString("he-IL", { weekday: "long" }); // "יום שני"
  const time = start.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }); // "16:00"
  return `ב${weekday} בשעה ${time}`;
}

/**
 * Sends the client a native push about a status change to their appointment.
 *
 * The message is built on the caller's (admin's) device and POSTed to the
 * admin-authenticated `/api/notify-client-approval` route (generic: it accepts
 * any title/body and pushes to every one of the client's devices). `keepalive`
 * so the request still goes out when opening WhatsApp backgrounds the WebView.
 * No-op for guests / when no admin ID token is available.
 */
async function notifyClient(salonId: string, appt: Appointment, title: string, body: string, tag: string): Promise<void> {
  if (!appt.clientId || appt.clientId === "guest") return;
  try {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) return;

    await fetch("/api/notify-client-approval", {
      method: "POST",
      keepalive: true, // survive the WhatsApp navigation that follows
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        salonId,
        clientId: appt.clientId,
        title,
        body,
        appointmentId: appt.id,
      }),
    });
  } catch (e) {
    console.error(`[${tag}] failed`, e);
  }
}

/** Push: appointment approved. */
export async function notifyClientApproved(salonId: string, appt: Appointment): Promise<void> {
  const body = `התור '${appt.serviceName}' ${whenPhrase(appt)} אושר`;
  await notifyClient(salonId, appt, "התור שלך אושר ✓", body, "notifyClientApproved");
}

/** Push: appointment cancelled by the admin. */
export async function notifyClientCancelled(salonId: string, appt: Appointment): Promise<void> {
  const body = `התור '${appt.serviceName}' ${whenPhrase(appt)} בוטל`;
  await notifyClient(salonId, appt, "התור שלך בוטל", body, "notifyClientCancelled");
}

/** Push: appointment request rejected by the admin. */
export async function notifyClientRejected(salonId: string, appt: Appointment): Promise<void> {
  const body = `הבקשה לתור '${appt.serviceName}' ${whenPhrase(appt)} לא אושרה. אפשר לקבוע מועד אחר דרך האפליקציה.`;
  await notifyClient(salonId, appt, "עדכון לגבי התור שלך", body, "notifyClientRejected");
}
