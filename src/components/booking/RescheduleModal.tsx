"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { TimeSlotPicker } from "@/components/booking/TimeSlotPicker";
import type { Appointment, TimeSlot } from "@/types";

interface Props {
  appointment: Appointment;
  salonId: string;
  onClose: () => void;
  onDone: () => void; // called after a successful reschedule (parent refreshes)
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function maxKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 60);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Lets a client move their own pending/approved appointment to a new time. Reuses the
 * server-side availability endpoint (so it never reads the appointments collection)
 * and the shared TimeSlotPicker. On confirm it posts to /api/reschedule-request, which
 * re-validates and re-books the slot transactionally and returns the appointment to
 * the admin's pending queue for reconfirmation.
 */
export function RescheduleModal({ appointment, salonId, onClose, onDone }: Props) {
  const { user } = useAuth();
  const [dayKey, setDayKey] = useState<string>(todayKey());
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [selStart, setSelStart] = useState<Date | null>(null);
  const [selEnd, setSelEnd] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!dayKey) return;
    setLoading(true);
    setError(false);
    setSelStart(null);
    setSelEnd(null);
    const controller = new AbortController();
    fetch("/api/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ salonId, dayKey, serviceDuration: appointment.serviceDuration }),
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("availability"))))
      .then((data: { slots?: { startTime: string; endTime: string; available: boolean }[] }) => {
        setSlots(
          (data.slots ?? []).map((s) => ({
            startTime: new Date(s.startTime),
            endTime: new Date(s.endTime),
            available: s.available,
          }))
        );
        setLoading(false);
      })
      .catch((err: unknown) => {
        if ((err as Error).name === "AbortError") return;
        setSlots([]);
        setError(true);
        setLoading(false);
      });
    return () => controller.abort();
  }, [dayKey, appointment.serviceDuration]);

  async function confirm() {
    if (!selStart || !selEnd || !user) return;
    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/reschedule-request", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          salonId,
          appointmentId: appointment.id,
          startTime: selStart.toISOString(),
          endTime: selEnd.toISOString(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        if (data.error === "slot-taken" || data.error === "slot-not-found") {
          alert("הזמן שבחרת כבר לא פנוי. בחרו זמן אחר.");
        } else if (data.error === "reschedule-limit") {
          alert("לא ניתן לשנות מועד יותר מדי פעמים. פנו לסלון בוואטסאפ.");
        } else {
          alert("שגיאה בשינוי המועד. נסו שוב.");
        }
        return;
      }
      // Re-notify the admin about the new time (the route cleared adminNotifiedAt).
      fetch("/api/notify-admin", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salonId, appointmentId: appointment.id }),
      }).catch(() => {});
      onDone();
    } catch {
      alert("שגיאה בשינוי המועד. נסו שוב.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-extrabold" style={{ color: "var(--foreground)" }}>
            שינוי מועד
          </h2>
          <button onClick={onClose} className="text-2xl leading-none" style={{ color: "var(--muted-foreground)" }}>
            ×
          </button>
        </div>

        <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
          {appointment.serviceName} · מועד נוכחי:{" "}
          {appointment.startTime.toDate().toLocaleString("he-IL", {
            day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
          })}
        </p>

        <label className="text-xs mb-1 block" style={{ color: "var(--muted-foreground)" }}>תאריך חדש</label>
        <input
          type="date"
          value={dayKey}
          min={todayKey()}
          max={maxKey()}
          onChange={(e) => setDayKey(e.target.value)}
          className="w-full mb-5 px-4 py-3 text-sm"
          style={{ borderRadius: 14, border: "1px solid var(--border-color)", background: "var(--accent)", color: "var(--foreground)", outline: "none" }}
        />

        {loading ? (
          <p className="text-center py-6 text-sm" style={{ color: "var(--muted-foreground)" }}>טוען...</p>
        ) : error ? (
          <p className="text-center py-6 text-sm" style={{ color: "var(--muted-foreground)" }}>
            לא הצלחנו לטעון שעות. נסו תאריך אחר.
          </p>
        ) : (
          <TimeSlotPicker
            slots={slots}
            selectedStart={selStart}
            onSelect={(start, end) => { setSelStart(start); setSelEnd(end); }}
          />
        )}

        <button
          onClick={confirm}
          disabled={!selStart || submitting}
          className="w-full mt-6 py-4 font-bold text-white disabled:opacity-50"
          style={{ background: "var(--rose)", borderRadius: "var(--pill)" }}
        >
          {submitting ? "שולח..." : "אישור המועד החדש"}
        </button>
        <p className="text-xs text-center mt-3" style={{ color: "var(--muted-foreground)" }}>
          המועד החדש יישלח לאישור.
        </p>
      </div>
    </div>
  );
}
