"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSalon } from "@/contexts/SalonProvider";
import {
  getAllAppointments, updateAppointmentStatus, cancelAppointment,
} from "@/lib/firestore/appointments";
import { getClinicSettings } from "@/lib/firestore/settings";
import { buildWhatsAppApprovalLink, buildWhatsAppCancellationLink, buildWhatsAppRejectionLink } from "@/lib/whatsapp";
import { openWhatsApp } from "@/lib/open-external";
import { notifyClientApproved, notifyClientCancelled, notifyClientRejected } from "@/lib/notify-client";
import type { Appointment, ClinicSettings } from "@/types";

const STATUS_LABELS: Record<string, { label: string; ink: string; bg: string }> = {
  pending:          { label: "ממתין", ink: "#CE7C9B", bg: "#FCEFF3" },
  change_requested: { label: "ממתין", ink: "#CE7C9B", bg: "#FCEFF3" },
  approved:         { label: "אושר",  ink: "#3F8A5E", bg: "#E8F3EC" },
  rejected:         { label: "נדחה",  ink: "#C2596B", bg: "#F8E9EC" },
  cancelled:        { label: "נדחה",  ink: "#C2596B", bg: "#F8E9EC" },
  completed:        { label: "בוצע",  ink: "#7C8794", bg: "#EEF1F5" },
};

type FilterTab = "all" | "pending" | "approved" | "rejected";
const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: "all",      label: "הכל" },
  { value: "pending",  label: "ממתין" },
  { value: "approved", label: "מאושר" },
  { value: "rejected", label: "נדחה" },
];

