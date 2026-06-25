"use client";
import Link from "next/link";
import { AppShell } from "@/components/shared/AppShell";
import { NotificationDiagnostics } from "@/components/native/NotificationDiagnostics";
import { BackgroundDeliveryGuide } from "@/components/native/BackgroundDeliveryGuide";
import { WebNotificationsBanner } from "@/components/native/WebNotificationsBanner";
import { useSalon } from "@/contexts/SalonProvider";

/**
 * Self-service notification troubleshooting page. Shows a full diagnostic of the
 * push-delivery chain (permission, battery exemption, FCM token, server
 * registration) plus an end-to-end self-test, and the OEM battery/auto-launch
 * guide so the fix is one tap away once the diagnosis points to force-stop.
 */
export default function NotificationCheckPage() {
  const { salonId } = useSalon();
  return (
    <AppShell>
      <div className="pt-6 pb-10 max-w-xl mx-auto" dir="rtl">
        <h1 className="text-2xl font-extrabold mb-2" style={{ color: "var(--foreground)" }}>
          בדיקת התראות
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--muted-foreground)", lineHeight: 1.7 }}>
          לא מקבלת תזכורות? כאן אפשר לבדוק למה ולתקן. הריצי את הבדיקה, ואם צריך — אפשרי
          לאפליקציה לרוץ ברקע.
        </p>

        <WebNotificationsBanner />

        <NotificationDiagnostics />

        <BackgroundDeliveryGuide />

        <Link
          href={`/${salonId}/my-appointments`}
          className="text-sm font-semibold"
          style={{ color: "var(--primary)" }}
        >
          ← חזרה לתורים שלי
        </Link>
      </div>
    </AppShell>
  );
}
