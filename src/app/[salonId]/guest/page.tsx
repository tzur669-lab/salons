"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { buildGoogleCalendarLink } from "@/lib/google-calendar";
import { useSalon } from "@/contexts/SalonProvider";

interface GuestAppointment {
  id: string;
  serviceName: string;
  servicePrice: number | null;
  serviceDuration: number | null;
  clientName: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
}

const STATUS_LABELS: Record<string, { label: string; ink: string; bg: string }> = {
  pending:          { label: "ממתין לאישור", ink: "#CE7C9B", bg: "#FCEFF3" },
  approved:         { label: "אושר",          ink: "#3F8A5E", bg: "#E8F3EC" },
  rejected:         { label: "נדחה",          ink: "#C2596B", bg: "#F8E9EC" },
  cancelled:        { label: "בוטל",          ink: "#8B7E84", bg: "#F1ECEE" },
  change_requested: { label: "בקשת שינוי",    ink: "#8B6BB0", bg: "#F0EAF6" },
  completed:        { label: "בוצע",          ink: "#7C8794", bg: "#EEF1F5" },
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit",
  });
}

function GuestView() {
  const params = useSearchParams();
  const token = params.get("t") ?? "";
  const { salonId, salon } = useSalon();

  const [appt, setAppt] = useState<GuestAppointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    if (!token) { setError(true); setLoading(false); return; }
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/guest/appointment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salonId, token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { setError(true); setAppt(null); }
      else setAppt(data.appointment as GuestAppointment);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleCancel() {
    if (!confirm("לבטל את התור?")) return;
    setCancelling(true);
    try {
      const res = await fetch("/api/guest/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salonId, token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        alert(
          data.error === "not-cancellable"
            ? "לא ניתן לבטל את התור הזה — ייתכן שהמצב כבר השתנה."
            : "שגיאה בביטול התור. נסו שוב."
        );
      } else {
        await load(); // refresh — now shows as cancelled
      }
    } catch {
      alert("שגיאה בביטול התור. נסו שוב.");
    } finally {
      setCancelling(false);
    }
  }

  const card: React.CSSProperties = {
    borderRadius: "var(--radius-lg)", background: "var(--surface)",
    boxShadow: "var(--shadow)", padding: 24,
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center px-4 py-10"
      style={{ background: "var(--background)" }}
    >
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-extrabold mb-6 text-center" style={{ color: "var(--foreground)" }}>
          התור שלי
        </h1>

        {loading ? (
          <div className="py-16 flex justify-center">
            <span className="inline-block rounded-full animate-pulse" style={{ width: 14, height: 14, background: "var(--rose)" }} />
          </div>
        ) : error || !appt ? (
          <div style={card} className="text-center">
            <p className="text-base mb-4" style={{ color: "var(--muted-foreground)" }}>
              לא מצאנו את התור. ייתכן שהקישור שגוי או שפג תוקפו.
            </p>
            <Link
              href={`/${salonId}/book`}
              className="inline-block px-7 py-3.5 font-bold text-white"
              style={{ background: "var(--rose)", borderRadius: "var(--pill)" }}
            >
              קביעת תור חדש
            </Link>
          </div>
        ) : (
          <GuestCard
            appt={appt}
            cancelling={cancelling}
            onCancel={handleCancel}
            salonName={salon?.displayName ?? salonId}
          />
        )}

        <p className="text-xs text-center mt-6" style={{ color: "var(--muted-foreground)" }}>
          שמרו את הקישור הזה כדי לחזור לתור בכל עת.
        </p>
      </div>
    </div>
  );
}

function GuestCard({
  appt, cancelling, onCancel, salonName,
}: {
  appt: GuestAppointment;
  cancelling: boolean;
  onCancel: () => void;
  salonName?: string;
}) {
  const st = STATUS_LABELS[appt.status] ?? { label: appt.status, ink: "#8B7E84", bg: "#F1ECEE" };
  const start = appt.startTime ? new Date(appt.startTime) : null;
  const end = appt.endTime ? new Date(appt.endTime) : null;
  const isFuture = !!start && start.getTime() > Date.now();
  const canCancel = appt.status === "pending" && isFuture;
  const approvedFuture = appt.status === "approved" && isFuture;

  return (
    <div style={{ borderRadius: "var(--radius-lg)", background: "var(--surface)", boxShadow: "var(--shadow)", padding: 24 }}>
      <div className="flex justify-between items-center gap-3 mb-3">
        <p className="font-bold text-lg" style={{ color: "var(--foreground)" }}>{appt.serviceName}</p>
        <span className="text-xs px-3 py-1.5 rounded-full font-bold whitespace-nowrap" style={{ background: st.bg, color: st.ink }}>
          {st.label}
        </span>
      </div>
      {start && (
        <p className="text-sm mb-1" style={{ color: "var(--muted-foreground)" }}>
          {formatDateTime(appt.startTime!)}
        </p>
      )}
      <div className="flex flex-col gap-1 mt-3 text-sm">
        {appt.clientName && <Row label="שם" value={appt.clientName} />}
        {appt.serviceDuration != null && <Row label="משך הטיפול" value={`${appt.serviceDuration} דקות`} />}
        {appt.servicePrice != null && <Row label="מחיר" value={`₪${appt.servicePrice}`} />}
      </div>

      {canCancel && (
        <button
          onClick={onCancel}
          disabled={cancelling}
          className="mt-5 w-full text-sm px-4 py-3 rounded-full font-bold disabled:opacity-60"
          style={{ border: "1px solid var(--border-color)", color: "var(--muted-foreground)", background: "var(--surface)" }}
        >
          {cancelling ? "מבטל..." : "ביטול תור"}
        </button>
      )}

      {approvedFuture && start && end && (
        <a
          href={buildGoogleCalendarLink({
            title: `תור ל${appt.serviceName}${salonName ? ` ${salonName}` : ""}`,
            startTime: start,
            endTime: end,
            description: `שירות: ${appt.serviceName}`,
          })}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex w-full items-center justify-center gap-2 text-sm px-4 py-3 rounded-full font-bold"
          style={{ border: "1px solid var(--border-color)", background: "var(--surface)", color: "var(--foreground)" }}
        >
          הוספה ליומן Google
        </a>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
      <span className="font-semibold" style={{ color: "var(--foreground)" }}>{value}</span>
    </div>
  );
}

export default function GuestPage() {
  return (
    <Suspense fallback={null}>
      <GuestView />
    </Suspense>
  );
}