export default function AdminAppointmentsPage() {
  const { salonId } = useSalon();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [clinic, setClinic] = useState<ClinicSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getAllAppointments(salonId), getClinicSettings(salonId)])
      .then(([appts, c]) => {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 3);
        cutoff.setHours(0, 0, 0, 0);
        setAppointments(appts.filter((a) => a.startTime.toDate() >= cutoff));
        setClinic(c);
      })
      .catch((err) => console.error("appointments page load failed:", err))
      .finally(() => setLoading(false));
  }, [salonId]);

  async function handleApprove(appt: Appointment) {
    setLoadingId(appt.id + "-approve");
    try {
      await updateAppointmentStatus(salonId, appt.id, "approved");
      setAppointments((prev) =>
        prev.map((a) => (a.id === appt.id ? { ...a, status: "approved" } : a))
      );
      // Push the client a "your appointment was approved" notification, before
      // WhatsApp opens (which backgrounds the WebView).
      await notifyClientApproved(salonId, appt);
      if (clinic) {
        const link = buildWhatsAppApprovalLink({
          clientPhone: appt.clientPhone,
          clientName: appt.clientName,
          serviceName: appt.serviceName,
          startTime: appt.startTime.toDate(),
          endTime: appt.endTime.toDate(),
          clinicAddress: clinic.address,
          salonId,
          appointmentId: appt.id,
          baseUrl: window.location.origin,
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

  async function handleReject(appt: Appointment) {
    setLoadingId(appt.id + "-reject");
    try {
      await updateAppointmentStatus(salonId, appt.id, "rejected");
      setAppointments((prev) =>
        prev.map((a) => (a.id === appt.id ? { ...a, status: "rejected" } : a))
      );
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

  async function handleCancel(appt: Appointment) {
    if (!confirm(`לבטל את התור של ${appt.clientName}?`)) return;
    setLoadingId(appt.id + "-cancel");
    try {
      await cancelAppointment(salonId, appt.id);
      setAppointments((prev) =>
        prev.map((a) => (a.id === appt.id ? { ...a, status: "cancelled" } : a))
      );
      await notifyClientCancelled(salonId, appt);
      if (clinic) {
        const link = buildWhatsAppCancellationLink({
          clientPhone:   appt.clientPhone,
          clientName:    appt.clientName,
          serviceName:   appt.serviceName,
          startTime:     appt.startTime.toDate(),
          endTime:       appt.endTime.toDate(),
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

  // Filter: "נדחה" tab includes both rejected + cancelled
  const filtered = filter === "all"
    ? appointments
    : filter === "rejected"
      ? appointments.filter((a) => a.status === "rejected" || a.status === "cancelled")
      : filter === "pending"
        ? appointments.filter((a) => a.status === "pending" || a.status === "change_requested")
        : appointments.filter((a) => a.status === filter);

  return (
    <div className="pb-20 md:pb-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-extrabold" style={{ color: "var(--foreground)" }}>
          ניהול תורים
        </h1>
        <Link
          href={`/${salonId}/admin/appointments/new`}
          className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold text-white"
          style={{ background: "var(--primary)", borderRadius: "var(--pill)" }}
        >
          הוספת תור
        </Link>
      </div>


      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {FILTER_TABS.map((f) => {
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className="flex-shrink-0 px-4 py-2 text-sm font-bold transition-all"
              style={
                active
                  ? { background: "var(--rose)", color: "white", borderRadius: "var(--pill)" }
                  : { background: "var(--surface)", color: "var(--muted-foreground)", borderRadius: "var(--pill)", border: "1px solid var(--border-color)" }
              }
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <span className="inline-block rounded-full animate-pulse" style={{ width: 14, height: 14, background: "var(--rose)" }} />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center py-10 text-sm" style={{ color: "var(--muted-foreground)" }}>
          אין תורים
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((appt) => (
            <AppointmentRow
              key={appt.id}
              appointment={appt}
              onApprove={handleApprove}
              onReject={handleReject}
              onCancel={handleCancel}
              loadingId={loadingId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AppointmentRow({
  appointment,
  onApprove,
  onReject,
  onCancel,
  loadingId,
}: {
  appointment: Appointment;
  onApprove:   (a: Appointment) => void;
  onReject:    (a: Appointment) => void;
  onCancel:    (a: Appointment) => void;
  loadingId:   string | null;
}) {
  const st          = STATUS_LABELS[appointment.status];
  const start       = appointment.startTime.toDate();
  const isPending   = appointment.status === "pending" || appointment.status === "change_requested";
  const isApproved  = appointment.status === "approved";
  const isApproving = loadingId === appointment.id + "-approve";
  const isRejecting = loadingId === appointment.id + "-reject";
  const isCanceling = loadingId === appointment.id + "-cancel";
  const isBusy      = isApproving || isRejecting || isCanceling;

  return (
    <div
      className="p-5"
      style={{ borderRadius: "var(--radius)", background: "var(--surface)", boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <p className="font-bold text-sm" style={{ color: "var(--foreground)" }}>
            {appointment.clientName}
          </p>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }} dir="ltr">
            {appointment.clientPhone}
          </p>
        </div>
        <span
          className="text-xs px-3 py-1.5 rounded-full font-bold"
          style={{ background: st?.bg, color: st?.ink }}
        >
          {st?.label}
        </span>
      </div>
      <p className="text-sm mb-1" style={{ color: "var(--muted-foreground)" }}>
        {appointment.serviceName} ·{" "}
        {start.toLocaleDateString("he-IL", { day: "numeric", month: "long" })} ·{" "}
        {start.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
      </p>
      {(appointment.rescheduleCount ?? 0) > 0 && (
        <p className="text-xs mb-3 font-bold" style={{ color: "#8B6BB0" }}>
          ⟳ הלקוחה שינתה מועד — נדרש אישור מחדש
        </p>
      )}
      {(appointment.rescheduleCount ?? 0) === 0 && <div className="mb-3" />}
      {isPending && (
        <div className="flex gap-2">
          <button
            onClick={() => onApprove(appointment)}
            disabled={isBusy}
            className="flex-1 py-2.5 rounded-full text-xs font-bold text-white disabled:opacity-50"
            style={{ background: "#3F8A5E" }}
          >
            {isApproving ? "..." : "אישור + וואטסאפ"}
          </button>
          <button
            onClick={() => onReject(appointment)}
            disabled={isBusy}
            className="flex-1 py-2.5 rounded-full text-xs font-bold border disabled:opacity-50"
            style={{ borderColor: "var(--border-color)", color: "var(--muted-foreground)" }}
          >
            {isRejecting ? "..." : "דחייה"}
          </button>
        </div>
      )}
      {isApproved && (
        <button
          onClick={() => onCancel(appointment)}
          disabled={isBusy}
          className="text-xs px-4 py-2 rounded-full border font-bold disabled:opacity-50"
          style={{ borderColor: "var(--border-color)", color: "var(--muted-foreground)" }}
        >
          {isCanceling ? "..." : "ביטול + וואטסאפ"}
        </button>
      )}
    </div>
  );
}
