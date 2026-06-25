"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useSalon } from "@/contexts/SalonProvider";
import { getClientAppointments } from "@/lib/firestore/appointments";
import { setHistoryClearedAt } from "@/lib/firestore/users";
import { getClinicSettings } from "@/lib/firestore/settings";
import { buildWhatsAppContactLink } from "@/lib/whatsapp";
import { buildGoogleCalendarLink } from "@/lib/google-calendar";
import { AppShell } from "@/components/shared/AppShell";
import { NotificationsBanner } from "@/components/native/NotificationsBanner";
import { WebNotificationsBanner } from "@/components/native/WebNotificationsBanner";
import { RescheduleModal } from "@/components/booking/RescheduleModal";
import type { Appointment, ClinicSettings } from "@/types";

const STATUS_LABELS: Record<string, { label: string; ink: string; bg: string }> = {
  pending:          { label: "ממתין לאישור", ink: "#CE7C9B", bg: "#FCEFF3" },
  approved:         { label: "אושר",          ink: "#3F8A5E", bg: "#E8F3EC" },
  rejected:         { label: "נדחה",          ink: "#C2596B", bg: "#F8E9EC" },
  cancelled:        { label: "בוטל",          ink: "#8B7E84", bg: "#F1ECEE" },
  change_requested: { label: "בקשת שינוי",    ink: "#8B6BB0", bg: "#F0EAF6" },
  completed:        { label: "בוצע",          ink: "#7C8794", bg: "#EEF1F5" },
};

