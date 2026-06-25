"use client";
import { useEffect, useState } from "react";
import { getClinicSettings } from "@/lib/firestore/settings";
import { buildWhatsAppContactLink } from "@/lib/whatsapp";
import { useSalon } from "@/contexts/SalonProvider";

export function WhatsAppFab() {
  const { salonId } = useSalon();
  const [number, setNumber] = useState<string | null>(null);

  useEffect(() => {
    if (!salonId) return;
    getClinicSettings(salonId)
      .then((s) => setNumber(s?.whatsappNumber?.trim() || null))
      .catch(() => setNumber(null));
  }, [salonId]);

  const visible = !!number;

  return (
    <a
      href={number ? buildWhatsAppContactLink(number) : undefined}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="צרו קשר בוואטסאפ"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className="flex items-center justify-center active:scale-95"
      style={{
        position: "fixed",
        left: 16,
        bottom: "calc(86px + env(safe-area-inset-bottom))",
        width: 56,
        height: 56,
        borderRadius: "9999px",
        background: "#25D366",
        boxShadow: "0 6px 18px rgba(0,0,0,0.22)",
        zIndex: 40,
        opacity: visible ? 1 : 0,
        transform: visible ? "scale(1)" : "scale(0.7)",
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 0.35s ease, transform 0.35s ease",
      }}
    >
      <svg width="30" height="30" viewBox="0 0 32 32" fill="#fff" aria-hidden="true">
        <path d="M16.01 3.2c-7.06 0-12.8 5.74-12.8 12.8 0 2.26.6 4.46 1.73 6.4L3.2 28.8l6.56-1.72a12.74 12.74 0 0 0 6.24 1.6h.01c7.06 0 12.8-5.74 12.8-12.8 0-3.42-1.33-6.64-3.75-9.06A12.7 12.7 0 0 0 16.01 3.2zm0 23.3h-.01a10.6 10.6 0 0 1-5.4-1.48l-.39-.23-4.03 1.06 1.08-3.93-.25-.4a10.55 10.55 0 0 1-1.62-5.63c0-5.86 4.77-10.63 10.64-10.63 2.84 0 5.51 1.11 7.52 3.12a10.56 10.56 0 0 1 3.11 7.52c0 5.87-4.77 10.63-10.63 10.63zm5.83-7.96c-.32-.16-1.89-.93-2.18-1.04-.29-.11-.5-.16-.71.16-.21.32-.82 1.04-1 1.25-.18.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.58-.95-.85-1.59-1.9-1.78-2.22-.18-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.18.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.71-1.72-.98-2.35-.26-.62-.52-.54-.71-.55l-.61-.01c-.21 0-.56.08-.85.4-.29.32-1.11 1.09-1.11 2.65 0 1.56 1.14 3.07 1.3 3.28.16.21 2.25 3.43 5.45 4.81.76.33 1.35.52 1.82.67.76.24 1.46.21 2.01.13.61-.09 1.89-.77 2.16-1.52.27-.74.27-1.38.19-1.51-.08-.13-.29-.21-.61-.37z" />
      </svg>
    </a>
  );
}
