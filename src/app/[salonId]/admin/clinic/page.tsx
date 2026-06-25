"use client";
import { useEffect, useState } from "react";
import { useSalon } from "@/contexts/SalonProvider";
import { getClinicSettings, saveClinicSettings } from "@/lib/firestore/settings";
import { uploadClinicPhoto } from "@/lib/storage";
import type { ClinicSettings } from "@/types";

const DEFAULT_HOURS = { open: "09:00", close: "19:00", isOpen: true };
const DEFAULT: ClinicSettings = {
  name: "רני חנימוב",
  address: "",
  phone: "",
  whatsappNumber: "",
  instagramUrl: "",
  googleMapsUrl: "https://maps.app.goo.gl/bc7jxKbh8PPgKMrT9?g_st=aw",
  homeImageUrl: "",
  openingHours: {
    sun: { ...DEFAULT_HOURS },
    mon: { ...DEFAULT_HOURS },
    tue: { ...DEFAULT_HOURS },
    wed: { ...DEFAULT_HOURS },
    thu: { ...DEFAULT_HOURS },
    fri: { open: "09:00", close: "15:00", isOpen: true },
    sat: { open: "09:00", close: "14:00", isOpen: false },
  },
  galleryImages: [],
};

const DAY_LABELS: Record<string, string> = {
  sun: "ראשון", mon: "שני", tue: "שלישי",
  wed: "רביעי", thu: "חמישי", fri: "שישי", sat: "שבת",
};
const DAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export default function AdminClinicPage() {
  const { salonId } = useSalon();
  const [clinic, setClinic] = useState<ClinicSettings>(DEFAULT);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    getClinicSettings(salonId).then((c) => { if (c) setClinic(c); });
  }, []);

  async function save() {
    setSaving(true);
    await saveClinicSettings(salonId, clinic);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function setField<K extends keyof ClinicSettings>(k: K, v: ClinicSettings[K]) {
    setClinic((prev) => ({ ...prev, [k]: v }));
  }

  function setHours(day: string, field: "open" | "close" | "isOpen", value: string | boolean) {
    setClinic((prev) => ({
      ...prev,
      openingHours: {
        ...prev.openingHours,
        [day]: { ...prev.openingHours[day as keyof typeof prev.openingHours], [field]: value },
      },
    }));
  }

  async function handlePhotoFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const url = await uploadClinicPhoto(salonId, file);
      setField("homeImageUrl", url);
    } catch (err) {
      console.error("upload failed:", err);
      alert("שגיאה בהעלאת התמונה. נסי שוב.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="pb-20 md:pb-6 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-extrabold" style={{ color: "var(--foreground)" }}>פרטים ומידע</h1>
        <button onClick={save} disabled={saving}
          className="px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          style={{ background: saved ? "#3F8A5E" : "var(--primary)", borderRadius: "var(--pill)" }}>
          {saving ? "שומר..." : saved ? "נשמר" : "שמירה"}
        </button>
      </div>

      <div className="flex flex-col gap-4">
        <Section title="פרטים כלליים">
          <Input label="שם" value={clinic.name} onChange={(v) => setField("name", v)} />
          <Input label="כתובת" value={clinic.address} onChange={(v) => setField("address", v)} />
          <Input label="טלפון" value={clinic.phone} onChange={(v) => setField("phone", v)} type="tel" dir="ltr" />
          <Input label="WhatsApp (ללא רווחים, עם קידומת 972)" value={clinic.whatsappNumber} onChange={(v) => setField("whatsappNumber", v)} dir="ltr" />
          <Input label="אינסטגרם URL" value={clinic.instagramUrl} onChange={(v) => setField("instagramUrl", v)} dir="ltr" />
          <Input label="Google Maps URL (קישור רגיל או Embed)" value={clinic.googleMapsUrl} onChange={(v) => setField("googleMapsUrl", v)} dir="ltr" />
        </Section>

        {/* Home photo section */}
        <Section title="תמונת המקום">
          {/* Drag & drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) await handlePhotoFile(file);
            }}
            onClick={() => document.getElementById("home-photo-input")?.click()}
            className="border-2 border-dashed p-8 text-center cursor-pointer transition-all"
            style={{
              borderRadius: "var(--radius)",
              borderColor: dragOver ? "var(--rose)" : "var(--border-color)",
              background: dragOver ? "var(--rose-soft)" : "transparent",
            }}
          >
            <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>
              {uploading ? "מעלה תמונה..." : "גררו תמונה לכאן או לחצו לבחירה"}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
              JPG, PNG, WEBP
            </p>
          </div>
          <input
            id="home-photo-input"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) await handlePhotoFile(file);
            }}
          />

          {/* OR URL input */}
          <Input
            label="או הזנת URL של תמונה"
            value={clinic.homeImageUrl ?? ""}
            onChange={(v) => setField("homeImageUrl", v)}
            dir="ltr"
          />

          {/* Preview */}
          {clinic.homeImageUrl && (
            <div className="relative">
              <img
                src={clinic.homeImageUrl}
                alt="תמונת הבית"
                className="w-full h-44 object-cover border"
                style={{ borderColor: "var(--border-color)", borderRadius: 14 }}
              />
              <button
                onClick={() => setField("homeImageUrl", "")}
                className="absolute top-2 left-2 w-8 h-8 rounded-full text-sm font-bold text-white flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.55)" }}
              >
                ×
              </button>
            </div>
          )}
        </Section>

        <Section title="שעות פעילות">
          {DAY_ORDER.map((day) => {
            const h = clinic.openingHours[day as keyof typeof clinic.openingHours];
            return (
              <div key={day} className="flex items-center gap-3">
                <label className="flex items-center gap-2 w-20 cursor-pointer">
                  <input type="checkbox" checked={h.isOpen} onChange={(e) => setHours(day, "isOpen", e.target.checked)} style={{ accentColor: "var(--rose)" }} />
                  <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{DAY_LABELS[day]}</span>
                </label>
                {h.isOpen && (
                  <>
                    <input type="time" value={h.open} onChange={(e) => setHours(day, "open", e.target.value)}
                      className="flex-1 px-3 py-2 text-sm" style={{ borderRadius: 12, border: "1px solid var(--border-color)", background: "var(--accent)", color: "var(--foreground)", outline: "none" }} />
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>–</span>
                    <input type="time" value={h.close} onChange={(e) => setHours(day, "close", e.target.value)}
                      className="flex-1 px-3 py-2 text-sm" style={{ borderRadius: 12, border: "1px solid var(--border-color)", background: "var(--accent)", color: "var(--foreground)", outline: "none" }} />
                  </>
                )}
                {!h.isOpen && (
                  <span className="text-sm" style={{ color: "var(--faint)" }}>סגור</span>
                )}
              </div>
            );
          })}
        </Section>

        <Section title="גלריה (URLs)">
          <div className="flex flex-col gap-2">
            {clinic.galleryImages.map((url, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={url}
                  onChange={(e) => {
                    const imgs = [...clinic.galleryImages];
                    imgs[i] = e.target.value;
                    setField("galleryImages", imgs);
                  }}
                  dir="ltr"
                  className="flex-1 px-3 py-2 text-sm"
                  style={{ borderRadius: 12, border: "1px solid var(--border-color)", background: "var(--accent)", color: "var(--foreground)", outline: "none" }}
                />
                <button onClick={() => setField("galleryImages", clinic.galleryImages.filter((_, j) => j !== i))}
                  className="px-3 py-2 text-sm font-semibold" style={{ color: "var(--muted-foreground)" }}>הסרה</button>
              </div>
            ))}
            <button
              onClick={() => setField("galleryImages", [...clinic.galleryImages, ""])}
              className="text-sm px-4 py-2.5 rounded-full border font-bold self-start"
              style={{ borderColor: "var(--border-color)", color: "var(--rose)" }}
            >
              הוספת תמונה
            </button>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-5" style={{ borderRadius: "var(--radius)", background: "var(--surface)", boxShadow: "var(--card-shadow)" }}>
      <h2 className="text-base font-bold mb-4" style={{ color: "var(--foreground)" }}>{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", dir }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; dir?: string;
}) {
  return (
    <div>
      <label className="text-xs mb-1 block" style={{ color: "var(--muted-foreground)" }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        dir={dir}
        className="w-full px-4 py-3"
        style={{ borderRadius: 14, border: "1px solid var(--border-color)", background: "var(--accent)", color: "var(--foreground)", outline: "none" }}
      />
    </div>
  );
}