function formatDateTime(d: Date): string {
  return d.toLocaleString("he-IL", {
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function MyAppointmentsPage() {
  const { user, appUser } = useAuth();
  const { salonId, salon } = useSalon();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clinic, setClinic] = useState<ClinicSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0); // bump to retry
  const [clearing, setClearing] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [rescheduleAppt, setRescheduleAppt] = useState<Appointment | null>(null);
  const [showRescheduled, setShowRescheduled] = useState(false);

  useEffect(() => {
    getClinicSettings(salonId).then(setClinic).catch(() => {});
  }, [salonId]);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    setLoadError(false);
    getClientAppointments(salonId, user.uid)
      .then((a) => { setAppointments(a); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); }); // no infinite spinner
  }, [user, reload]);

  async function handleCancel(id: string) {
    if (!confirm("לבטל את התור?")) return;
    try {
      // Cancellation runs server-side: the doc moves from appointmentsPending to
      // appointmentsRejected, which the Firestore rules allow only for the Admin SDK.
      const idToken = await user?.getIdToken();
      if (!idToken) {
        alert("צריך להתחבר מחדש כדי לבטל.");
        return;
      }
      const res = await fetch("/api/cancel-appointment", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ salonId, appointmentId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        if (data.error === "not-pending" || data.error === "not-cancellable") {
          alert("לא ניתן לבטל את התור הזה — ייתכן שהמצב כבר השתנה. רענני את הדף.");
        } else {
          alert("שגיאה בביטול התור. נסו שוב.");
        }
        return;
      }
      // Optimistic update: the cancelled appointment drops out of "upcoming"
      // (filtered by status !== "cancelled") immediately — even if the user just
      // dismisses the success modal below without tapping an action button.
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: "cancelled" } : a))
      );
      setShowCancelled(true);
    } catch {
      alert("שגיאה בביטול התור. נסו שוב.");
    }
  }

  const now = new Date();
  const nowMillis = now.getTime();
  // Client "cleared" their history view up to this moment (epoch ms). Compare via
  // toMillis() — never compare Firebase Timestamp objects directly with </<=.
  const clearedMillis = appUser?.historyClearedAt ? appUser.historyClearedAt.toMillis() : 0;

  // Visually remap: approved appointments whose end time has passed → show as "completed"
  const displayAppts = appointments.map((a) => ({
    ...a,
    status:
      a.status === "approved" && a.endTime.toMillis() <= nowMillis
        ? ("completed" as const)
        : a.status,
  }));

  // Upcoming: future appointments that are not cancelled/rejected
  const upcoming = displayAppts.filter(
    (a) => a.startTime.toMillis() > nowMillis && a.status !== "cancelled" && a.status !== "rejected"
  );
  // History: completed + anything that already happened (incl. visual remap),
  // excluding anything the client cleared (startTime at/before historyClearedAt).
  const past = displayAppts.filter(
    (a) =>
      a.startTime.toMillis() > clearedMillis &&
      (a.status === "completed" || (a.status === "approved" && a.startTime.toMillis() <= nowMillis))
  );

  async function handleClearHistory() {
    if (!user) return;
    if (!confirm("לנקות את היסטוריית התורים? התורים הקרובים יישארו.")) return;
    setClearing(true);
    try {
      await setHistoryClearedAt(user.uid);
      // Re-read the user doc (now carrying historyClearedAt) so the history filters out.
      window.location.reload();
    } catch {
      alert("שגיאה בניקוי ההיסטוריה. נסו שוב.");
      setClearing(false);
    }
  }

  if (!user) {
    return (
      <AppShell>
        <div className="pt-16 text-center">
          <p className="text-base mb-5" style={{ color: "var(--muted-foreground)" }}>
            כדי לראות את התורים צריך להתחבר
          </p>
          <Link
            href={`/${salonId}/login`}
            className="px-7 py-3.5 font-bold text-white"
            style={{ background: "var(--primary)", borderRadius: "var(--pill)" }}
          >
            התחברות
          </Link>
        </div>
      </AppShell>
    );
  }

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
            לא הצלחנו לטעון את התורים
          </p>
          <button
            onClick={() => setReload((n) => n + 1)}
            className="px-7 py-3.5 font-bold text-white"
            style={{ background: "var(--primary)", borderRadius: "var(--pill)" }}
          >
            נסו שוב
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="pt-6 pb-10 max-w-xl mx-auto">
        <h1 className="text-2xl font-extrabold mb-6" style={{ color: "var(--foreground)" }}>
          התורים שלי
        </h1>

        <NotificationsBanner />
        <WebNotificationsBanner />

        <Link
          href={`/${salonId}/notification-check`}
          className="inline-block text-xs font-semibold mb-6"
          style={{ color: "var(--primary)" }}
        >
          לא מקבלת תזכורות? בדקי כאן ←
        </Link>

        {upcoming.length > 0 && (
          <>
            <h2 className="text-sm font-bold mb-3" style={{ color: "var(--muted-foreground)" }}>
              קרובים
            </h2>
            <div className="flex flex-col gap-3 mb-8">
              {upcoming.map((a) => (
                <AppointmentCard key={a.id} appointment={a} onCancel={handleCancel} onReschedule={setRescheduleAppt} whatsappNumber={clinic?.whatsappNumber} clinicAddress={clinic?.address} salonName={salon?.displayName ?? salonId} />
              ))}
            </div>
          </>
        )}

        {past.length > 0 && (
          <>
            <h2 className="text-sm font-bold mb-3" style={{ color: "var(--muted-foreground)" }}>
              היסטוריה
            </h2>
            <div className="flex flex-col gap-3">
              {past.map((a) => (
                <AppointmentCard key={a.id} appointment={a} onCancel={handleCancel} onReschedule={setRescheduleAppt} whatsappNumber={clinic?.whatsappNumber} clinicAddress={clinic?.address} salonName={salon?.displayName ?? salonId} />
              ))}
            </div>

            {/* Clear history — bottom of the history section. Hides past appointments
                from the client's own view only; the salon keeps all records. */}
            <div className="mt-6 text-center">
              <button
                onClick={handleClearHistory}
                disabled={clearing}
                className="text-sm underline disabled:opacity-60"
                style={{ color: "#c2596b", background: "none", border: "none", cursor: "pointer" }}
              >
                {clearing ? "מנקה..." : "ניקוי היסטוריה"}
              </button>
            </div>
          </>
        )}

        {upcoming.length === 0 && past.length === 0 && (
          <div className="text-center pt-16">
            <p className="text-base mb-5" style={{ color: "var(--muted-foreground)" }}>
              עדיין אין לכם תורים
            </p>
            <Link
              href={`/${salonId}/book`}
              className="px-7 py-3.5 font-bold text-white"
              style={{ background: "var(--rose)", borderRadius: "var(--pill)" }}
            >
              קביעת תור ראשון
            </Link>
          </div>
        )}
      </div>

      {showCancelled && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={() => setShowCancelled(false)}
        >
          <div
            className="w-full max-w-sm p-8 rounded-3xl shadow-xl text-center"
            style={{ background: "var(--surface)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="mx-auto flex items-center justify-center rounded-full mb-5"
              style={{ width: 64, height: 64, background: "var(--rose-soft)" }}
            >
              <svg width="30" height="30" viewBox="0 0 14 14" fill="none" stroke="var(--rose)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 7.5l3 3 6-7" />
              </svg>
            </div>
            <h2 className="text-xl font-extrabold mb-2" style={{ color: "var(--foreground)" }}>
              התור בוטל בהצלחה
            </h2>
            <p className="text-sm mb-6" style={{ color: "var(--muted-foreground)" }}>
              מה תרצו לעשות עכשיו?
            </p>

            <div className="flex flex-col gap-3">
              <Link
                href={`/${salonId}/book`}
                className="flex items-center justify-center py-3.5 font-bold text-white w-full"
                style={{ background: "var(--rose)", borderRadius: "var(--pill)" }}
              >
                קביעת תור חדש
              </Link>
              {clinic?.whatsappNumber && (
                <a
                  href={buildWhatsAppContactLink(clinic.whatsappNumber)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center py-3.5 font-bold w-full"
                  style={{ borderRadius: "var(--pill)", border: "1px solid var(--border-color)", background: "var(--surface)", color: "var(--foreground)" }}
                >
                  פנייה למנהלת בוואטסאפ
                </a>
              )}
              <button
                onClick={() => setShowCancelled(false)}
                className="text-sm mt-1 underline"
                style={{ color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer" }}
              >
                סגירה
              </button>
            </div>
          </div>
        </div>
      )}

      {rescheduleAppt && (
        <RescheduleModal
          appointment={rescheduleAppt}
          salonId={salonId}
          onClose={() => setRescheduleAppt(null)}
          onDone={() => {
            setRescheduleAppt(null);
            setShowRescheduled(true);
            setReload((n) => n + 1); // re-fetch with the new time / pending status
          }}
        />
      )}

      {showRescheduled && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={() => setShowRescheduled(false)}
        >
          <div
            className="w-full max-w-sm p-8 rounded-3xl shadow-xl text-center"
            style={{ background: "var(--surface)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-extrabold mb-2" style={{ color: "var(--foreground)" }}>
              המועד החדש נשלח
            </h2>
            <p className="text-sm mb-6" style={{ color: "var(--muted-foreground)" }}>
              הבקשה ממתינה לאישור. תקבלו עדכון בוואטסאפ.
            </p>
            <button
              onClick={() => setShowRescheduled(false)}
              className="w-full py-3.5 font-bold text-white"
              style={{ background: "var(--rose)", borderRadius: "var(--pill)" }}
            >
              הבנתי
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function AppointmentCard({
  appointment,
  onCancel,
  onReschedule,
  whatsappNumber,
  clinicAddress,
  salonName,
}: {
  appointment:    Appointment;
  onCancel:       (id: string) => void;
  onReschedule?:  (a: Appointment) => void;
  whatsappNumber?: string;
  clinicAddress?:  string;
  salonName?:      string;
}) {
  const st = STATUS_LABELS[appointment.status] ?? { label: appointment.status, ink: "#8B7E84", bg: "#F1ECEE" };
  const start = appointment.startTime.toDate();
  const isFuture = start > new Date();
  const canCancel = appointment.status === "pending" && isFuture;
  const approvedFuture = appointment.status === "approved" && isFuture;
  // Pending or approved future appointments can be self-rescheduled.
  const canReschedule = !!onReschedule && isFuture &&
    (appointment.status === "pending" || appointment.status === "approved");

  return (
    <div
      className="p-5"
      style={{ borderRadius: "var(--radius)", background: "var(--surface)", boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex justify-between items-center gap-3 mb-2">
        <p className="font-bold text-lg" style={{ color: "var(--foreground)" }}>
          {appointment.serviceName}
        </p>
        <span
          className="text-xs px-3 py-1.5 rounded-full font-bold whitespace-nowrap"
          style={{ background: st.bg, color: st.ink }}
        >
          {st.label}
        </span>
      </div>
      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
        {formatDateTime(start)}
      </p>

      {canCancel && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => onCancel(appointment.id)}
            className="text-sm px-4 py-2.5 rounded-full font-bold"
            style={{ border: "1px solid var(--border-color)", color: "var(--muted-foreground)", background: "var(--surface)" }}
          >
            ביטול תור
          </button>
          {canReschedule && (
            <button
              onClick={() => onReschedule!(appointment)}
              className="text-sm px-4 py-2.5 rounded-full font-bold"
              style={{ border: "1.5px solid var(--rose)", color: "var(--rose)", background: "var(--rose-soft)" }}
            >
              שינוי מועד
            </button>
          )}
        </div>
      )}

      {approvedFuture && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {canReschedule && (
            <button
              onClick={() => onReschedule!(appointment)}
              className="inline-flex items-center gap-2 text-sm px-4 py-2.5 rounded-full font-bold"
              style={{ border: "1.5px solid var(--rose)", color: "var(--rose)", background: "var(--rose-soft)" }}
            >
              שינוי מועד
            </button>
          )}
          <a
            href={buildGoogleCalendarLink({
              title: `תור ל${appointment.serviceName}${salonName ? ` ${salonName}` : ""}`,
              startTime: start,
              endTime: appointment.endTime.toDate(),
              description: `שירות: ${appointment.serviceName}`,
              location: clinicAddress,
            })}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm px-4 py-2.5 rounded-full font-bold"
            style={{ border: "1px solid var(--border-color)", background: "var(--surface)", color: "var(--foreground)" }}
          >
            הוספה ליומן Google
          </a>
          {whatsappNumber && (
            <a
              href={buildWhatsAppContactLink(whatsappNumber)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm px-4 py-2.5 rounded-full font-bold text-white"
              style={{ background: "var(--rose)" }}
            >
              פנייה{salonName ? ` ל${salonName}` : ""} בוואטסאפ
            </a>
          )}
        </div>
      )}
    </div>
  );
}
