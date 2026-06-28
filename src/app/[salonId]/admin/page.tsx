"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSalon } from "@/contexts/SalonProvider";
import {
  getTodayAppointments,
  getUpcomingAppointments,
  updateAppointmentStatus,
  cancelAppointment,
  markPastAppointmentsAsCompleted,
  subscribeToPendingAppointments,
} from "@/lib/firestore/appointments";
import { getClinicSettings } from "@/lib/firestore/settings";
import { auth } from "@/lib/firebase";
import { buildWhatsAppApprovalLink, buildWhatsAppCancellationLink, buildWhatsAppRejectionLink } from "@/lib/whatsapp";
import { buildGoogleCalendarLink } from "@/lib/google-calendar";
import { openWhatsApp } from "@/lib/open-external";
import { notifyClientApproved, notifyClientCancelled, notifyClientRejected } from "@/lib/notify-client";
import { AdminNotificationsBanner } from "@/components/native/AdminNotificationsBanner";
import { AdminPushTest } from "@/components/native/AdminPushTest";
import { AdminUpdateBroadcast } from "@/components/native/AdminUpdateBroadcast";
import { BackgroundDeliveryGuide } from "@/components/native/BackgroundDeliveryGuide";
import type { Appointment, ClinicSettings } from "@/types";

const STATUS_LABELS: Record<string, { label: string; ink: string; bg: string }> = {
  pending:          { label: "ממתין",  ink: "#CE7C9B", bg: "#FCEFF3" },
  approved:         { label: "אושר",   ink: "#3F8A5E", bg: "#E8F3EC" },
  rejected:         { label: "נדחה",   ink: "#C2596B", bg: "#F8E9EC" },
  cancelled:        { label: "בוטל",   ink: "#8B7E84", bg: "#F1ECEE" },
  change_requested: { label: "שינוי",  ink: "#8B6BB0", bg: "#F0EAF6" },
  completed:        { label: "בוצע",   ink: "#7C8794", bg: "#EEF1F5" },
};

function formatTime(d: Date): string {
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}
function formatDateShort(d: Date): string {
  return d.toLocaleDateString("he-IL", { weekday: "short", day: "numeric", month: "short" });
}

