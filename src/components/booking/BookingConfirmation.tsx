"use client";
import { useState } from "react";
import { formatHebrewFullDate } from "@/lib/hebrew-calendar";
import type { Service } from "@/types";

interface Props {
  service: Service;
  startTime: Date;
  endTime: Date;
  clientName: string;
  salonName?: string;
  clinicAddress?: string;
  guestRecoveryUrl?: string; // present only for guest bookings — link to view/cancel later
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

export function BookingConfirmation({ service, startTime, endTime, clientName, salonName, guestRecoveryUrl }: Props) {
  return (
    <div
      style={{ borderRadius: "var(--radius-lg)", background: "var(--surface)", boxShadow: "var(--shadow)", overflow: "hidden" }}
    >
      {/* Header */}
      <div className="text-center pt-9 px-6">
        <div
          className="mx-auto flex items-center justify-center rounded-full"
          style={{ width: 76, height: 76, background: "var(--rose-soft)" }}
        >
          <svg width="34" height="34" viewBox="0 0 14 14" fill="none" stroke="var(--rose)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 7.5l3 3 6-7" />
          </svg>
        </div>
        <h2 className="text-2xl font-extrabold mt-5" style={{ color: "var(--foreground)" }}>
          {salonName ? `נשלח ל${salonName}` : "הבקשה נשלחה!"}
        </h2>
        <p className="text-sm leading-relaxed mt-2" style={{ color: "var(--muted-foreground)" }}>
          התור ממתין לאישור. תקבלו עדכון בוואטסאפ בקרוב.
        </p>
      </div>

      {/* Appointment details */}
      <div className="m-4 p-5" style={{ borderRadius: "var(--radius)", background: "var(--rose-soft)" }}>
        <p className="text-lg font-extrabold text-center mb-4" style={{ color: "var(--foreground)" }}>
          {service.name}
        </p>

        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between p-3.5" style={{ borderRadius: 14, background: "var(--surface)" }}>
            <span className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>תאריך</span>
            <span className="text-base font-bold" style={{ color: "var(--foreground)" }}>
              {startTime.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}
            </span>
          </div>
          <div className="flex items-center justify-between p-3.5" style={{ borderRadius: 14, background: "var(--surface)" }}>
            <span className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>שעה</span>
            <span className="text-2xl font-extrabold tracking-wide" style={{ color: "var(--rose)" }} dir="ltr">
              {formatTime(startTime)}
            </span>
          </div>

          <div className="flex flex-col gap-1.5 pt-1 px-1">
            <Row label="שם" value={clientName} />
            <Row label="תאריך עברי" value={formatHebrewFullDate(startTime)} />
            {service.price != null && <Row label="מחיר" value={`₪${service.price}`} />}
            <Row label="משך הטיפול" value={`${service.duration} דקות`} />
          </div>
        </div>
      </div>

      {/* Waiting note */}
      <div className="px-4 pb-6">
        <div
          className="p-4 text-center"
          style={{ borderRadius: "var(--radius)", background: "var(--rose-soft)", border: "1px solid var(--border-color)" }}
        >
          <p className="text-base font-bold mb-1" style={{ color: "var(--foreground)" }}>
            ממתין לאישור
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
            {salonName ? `${salonName} תאשר את הבקשה` : "הבקשה תאושר"} ותעדכן אתכם בוואטסאפ.
          </p>
        </div>
      </div>

      {guestRecoveryUrl && <GuestRecoveryBlock url={guestRecoveryUrl} />}
    </div>
  );
}

function GuestRecoveryBlock({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked — the link is still visible/selectable below.
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "הקישור לתור שלי", url });
    } catch {
      // User cancelled share sheet — no-op.
    }
  }

  return (
    <div className="px-4 pb-7">
      {/* Prominent warning banner */}
      <div
        className="flex items-start gap-3 p-4 mb-3"
        style={{ borderRadius: "var(--radius)", background: "#fff7ed", border: "2px solid #f97316" }}
      >
        <span style={{ fontSize: 22, lineHeight: 1 }}>⚠️</span>
        <div>
          <p className="text-sm font-extrabold mb-0.5" style={{ color: "#9a3412" }}>
            שמרו את הקישור עכשיו — לא יוצג שוב!
          </p>
          <p className="text-xs leading-relaxed" style={{ color: "#c2410c" }}>
            הזמנתם ללא חשבון. רק דרך הקישור הזה תוכלו לצפות בתור ולבטל אותו. אם תאבדו אותו תצטרכו ליצור קשר עם הסלון.
          </p>
        </div>
      </div>

      <div className="p-4" style={{ borderRadius: "var(--radius)", background: "var(--rose-soft)", border: "1px solid var(--border-color)" }}>
        <a
          href={url}
          className="block text-xs font-semibold mb-3 break-all underline"
          style={{ color: "var(--rose)" }}
          dir="ltr"
        >
          {url}
        </a>
        <div className="flex gap-2">
          <button
            onClick={copy}
            className="flex-1 py-2.5 text-sm font-bold text-white"
            style={{ background: "var(--rose)", borderRadius: "var(--pill)" }}
          >
            {copied ? "הועתק ✓" : "העתק קישור"}
          </button>
          {canShare && (
            <button
              onClick={share}
              className="flex-1 py-2.5 text-sm font-bold"
              style={{ background: "var(--surface)", borderRadius: "var(--pill)", border: "1.5px solid var(--rose)", color: "var(--rose)" }}
            >
              שיתוף
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
      <span className="font-semibold" style={{ color: "var(--foreground)" }}>{value}</span>
    </div>
  );
}
