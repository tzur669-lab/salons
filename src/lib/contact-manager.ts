import { getClinicSettings } from "@/lib/firestore/settings";
import { openWhatsApp } from "@/lib/open-external";

interface RecoveryContext {
  name?: string;
  phone?: string;
}

/** Hebrew help message pre-filled into the manager's WhatsApp, with whatever ID context we have. */
function buildRecoveryMessage({ name, phone }: RecoveryContext): string {
  const idParts = [name?.trim(), phone?.trim()].filter(Boolean).join(" / ") || "(לא צוינו פרטים)";
  return [
    "היי רוני, אני מנסה לשחזר סיסמה באפליקציה אבל לא מצליח.",
    `פרטי הזיהוי שלי הם: ${idParts}.`,
    "אשמח לעזרה בעדכון הפרטים.",
  ].join(" ");
}

/**
 * Total-lockout escape hatch: opens a WhatsApp chat with the salon manager (Roni),
 * pre-filled with a Hebrew password-recovery message + the user's available context
 * (typed phone on the login modal; name + phone on the profile screen). For users who
 * can recover via neither email (placeholder address) nor SMS (wrong/old phone).
 *
 * Manager number is read from clinicSettings/main (public read) — same source as the
 * WhatsApp FAB. Opens via openWhatsApp() (whatsapp:// on native, wa.me on web) per the
 * HANDOFF rule that raw wa.me breaks on iOS and corrupts Hebrew. Returns false if no
 * manager number is configured (so the caller can decide what to show).
 */
export async function contactManagerForRecovery(ctx: RecoveryContext, salonId?: string): Promise<boolean> {
  let number: string | null = null;
  try {
    const s = await getClinicSettings(salonId ?? "");
    number = s?.whatsappNumber?.trim() || null;
  } catch {
    number = null;
  }
  if (!number) return false;

  const phone = number.replace(/\D/g, "").replace(/^0/, "972");
  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(buildRecoveryMessage(ctx))}`;
  await openWhatsApp(waUrl);
  return true;
}
