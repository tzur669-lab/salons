import { formatHebrewFullDate } from "./hebrew-calendar";

interface WhatsAppParams {
  clientPhone: string;
  clientName: string;
  serviceName: string;
  startTime: Date;
  endTime: Date;
  clinicAddress?: string;
}

interface WhatsAppApprovalParams extends WhatsAppParams {
  /** Appointment id — used to build the short internal /cal/[id] redirect link. */
  appointmentId: string;
  /** Origin of the deployed app (e.g. window.location.origin). */
  baseUrl?: string;
}

/** First name only — "צורי חנימוב" → "צורי". */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName.trim();
}

// Unicode escapes instead of literal emoji — avoids CRLF/encoding corruption on Windows.
const HEART = "\u{1F90D}"; // 🤍 WHITE HEART

function formatTime(date: Date): string {
  return date.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

export function buildWhatsAppApprovalLink(params: WhatsAppApprovalParams): string {
  const { clientPhone, clientName, serviceName, startTime, appointmentId, baseUrl } = params;

  const dateStr = formatHebrewFullDate(startTime);
  const timeStr = formatTime(startTime);

  // Short internal link — the /cal/[id] route looks up the appointment server-side
  // and 302-redirects to the (very long) Google Calendar "add event" URL.
  const origin = baseUrl ?? (typeof window !== "undefined" ? window.location.origin : "");
  const calLink = `${origin}/cal/${appointmentId}`;

  const message = [
    `היי ${firstName(clientName)}${HEART}`,
    `התור שלך אושר ✓`,
    ``,
    `שירות: ${serviceName}`,
    `תאריך: ${dateStr}`,
    `שעה: ${timeStr}`,
    ``,
    `להוספה ליומן גוגל:`,
    calLink,
    ``,
    `מחכה לך!`,
  ].join("\n");

  const phone = clientPhone.replace(/\D/g, "").replace(/^0/, "972");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function buildWhatsAppCancellationLink(params: WhatsAppParams): string {
  const { clientPhone, clientName, serviceName, startTime } = params;

  const dateStr = formatHebrewFullDate(startTime);
  const timeStr = formatTime(startTime);

  const message = [
    `היי ${firstName(clientName)}${HEART}`,
    `לצערנו נאלצנו לבטל את התור שלך.`,
    ``,
    `שירות: ${serviceName}`,
    `תאריך: ${dateStr}`,
    `שעה: ${timeStr}`,
    ``,
    `ניתן לקבוע תור חדש דרך האפליקציה.`,
    `מצטערים על אי הנוחות!`,
  ].join("\n");

  const phone = clientPhone.replace(/\D/g, "").replace(/^0/, "972");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function buildWhatsAppRejectionLink(params: Omit<WhatsAppParams, "clinicAddress">): string {
  const { clientPhone, clientName, serviceName, startTime } = params;

  const dateStr = formatHebrewFullDate(startTime);
  const timeStr = formatTime(startTime);

  const message = [
    `היי ${firstName(clientName)}${HEART}`,
    `לצערי לא אוכל לקבל אותך בתור שביקשת:`,
    ``,
    `שירות: ${serviceName}`,
    `תאריך: ${dateStr}`,
    `שעה: ${timeStr}`,
    ``,
    `אשמח שנתאם מועד אחר שנוח לך!`,
    `רני`,
  ].join("\n");

  const phone = clientPhone.replace(/\D/g, "").replace(/^0/, "972");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function buildWhatsAppContactLink(whatsappNumber: string): string {
  const phone = whatsappNumber.replace(/\D/g, "").replace(/^0/, "972");
  return `https://wa.me/${phone}`;
}