export default function AdminDashboard() {
  const { salonId, salon } = useSalon();
  const [todayAppts, setTodayAppts]   = useState<Appointment[]>([]);
  const [pending,    setPending]      = useState<Appointment[]>([]);
  const [upcoming,   setUpcoming]     = useState<Appointment[]>([]);
  const [clinic,     setClinic]       = useState<ClinicSettings | null>(null);
  const [loading,    setLoading]      = useState(true);
  const [loadingId,  setLoadingId]    = useState<string | null>(null);
  const [cronStale,  setCronStale]    = useState(false);
  const [cronAge,    setCronAge]      = useState<number | null>(null);
  const [copiedKey,  setCopiedKey]    = useState<string | null>(null);

  useEffect(() => {
    // First mark any past approved appointments as completed, then load data
    markPastAppointmentsAsCompleted(salonId).catch(console.error).finally(() => {
      Promise.all([
        getTodayAppointments(salonId),
        getUpcomingAppointments(salonId),
        getClinicSettings(salonId),
      ])
        .then(([today, up, c]) => {
          setTodayAppts(today);
          setUpcoming(up);
          setClinic(c);
        })
        .catch((err) => console.error("admin dashboard load failed:", err))
        .finally(() => setLoading(false));
    });
  }, [salonId]);

  // Live pending requests — the list updates instantly when a client books,
  // without a manual refresh (COLL_PENDING holds pending + change_requested).
  useEffect(() => {
    const unsub = subscribeToPendingAppointments(salonId, setPending);
    return unsub;
  }, [salonId]);

  // Cron heartbeat: warn if the reminder cron stopped being called (best-effort).
  useEffect(() => {
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch(`/api/cron-status?salonId=${encodeURIComponent(salonId)}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.ok) {
          setCronStale(!!data.stale);
          setCronAge(typeof data.ageMinutes === "number" ? data.ageMinutes : null);
        }
      } catch {
        /* non-critical diagnostic — never block the dashboard */
      }
    })();
  }, []);

  async function approve(appt: Appointment) {
    setLoadingId(appt.id + "-approve");
    try {
      await updateAppointmentStatus(salonId, appt.id, "approved");
      setPending((prev) => prev.filter((a) => a.id !== appt.id));
      setTodayAppts((prev) =>
        prev.map((a) => (a.id === appt.id ? { ...a, status: "approved" } : a))
      );
      setUpcoming((prev) =>
        prev.map((a) => (a.id === appt.id ? { ...a, status: "approved" } : a))
      );
      // Push the client a "your appointment was approved" notification.
      // Awaited BEFORE WhatsApp so the request goes out while the app is still
      // foregrounded (opening WhatsApp backgrounds the WebView).
      await notifyClientApproved(salonId, appt);
      if (clinic) {
        const link = buildWhatsAppApprovalLink({
          clientPhone: appt.clientPhone,
          clientName:  appt.clientName,
          serviceName: appt.serviceName,
          startTime:   appt.startTime.toDate(),
          endTime:     appt.endTime.toDate(),
          clinicAddress: clinic.address,
          salonId,
          appointmentId: appt.id,
          baseUrl:     window.location.origin,
        });
        await openWhatsApp(link);
      }
    } catch (err) {
      console.error("approve failed:", err);
      alert("שגיאה באישור התור. נסי שנית.");
    } finally {
      setLoadingId(null);
    }
  }

  async function reject(appt: Appointment) {
    setLoadingId(appt.id + "-reject");
    try {
      await updateAppointmentStatus(salonId, appt.id, "rejected");
      setPending((prev) => prev.filter((a) => a.id !== appt.id));
      setTodayAppts((prev) => prev.map((a) => (a.id === appt.id ? { ...a, status: "rejected" } : a)));
      setUpcoming((prev) => prev.filter((a) => a.id !== appt.id));
      // Push the client a "your appointment was rejected" notification, awaited
      // before WhatsApp (opening WhatsApp backgrounds the WebView).
      await notifyClientRejected(salonId, appt);
      const link = buildWhatsAppRejectionLink({
        clientPhone: appt.clientPhone,
        clientName:  appt.clientName,
        serviceName: appt.serviceName,
        startTime:   appt.startTime.toDate(),
        endTime:     appt.endTime.toDate(),
      });
      await openWhatsApp(link);
    } catch (err) {
      console.error("reject failed:", err);
      alert("שגיאה בדחיית התור. נסי שנית.");
    } finally {
      setLoadingId(null);
    }
  }

  async function cancel(appt: Appointment) {
    if (!confirm(`לבטל את התור של ${appt.clientName}?`)) return;
    setLoadingId(appt.id + "-cancel");
    try {
      await cancelAppointment(salonId, appt.id);
      setUpcoming((prev) => prev.filter((a) => a.id !== appt.id));
      setTodayAppts((prev) => prev.map((a) => (a.id === appt.id ? { ...a, status: "cancelled" } : a)));
      // Push the client a "your appointment was cancelled" notification.
      // Awaited BEFORE WhatsApp (opening WhatsApp backgrounds the WebView).
      await notifyClientCancelled(salonId, appt);
      if (clinic) {
        const link = buildWhatsAppCancellationLink({
          clientPhone: appt.clientPhone,
          clientName:  appt.clientName,
          serviceName: appt.serviceName,
          startTime:   appt.startTime.toDate(),
          endTime:     appt.endTime.toDate(),
          clinicAddress: clinic.address,
        });
        await openWhatsApp(link);
      }
    } catch (err) {
      console.error("cancel failed:", err);
      alert("שגיאה בביטול התור. נסי שנית.");
    } finally {
      setLoadingId(null);
    }
  }

  function copyLink(url: string, key: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  }

  const base = salon?.bookingUrl ?? `${process.env.NEXT_PUBLIC_APP_URL ?? "https://salonss.vercel.app"}/${salonId}`;
  const bookingLink  = `${base}/book`;
  const downloadLink = `${base}/download`;

  if (loading) {
    return (
      <div className="pt-20 flex justify-center">
        <span className="inline-block rounded-full animate-pulse" style={{ width: 14, height: 14, background: "var(--rose)" }} />
      </div>
    );
  }

  return (
    <div className="pb-20 md:pb-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-extrabold mb-6" style={{ color: "var(--foreground)" }}>
        לוח ניהול
      </h1>

      {/* Cron heartbeat alarm — reminders silently stopped being sent */}
      {cronStale && (
        <div className="mb-4 p-4" style={{ borderRadius: "var(--radius)", border: "1.5px solid #E53E3E", background: "#FDECEC" }}>
          <p className="text-sm font-bold" style={{ color: "#C2596B" }}>
            ⚠️ התזכורות אולי לא נשלחות
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
            {cronAge != null
              ? `שירות התזכורות לא רץ כבר ${cronAge} דקות — ייתכן שלקוחות לא יקבלו תזכורת.`
              : "שירות התזכורות לא רץ לאחרונה."}
          </p>
        </div>
      )}

      {/* Push opt-in (native, only until enabled) */}
      <AdminNotificationsBanner />

      {/* Keep push working after the app is swiped away (OEM battery-kill) */}
      <BackgroundDeliveryGuide />

      {/* Push self-test — surfaces the exact failing gate */}
      <AdminPushTest />

      {/* Broadcast "app update available" to all clients → opens /download */}
      <AdminUpdateBroadcast />

      {/* Full diagnostics (permission, battery, token, server registration) */}
      <Link
        href={`/${salonId}/notification-check`}
        className="block text-xs font-semibold mb-6"
        style={{ color: "var(--primary)" }}
      >
        בדיקת התראות מתקדמת ←
      </Link>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard label="תורים היום"     value={todayAppts.length} />
        <StatCard label="ממתינים לאישור" value={pending.length} highlight={pending.length > 0} />
      </div>

      {/* Salon share card */}
      <section className="mb-6 p-4 rounded-2xl" style={{ background: "var(--rose-soft)" }}>
        <h2 className="font-semibold mb-3 text-right" style={{ color: "var(--rose)" }}>שיתוף הסלון</h2>
        {[
          { label: "כתובת ההזמנה",          url: bookingLink  },
          { label: "קישור להורדת האפליקציה", url: downloadLink },
        ].map(({ label, url }) => (
          <div key={label} className="flex items-center gap-2 mb-2 last:mb-0">
            <span className="text-sm shrink-0 w-36 text-right" style={{ color: "var(--muted-foreground)" }}>{label}</span>
            <span
              className="flex-1 text-xs rounded-lg px-2 py-1.5 truncate select-all"
              dir="ltr"
              style={{ background: "var(--surface)", color: "var(--foreground)", fontFamily: "monospace" }}
            >
              {url}
            </span>
            <button
              onClick={() => copyLink(url, label)}
              className="text-xs px-2 py-1.5 rounded-lg shrink-0 border font-bold active:scale-95"
              style={{ borderColor: "var(--rose)", color: "var(--rose)", background: "var(--surface)" }}
            >
              {copiedKey === label ? "הועתק ✓" : "העתק"}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2 py-1.5 rounded-lg shrink-0 font-bold active:scale-95"
              style={{ background: "var(--rose)", color: "#fff" }}
            >
              פתח
            </a>
          </div>
        ))}
      </section>

      {/* Today schedule */}
      {todayAppts.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-bold mb-3" style={{ color: "var(--muted-foreground)" }}>
            לוח היום
          </h2>
          <div className="flex flex-col gap-2">
            {todayAppts.map((a) => {
              const st = STATUS_LABELS[a.status];
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-4"
                  style={{ borderRadius: "var(--radius)", background: "var(--surface)", boxShadow: "var(--card-shadow)" }}
                >
                  <div>
                    <p className="font-bold text-sm" style={{ color: "var(--foreground)" }}>{a.clientName}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                      {formatTime(a.startTime.toDate())} · {a.serviceName}
                    </p>
                  </div>
                  <span
                    className="text-xs px-3 py-1.5 rounded-full font-bold"
                    style={{ background: st?.bg, color: st?.ink }}
                  >
                    {st?.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Pending approvals */}
      <section className="mb-6">
        <h2 className="text-sm font-bold mb-3" style={{ color: "var(--muted-foreground)" }}>
          ממתינים לאישור {pending.length > 0 && `(${pending.length})`}
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: "var(--muted-foreground)" }}>
            אין בקשות ממתינות
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {pending.map((a) => (
              <PendingCard
                key={a.id}
                appointment={a}
                onApprove={approve}
                onReject={reject}
                loadingId={loadingId}
              />
            ))}
          </div>
        )}
      </section>

      {/* Upcoming appointments */}
      {upcoming.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-bold mb-3" style={{ color: "var(--muted-foreground)" }}>
            תורים קרובים ({upcoming.length})
          </h2>
          <div className="flex flex-col gap-2">
            {upcoming.map((a) => {
              const st = STATUS_LABELS[a.status];
              const start = a.startTime.toDate();
              return (
                <div
                  key={a.id}
                  className="p-4"
                  style={{ borderRadius: "var(--radius)", background: "var(--surface)", boxShadow: "var(--card-shadow)" }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-bold text-sm" style={{ color: "var(--foreground)" }}>
                        {a.clientName}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                        {a.serviceName} · {formatDateShort(start)} · {formatTime(start)}
                      </p>
                    </div>
                    <span
                      className="text-xs px-3 py-1.5 rounded-full font-bold flex-shrink-0"
                      style={{ background: st?.bg, color: st?.ink }}
                    >
                      {st?.label}
                    </span>
                  </div>
                  {a.status === "approved" && (
                    <div className="flex gap-2 flex-wrap">
                      <a
                        href={buildGoogleCalendarLink({
                          title: `לק ${a.clientName}`,
                          startTime: a.startTime.toDate(),
                          endTime: a.endTime.toDate(),
                          description: `שירות: ${a.serviceName}`,
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-3 py-2 rounded-full border font-bold"
                        style={{ borderColor: "var(--border-color)", color: "var(--foreground)", background: "var(--surface)" }}
                      >
                        📅 הוסף ליומן
                      </a>
                      <button
                        onClick={() => cancel(a)}
                        disabled={loadingId === a.id + "-cancel"}
                        className="text-xs px-3 py-2 rounded-full border font-bold disabled:opacity-50"
                        style={{ borderColor: "#E53E3E", color: "#E53E3E" }}
                      >
                        {loadingId === a.id + "-cancel" ? "..." : "ביטול + וואטסאפ"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3 mt-6">
        {[
          { href: `/${salonId}/admin/appointments`, label: "כל התורים" },
          { href: `/${salonId}/admin/services`,     label: "שירותים" },
          { href: `/${salonId}/admin/availability`, label: "זמינות" },
          { href: `/${salonId}/admin/clients`,      label: "לקוחות" },
          { href: `/${salonId}/admin/blocks`,       label: "שחרור חסימות" },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 p-4 transition-all active:scale-[0.99]"
            style={{ borderRadius: "var(--radius)", background: "var(--surface)", boxShadow: "var(--card-shadow)" }}
          >
            <span className="rounded-full" style={{ width: 8, height: 8, background: "var(--rose)" }} />
            <span className="text-sm font-bold" style={{ color: "var(--foreground)" }}>{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight }: {
  label: string; value: number; highlight?: boolean;
}) {
  return (
    <div
      className="p-5 text-center"
      style={{
        borderRadius: "var(--radius)",
        background: highlight ? "var(--rose-soft)" : "var(--surface)",
        boxShadow: "var(--card-shadow)",
        border: highlight ? "1.5px solid var(--rose)" : "1px solid transparent",
      }}
    >
      <div className="text-4xl font-extrabold" style={{ color: highlight ? "var(--rose)" : "var(--foreground)" }}>{value}</div>
      <div className="text-xs mt-1.5 font-semibold" style={{ color: "var(--muted-foreground)" }}>{label}</div>
    </div>
  );
}

function PendingCard({
  appointment,
  onApprove,
  onReject,
  loadingId,
}: {
  appointment: Appointment;
  onApprove:   (a: Appointment) => void;
  onReject:    (a: Appointment) => void;
  loadingId:   string | null;
}) {
  const start       = appointment.startTime.toDate();
  const isApproving = loadingId === appointment.id + "-approve";
  const isRejecting = loadingId === appointment.id + "-reject";
  const isBusy      = isApproving || isRejecting;
  return (
    <div
      className="p-5"
      style={{ borderRadius: "var(--radius)", border: "2px solid var(--rose)", background: "var(--surface)", boxShadow: "var(--card-shadow)" }}
    >
      <div className="mb-3">
        <div className="flex justify-between items-start">
          <div>
            <p className="font-bold text-sm" style={{ color: "var(--foreground)" }}>
              {appointment.clientName}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }} dir="ltr">
              {appointment.clientPhone}
            </p>
          </div>
          {appointment.status === "change_requested" && (
            <span className="text-xs px-3 py-1.5 rounded-full font-bold" style={{ background: "#F0EAF6", color: "#8B6BB0" }}>
              בקשת שינוי
            </span>
          )}
        </div>
        <div className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
          <span>{appointment.serviceName}</span>
          <span className="mx-2">·</span>
          <span>{start.toLocaleDateString("he-IL", { weekday: "short", day: "numeric", month: "short" })}</span>
          <span className="mx-2">·</span>
          <span>{formatTime(start)}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onApprove(appointment)}
          disabled={isBusy}
          className="flex-1 py-3 rounded-full text-sm font-bold text-white disabled:opacity-50"
          style={{ background: "#3F8A5E" }}
        >
          {isApproving ? "..." : "אישור + וואטסאפ"}
        </button>
        <button
          onClick={() => onReject(appointment)}
          disabled={isBusy}
          className="flex-1 py-3 rounded-full text-sm font-bold border disabled:opacity-50"
          style={{ borderColor: "var(--border-color)", color: "var(--muted-foreground)" }}
        >
          {isRejecting ? "..." : "דחייה + וואטסאפ"}
        </button>
      </div>
    </div>
  );
}
