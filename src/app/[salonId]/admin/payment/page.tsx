"use client";
import { useEffect, useState } from "react";
import { useSalon } from "@/contexts/SalonProvider";
import { getPaymentSettings, savePaymentSettings } from "@/lib/firestore/settings";
import type { PaymentSettings } from "@/types";

const DEFAULT: PaymentSettings = {
  bitQrImageUrl: "",
  bitPhoneNumber: "",
  bitPayUrl: "https://www.bitpay.co.il/app/me/3F9611C3-9973-F87E-2A4E-A968CD8CF9C7394F",
  payboxPhoneNumber: "",
};

export default function AdminPaymentPage() {
  const { salonId } = useSalon();
  const [settings, setSettings] = useState<PaymentSettings>(DEFAULT);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getPaymentSettings(salonId).then((s) => { if (s) setSettings(s); });
  }, []);

  async function save() {
    setSaving(true);
    await savePaymentSettings(salonId, settings);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const card: React.CSSProperties = { borderRadius: "var(--radius)", background: "var(--surface)", boxShadow: "var(--card-shadow)" };
  const input: React.CSSProperties = {
    width: "100%", padding: "13px 15px", borderRadius: 14,
    border: "1px solid var(--border-color)", background: "var(--accent)",
    fontSize: 15, color: "var(--foreground)", outline: "none",
  };

  return (
    <div className="pb-20 md:pb-6 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-extrabold" style={{ color: "var(--foreground)" }}>הגדרות תשלום</h1>
        <button onClick={save} disabled={saving}
          className="px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          style={{ background: saved ? "#3F8A5E" : "var(--primary)", borderRadius: "var(--pill)" }}>
          {saving ? "שומר..." : saved ? "נשמר" : "שמירה"}
        </button>
      </div>

      <div className="flex flex-col gap-4">
        <div className="p-5" style={card}>
          <h2 className="text-base font-bold mb-4" style={{ color: "var(--foreground)" }}>Bit</h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--muted-foreground)" }}>מספר טלפון ל-Bit</label>
              <input
                type="tel"
                value={settings.bitPhoneNumber}
                onChange={(e) => setSettings((p) => ({ ...p, bitPhoneNumber: e.target.value }))}
                dir="ltr"
                placeholder="050-0000000"
                style={input}
              />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--muted-foreground)" }}>קישור תשלום Bit (לכפתור &quot;תשלום ב-Bit&quot;)</label>
              <input
                value={settings.bitPayUrl ?? ""}
                onChange={(e) => setSettings((p) => ({ ...p, bitPayUrl: e.target.value }))}
                dir="ltr"
                placeholder="https://www.bitpay.co.il/app/me/..."
                style={input}
              />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--muted-foreground)" }}>URL של QR קוד ל-Bit</label>
              <input
                value={settings.bitQrImageUrl}
                onChange={(e) => setSettings((p) => ({ ...p, bitQrImageUrl: e.target.value }))}
                dir="ltr"
                placeholder="https://..."
                style={input}
              />
            </div>
            {settings.bitQrImageUrl && (
              <div className="flex justify-center">
                <img src={settings.bitQrImageUrl} alt="QR Bit" className="w-32 h-32 object-contain border"
                  style={{ borderColor: "var(--border-color)", borderRadius: 14 }} />
              </div>
            )}
          </div>
        </div>

        <div className="p-5" style={card}>
          <h2 className="text-base font-bold mb-4" style={{ color: "var(--foreground)" }}>Paybox</h2>
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--muted-foreground)" }}>מספר טלפון ל-Paybox</label>
            <input
              type="tel"
              value={settings.payboxPhoneNumber}
              onChange={(e) => setSettings((p) => ({ ...p, payboxPhoneNumber: e.target.value }))}
              dir="ltr"
              placeholder="050-0000000"
              style={input}
            />
          </div>
        </div>

        <div className="p-5" style={{ borderRadius: "var(--radius)", background: "var(--rose-soft)" }}>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            פרטי התשלום מוצגים ללקוחות בדף &quot;פרטים ומיקום&quot;.
          </p>
        </div>
      </div>
    </div>
  );
}
