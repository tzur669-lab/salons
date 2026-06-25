"use client";
import { useEffect, useState } from "react";
import { useSalon } from "@/contexts/SalonProvider";
import { getClinicSettings } from "@/lib/firestore/settings";
import { getPaymentSettings } from "@/lib/firestore/settings";
import { buildWhatsAppContactLink } from "@/lib/whatsapp";
import { openExternal } from "@/lib/open-external";
import { AppShell } from "@/components/shared/AppShell";
import type { ClinicSettings, PaymentSettings } from "@/types";

// Fallback constants — used if admin hasn't saved these in Firestore yet
const GOOGLE_MAPS_URL = "https://maps.app.goo.gl/bc7jxKbh8PPgKMrT9?g_st=aw";
const BIT_PAY_URL     = "https://www.bitpay.co.il/app/me/3F9611C3-9973-F87E-2A4E-A968CD8CF9C7394F";

const DAY_LABELS: Record<string, string> = {
  sun: "ראשון", mon: "שני", tue: "שלישי",
  wed: "רביעי", thu: "חמישי", fri: "שישי", sat: "שבת",
};
const DAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export default function ClinicPage() {
  const { salonId } = useSalon();
  const [clinic, setClinic] = useState<ClinicSettings | null>(null);
  const [payment, setPayment] = useState<PaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0); // bump to retry
  const [copied, setCopied] = useState<"bit" | "paybox" | null>(null);

  function copyPhone(who: "bit" | "paybox", phone: string) {
    navigator.clipboard.writeText(phone).catch(() => {});
    setCopied(who);
    setTimeout(() => setCopied(null), 2000);
  }

  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    // allSettled: a failed paymentSettings read (e.g. guest, or never configured)
    // must not block the page. Only a failed clinic read (the mandatory data) is
    // treated as a real error — otherwise the page would render half-empty.
    Promise.allSettled([getClinicSettings(salonId), getPaymentSettings(salonId)]).then(([c, p]) => {
      if (p.status === "fulfilled") setPayment(p.value);
      if (c.status === "fulfilled") {
        setClinic(c.value);
      } else {
        setLoadError(true);
      }
      setLoading(false);
    });
  }, [reload, salonId]);

  if (loading) {
    return (
      <AppShell>
        <div className="pt-20 flex justify-center">
          <span className="inline-block rounded-full animate-pulse" style={{ width: 14, height: 14, background: "var(--rose)" }} />
        </div>
      </AppShell>
    );
  }

  if (loadError) {
    return (
      <AppShell>
        <div className="pt-20 text-center">
          <p className="text-base mb-5" style={{ color: "var(--muted-foreground)" }}>
            לא ניתן לטעון את פרטי הקליניקה
          </p>
          <button
            onClick={() => setReload((n) => n + 1)}
            className="px-7 py-3.5 font-bold text-white"
            style={{ background: "var(--rose)", borderRadius: "var(--pill)" }}
          >
            נסו שוב
          </button>
        </div>
      </AppShell>
    );
  }

  if (!clinic) {
    return (
      <AppShell>
        <div className="pt-16 text-center">
          <p style={{ color: "var(--muted-foreground)" }}>הפרטים טרם הוגדרו</p>
        </div>
      </AppShell>
    );
  }

  const card: React.CSSProperties = {
    borderRadius: "var(--radius)",
    background: "var(--surface)",
    boxShadow: "var(--card-shadow)",
  };
  const sectionLabel: React.CSSProperties = {
    fontSize: 13, fontWeight: 700, letterSpacing: 1, color: "var(--rose)",
  };

  return (
    <AppShell>
      <div className="pt-6 pb-10 max-w-xl mx-auto">
        <h1 className="text-2xl font-extrabold mb-6" style={{ color: "var(--foreground)" }}>
          {clinic.name}
        </h1>

        {/* Gallery */}
        {clinic.galleryImages.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-3 mb-5">
            {clinic.galleryImages.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`גלריה ${i + 1}`}
                className="flex-shrink-0 w-36 h-36 object-cover"
                style={{ borderRadius: "var(--radius)" }}
              />
            ))}
          </div>
        )}

        {/* Address + Map */}
        <div className="p-5 mb-4" style={card}>
          <h2 className="mb-2" style={sectionLabel}>כתובת</h2>
          <p className="text-base font-bold mb-1" style={{ color: "var(--foreground)" }}>{clinic.address}</p>
          {(() => {
            const mapsUrl = clinic.googleMapsUrl || GOOGLE_MAPS_URL;
            return mapsUrl.includes("/maps/embed") ? (
              <div className="w-full h-48 overflow-hidden mt-3" style={{ borderRadius: 14 }}>
                <iframe
                  src={mapsUrl}
                  width="100%"
                  height="100%"
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                  className="border-0"
                />
              </div>
            ) : (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-full py-3 font-bold text-sm mt-3"
                style={{ borderRadius: "var(--pill)", background: "var(--rose-soft)", color: "var(--rose)", border: "1px solid var(--border-color)" }}
              >
                פתיחה בגוגל מפות
              </a>
            );
          })()}
          {clinic.homeImageUrl && (
            <img
              src={clinic.homeImageUrl}
              alt="תמונת המקום"
              className="w-full h-52 object-cover mt-3"
              style={{ borderRadius: "var(--radius)" }}
            />
          )}
        </div>

        {/* Opening hours */}
        <div className="p-5 mb-4" style={card}>
          <h2 className="mb-3" style={sectionLabel}>שעות פעילות</h2>
          <div className="flex flex-col">
            {DAY_ORDER.map((key, i) => {
              const h = clinic.openingHours[key as keyof typeof clinic.openingHours];
              return (
                <div key={key} className="flex justify-between text-sm py-2.5" style={{ borderTop: i ? "1px solid var(--border-color)" : "none" }}>
                  <span style={{ color: "var(--muted-foreground)" }}>{DAY_LABELS[key]}</span>
                  <span style={{ color: h.isOpen ? "var(--foreground)" : "var(--faint)", fontWeight: 600 }} dir="ltr">
                    {h.isOpen ? `${h.open} – ${h.close}` : "סגור"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payment */}
        <div className="p-5 mb-4" style={card}>
          <h2 className="mb-4" style={sectionLabel}>תשלום</h2>
          <div className="flex flex-col gap-5">

            {/* ── Bit ── */}
            <div>
              <p className="text-xs font-bold mb-2" style={{ color: "var(--muted-foreground)" }}>Bit</p>
              <a
                href={(payment?.bitPayUrl) || BIT_PAY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-full py-3 font-bold text-white mb-3 text-sm"
                style={{ background: "#1A56DB", borderRadius: "var(--pill)" }}
              >
                תשלום ב-Bit
              </a>
              {payment?.bitPhoneNumber && (
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold" style={{ color: "var(--foreground)" }} dir="ltr">
                    {payment.bitPhoneNumber}
                  </p>
                  <button
                    onClick={() => copyPhone("bit", payment.bitPhoneNumber)}
                    className="text-xs px-3 py-1.5 rounded-full border transition-colors font-semibold"
                    style={{
                      borderColor: copied === "bit" ? "#3F8A5E" : "var(--border-color)",
                      color:       copied === "bit" ? "#3F8A5E" : "var(--muted-foreground)",
                    }}
                  >
                    {copied === "bit" ? "הועתק" : "העתקה"}
                  </button>
                </div>
              )}
              {payment?.bitQrImageUrl && (
                <img
                  src={payment.bitQrImageUrl}
                  alt="QR Bit"
                  className="w-28 h-28 object-contain mt-3 border"
                  style={{ borderColor: "var(--border-color)", borderRadius: 14 }}
                />
              )}
            </div>

            {/* ── Paybox ── */}
            {payment?.payboxPhoneNumber && (
              <div>
                <p className="text-xs font-bold mb-2" style={{ color: "var(--muted-foreground)" }}>Paybox</p>
                <a
                  href={`https://payboxapp.page.link/pay?uid=${payment.payboxPhoneNumber.replace(/[-\s]/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center w-full py-3 font-bold text-white mb-3 text-sm"
                  style={{ background: "#7C3AED", borderRadius: "var(--pill)" }}
                >
                  תשלום ב-Paybox
                </a>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold" style={{ color: "var(--foreground)" }} dir="ltr">
                    {payment.payboxPhoneNumber}
                  </p>
                  <button
                    onClick={() => copyPhone("paybox", payment.payboxPhoneNumber)}
                    className="text-xs px-3 py-1.5 rounded-full border transition-colors font-semibold"
                    style={{
                      borderColor: copied === "paybox" ? "#3F8A5E" : "var(--border-color)",
                      color:       copied === "paybox" ? "#3F8A5E" : "var(--muted-foreground)",
                    }}
                  >
                    {copied === "paybox" ? "הועתק" : "העתקה"}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Contact buttons */}
        <div className="flex flex-col gap-3">
          {clinic.whatsappNumber && (
            <button
              onClick={() => openExternal(buildWhatsAppContactLink(clinic.whatsappNumber))}
              className="flex items-center justify-center py-4 font-bold text-white w-full"
              style={{ background: "var(--rose)", borderRadius: "var(--pill)", border: "none", cursor: "pointer" }}
            >
              שליחת הודעה בוואטסאפ
            </button>
          )}
          {clinic.phone && (
            <a
              href={`tel:${clinic.phone}`}
              className="flex items-center justify-center py-4 font-bold"
              style={{ borderRadius: "var(--pill)", border: "1px solid var(--border-color)", background: "var(--surface)", color: "var(--foreground)" }}
            >
              חיוג
            </a>
          )}
          {clinic.instagramUrl && (
            <a
              href={clinic.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center py-4 font-bold"
              style={{ borderRadius: "var(--pill)", border: "1px solid var(--border-color)", background: "var(--surface)", color: "var(--foreground)" }}
            >
              אינסטגרם
            </a>
          )}
        </div>
      </div>
    </AppShell>
  );
}
