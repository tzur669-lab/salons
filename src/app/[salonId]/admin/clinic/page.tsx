"use client";
import { useEffect, useState } from "react";
import { useSalon } from "@/contexts/SalonProvider";
import { useAuth } from "@/hooks/useAuth";
import {
  getClinicSettings,
  saveClinicSettings,
  getOwnerNotificationEmail,
  saveOwnerNotificationEmail,
} from "@/lib/firestore/settings";
import { uploadClinicPhoto, uploadGalleryPhoto } from "@/lib/storage";
import type { ClinicSettings } from "@/types";

const MAX_GALLERY = 40; // cap the portfolio so the public page payload stays bounded

const GALLERY_IMPORT_ERRORS: Record<string, string> = {
  "not-an-image": "הקישור לא מוביל לתמונה. ודאי שזה קישור שיתוף ציבורי (\"כל מי שיש לו הקישור\") לתמונה.",
  "fetch-failed": "לא הצלחנו להוריד את התמונה מהקישור. ודאי שהקובץ משותף לכולם.",
  "too-large": "התמונה גדולה מדי (מקסימום 10MB).",
  "bad-url": "כתובת לא תקינה. הדביקי קישור שמתחיל ב-https.",
  forbidden: "אין הרשאה.",
  unauthorized: "יש להתחבר מחדש.",
  "invalid-token": "יש להתחבר מחדש.",
};
const DEFAULT_HOURS = { open: "09:00", close: "19:00", isOpen: true };
const DEFAULT: ClinicSettings = {
  name: "",
  address: "",
  phone: "",
  whatsappNumber: "",
  instagramUrl: "",
  googleMapsUrl: "",
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
  const { user } = useAuth();
  const [clinic, setClinic] = useState<ClinicSettings>(DEFAULT);
  const [notifEmail, setNotifEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryDragOver, setGalleryDragOver] = useState(false);
  const [galleryUrlInput, setGalleryUrlInput] = useState("");

  useEffect(() => {
    getClinicSettings(salonId).then((c) => { if (c) setClinic(c); });
  }, []);

  useEffect(() => {
    if (user?.uid) getOwnerNotificationEmail(user.uid).then(setNotifEmail);
  }, [user?.uid]);

  async function save() {
    setSaving(true);
    await saveClinicSettings(salonId, clinic);
    if (user?.uid) await saveOwnerNotificationEmail(user.uid, notifEmail);
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
      alert(err instanceof Error ? err.message : "שגיאה בהעלאת התמונה. נסי שוב.");
    } finally {
      setUploading(false);
    }
  }

  // Portfolio (תיק עבודות) multi-upload. The loading flag disables the dropzone so
  // a slow client-side compression of heavy phone photos can't be double-triggered.
  async function handleGalleryFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    const room = MAX_GALLERY - clinic.galleryImages.length;
    if (room <= 0) {
      alert(`ניתן להעלות עד ${MAX_GALLERY} תמונות`);
      return;
    }
    setGalleryUploading(true);
    try {
      const urls: string[] = [];
      for (const file of list.slice(0, room)) {
        try {
          urls.push(await uploadGalleryPhoto(salonId, file));
        } catch (err) {
          alert(err instanceof Error ? err.message : "שגיאה בהעלאת תמונה");
        }
      }
      if (urls.length) {
        setClinic((prev) => ({ ...prev, galleryImages: [...prev.galleryImages, ...urls] }));
      }
    } finally {
      setGalleryUploading(false);
    }
  }

  function removeGalleryImage(index: number) {
    setClinic((prev) => ({ ...prev, galleryImages: prev.galleryImages.filter((_, j) => j !== index) }));
  }

  // Add-by-URL → server imports (re-hosts) the image into our Storage so it always
  // renders for clients (Drive share links, direct image URLs). Reuses galleryUploading.
  async function addGalleryUrl() {
    const url = galleryUrlInput.trim();
    if (!url) return;
    if (clinic.galleryImages.length >= MAX_GALLERY) {
      alert(`ניתן להוסיף עד ${MAX_GALLERY} תמונות`);
      return;
    }
    setGalleryUploading(true);
    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/admin/gallery-import", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ salonId, url }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.url) {
        setClinic((prev) => ({ ...prev, galleryImages: [...prev.galleryImages, data.url as string] }));
        setGalleryUrlInput("");
      } else {
        alert(GALLERY_IMPORT_ERRORS[data?.error] ?? "לא ניתן להוסיף את התמונה מהקישור הזה");
      }
    } catch {
      alert("שגיאה בהוספת התמונה. נסי שוב.");
    } finally {
      setGalleryUploading(false);
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

        <Section title="התראות על תורים">
          <Input
            label="אימייל לקבלת התראות על תורים חדשים"
            value={notifEmail}
            onChange={setNotifEmail}
            type="email"
            dir="ltr"
          />
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            לכתובת זו יישלח מייל בכל פעם שלקוחה קובעת תור. אם תושאר ריקה — ההתראות יישלחו לכתובת שאיתה נכנסת למערכת.
          </p>
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

        <Section title="תיק עבודות">
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            התמונות שיוצגו ללקוחות בעמוד &quot;תיק העבודות&quot;. אם לא יוזנו תמונות — הקטע לא יופיע ללקוחות.
          </p>

          {/* Drag & drop / picker — multi-file */}
          <div
            onDragOver={(e) => { e.preventDefault(); setGalleryDragOver(true); }}
            onDragLeave={() => setGalleryDragOver(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setGalleryDragOver(false);
              if (e.dataTransfer.files?.length) await handleGalleryFiles(e.dataTransfer.files);
            }}
            onClick={() => { if (!galleryUploading) document.getElementById("gallery-input")?.click(); }}
            className="border-2 border-dashed p-8 text-center cursor-pointer transition-all"
            style={{
              borderRadius: "var(--radius)",
              borderColor: galleryDragOver ? "var(--rose)" : "var(--border-color)",
              background: galleryDragOver ? "var(--rose-soft)" : "transparent",
              opacity: galleryUploading ? 0.6 : 1,
              pointerEvents: galleryUploading ? "none" : "auto",
            }}
          >
            <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>
              {galleryUploading ? "מעלה תמונות..." : "גררו תמונות לכאן או לחצו לבחירה"}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
              אפשר לבחור כמה תמונות יחד · JPG, PNG, WEBP
            </p>
          </div>
          <input
            id="gallery-input"
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={async (e) => {
              if (e.target.files?.length) await handleGalleryFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {/* Thumbnail grid with remove */}
          {clinic.galleryImages.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {clinic.galleryImages.map((url, i) => (
                <div key={i} className="relative" style={{ aspectRatio: "1 / 1" }}>
                  <img
                    src={url}
                    alt={`עבודה ${i + 1}`}
                    className="w-full h-full object-cover border"
                    style={{ borderColor: "var(--border-color)", borderRadius: 12 }}
                  />
                  <button
                    onClick={() => removeGalleryImage(i)}
                    className="absolute top-1 left-1 w-7 h-7 rounded-full text-sm font-bold text-white flex items-center justify-center"
                    style={{ background: "rgba(0,0,0,0.55)" }}
                    aria-label="הסרה"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Optional: add by URL — Drive share link or a direct image link (server re-hosts it) */}
          <div className="flex gap-2">
            <input
              value={galleryUrlInput}
              onChange={(e) => setGalleryUrlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGalleryUrl(); } }}
              dir="ltr"
              placeholder="קישור Google Drive או כתובת ישירה לתמונה"
              disabled={galleryUploading}
              className="flex-1 px-3 py-2 text-sm disabled:opacity-60"
              style={{ borderRadius: 12, border: "1px solid var(--border-color)", background: "var(--accent)", color: "var(--foreground)", outline: "none" }}
            />
            <button
              onClick={addGalleryUrl}
              disabled={galleryUploading}
              className="px-4 py-2 text-sm font-bold rounded-full border self-start disabled:opacity-60"
              style={{ borderColor: "var(--border-color)", color: "var(--rose)" }}
            >
              {galleryUploading ? "..." : "הוספה"}
            </button>
          </div>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            אפשר להדביק קישור שיתוף מ-Google Drive (חובה לשתף &quot;כל מי שיש לו הקישור&quot;) או כתובת ישירה לתמונה — התמונה תישמר אצלנו כך שתמיד תוצג ללקוחות. קישורי אינסטגרם אינם נתמכים; העלי מהמכשיר במקום.
          </p>
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
