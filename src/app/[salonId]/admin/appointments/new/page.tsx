"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSalon } from "@/contexts/SalonProvider";
import { auth } from "@/lib/firebase";
import { getServices } from "@/lib/firestore/services";
import { getSalonClients } from "@/lib/firestore/users";
import type { Service, AppUser } from "@/types";

export default function AdminNewAppointmentPage() {
  const router = useRouter();
  const { salonId } = useSalon();

  const [services, setServices]   = useState<Service[]>([]);
  const [clients,  setClients]    = useState<AppUser[]>([]);
  const [loading,  setLoading]    = useState(true);
  const [saving,   setSaving]     = useState(false);

  // Client
  const [clientType, setClientType] = useState<"registered" | "custom">("custom");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [customName,  setCustomName]  = useState("");
  const [customPhone, setCustomPhone] = useState("");

  // Appointment details
  const [serviceId,  setServiceId]  = useState("");
  const [date,       setDate]       = useState("");
  const [startTime,  setStartTime]  = useState("");
  const [notes,      setNotes]      = useState("");

  useEffect(() => {
    Promise.all([getServices(salonId, false), getSalonClients(salonId)]).then(([svcs, cls]) => {
      setServices(svcs);
      setClients(cls);
      setLoading(false);
    });
  }, [salonId]);

  const selectedService = services.find((s) => s.id === serviceId);
  const selectedClient  = clients.find((c) => c.id === selectedClientId);

  const filteredClients = clients.filter(
    (c) =>
      !clientSearch ||
      c.name.includes(clientSearch) ||
      c.phone.includes(clientSearch)
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedService || !date || !startTime) return;
    if (clientType === "registered" && !selectedClientId) {
      alert("יש לבחור לקוחה");
      return;
    }
    if (clientType === "custom" && !customName.trim()) {
      alert("יש להזין שם לקוחה");
      return;
    }

    setSaving(true);
    try {
      const clientName  = clientType === "registered" ? (selectedClient?.name  ?? "") : customName.trim();
      const clientPhone = clientType === "registered" ? (selectedClient?.phone ?? "") : customPhone.trim();
      const clientId    = clientType === "registered" ? selectedClientId : "admin_entry";

      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        alert("יש להתחבר מחדש.");
        setSaving(false);
        return;
      }

      // Server route enforces the booking lock (no double-booking) and resolves
      // the time in Asia/Jerusalem. Direct client writes are no longer allowed.
      const res = await fetch("/api/admin/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          salonId,
          date,
          startTime,
          serviceId:       selectedService.id,
          serviceName:     selectedService.name,
          serviceDuration: selectedService.duration,
          ...(selectedService.price != null && { servicePrice: selectedService.price }),
          clientId,
          clientName,
          clientPhone: clientPhone || undefined,
          notes: notes.trim() || undefined,
          status: "approved",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        alert(data.error === "slot-taken"
          ? "השעה הזו כבר תפוסה. בחרי שעה אחרת."
          : "שגיאה ביצירת התור. נסי שנית.");
        setSaving(false);
        return;
      }

      router.push(`/${salonId}/admin/appointments`);
    } catch (err) {
      console.error("admin create appointment failed:", err);
      alert("שגיאה ביצירת התור. נסי שנית.");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="pt-20 flex justify-center">
        <span className="inline-block rounded-full animate-pulse" style={{ width: 14, height: 14, background: "var(--rose)" }} />
      </div>
    );
  }

  const sectionCard: React.CSSProperties = { borderRadius: "var(--radius)", background: "var(--surface)", boxShadow: "var(--card-shadow)" };
  const input: React.CSSProperties = {
    width: "100%", padding: "12px 15px", borderRadius: 14, fontSize: 14,
    border: "1px solid var(--border-color)", background: "var(--accent)",
    color: "var(--foreground)", outline: "none",
  };

  return (
    <div className="pb-20 md:pb-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="font-bold flex items-center gap-1.5 px-4 py-2.5 text-sm transition-all active:scale-95"
          style={{ color: "var(--rose)", background: "var(--rose-soft)", borderRadius: "var(--pill)", border: "1.5px solid var(--rose)" }}
        >
          <span style={{ fontSize: 18 }}>›</span> חזרה
        </button>
        <h1 className="text-2xl font-extrabold" style={{ color: "var(--foreground)" }}>
          הוספת תור ידנית
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* ── Client section ───────────────────────────────────── */}
        <div className="p-5" style={sectionCard}>
          <p className="text-sm font-bold mb-3" style={{ color: "var(--foreground)" }}>לקוחה</p>

          {/* Toggle */}
          <div className="flex gap-2 mb-4">
            {(["registered", "custom"] as const).map((t) => {
              const active = clientType === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setClientType(t); setSelectedClientId(""); setClientSearch(""); }}
                  className="flex-1 py-2.5 text-sm font-bold transition-all"
                  style={active
                    ? { background: "var(--rose)", color: "white", borderRadius: "var(--pill)" }
                    : { background: "var(--accent)", color: "var(--muted-foreground)", borderRadius: "var(--pill)" }}
                >
                  {t === "registered" ? "לקוחה רשומה" : "שם חופשי"}
                </button>
              );
            })}
          </div>

          {clientType === "registered" ? (
            <>
              <input
                type="text"
                placeholder="חיפוש לפי שם / טלפון"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                style={{ ...input, marginBottom: 8 }}
              />
              <div
                className="max-h-44 overflow-y-auto flex flex-col gap-1 rounded-xl border"
                style={{ borderColor: "var(--border-color)" }}
              >
                {filteredClients.length === 0 ? (
                  <p className="text-xs text-center py-4" style={{ color: "var(--muted-foreground)" }}>
                    אין לקוחות
                  </p>
                ) : (
                  filteredClients.map((c) => {
                    const sel = selectedClientId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedClientId(c.id)}
                        className="flex items-center justify-between px-4 py-2.5 text-sm transition-all"
                        style={{ background: sel ? "var(--rose)" : "var(--surface)", color: sel ? "white" : "var(--foreground)" }}
                      >
                        <span className="font-bold">{c.name}</span>
                        <span className="text-xs" dir="ltr" style={{ color: sel ? "rgba(255,255,255,0.85)" : "var(--muted-foreground)" }}>
                          {c.phone}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <input type="text" placeholder="שם לקוחה *" value={customName} onChange={(e) => setCustomName(e.target.value)} required style={input} />
              <input type="tel" placeholder="מספר טלפון (אופציונלי)" value={customPhone} onChange={(e) => setCustomPhone(e.target.value)} dir="ltr" style={input} />
            </div>
          )}
        </div>

        {/* ── Service ──────────────────────────────────────────── */}
        <div className="p-5" style={sectionCard}>
          <p className="text-sm font-bold mb-3" style={{ color: "var(--foreground)" }}>שירות</p>
          <div className="flex flex-col gap-2">
            {services.map((s) => {
              const sel = serviceId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setServiceId(s.id)}
                  className="flex items-center justify-between px-4 py-3 transition-all text-sm"
                  style={{
                    borderRadius: 14,
                    border: `1.5px solid ${sel ? "var(--rose)" : "var(--border-color)"}`,
                    background: sel ? "var(--rose)" : "var(--accent)",
                    color: sel ? "white" : "var(--foreground)",
                  }}
                >
                  <span className="font-bold">{s.name}</span>
                  <span className="text-xs" style={{ color: sel ? "rgba(255,255,255,0.85)" : "var(--muted-foreground)" }}>
                    {s.duration} דק׳{s.price ? ` · ₪${s.price}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Date & Time ──────────────────────────────────────── */}
        <div className="p-5" style={sectionCard}>
          <p className="text-sm font-bold mb-3" style={{ color: "var(--foreground)" }}>תאריך ושעה</p>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs mb-1 block" style={{ color: "var(--muted-foreground)" }}>תאריך</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={input} />
            </div>
            <div className="flex-1">
              <label className="text-xs mb-1 block" style={{ color: "var(--muted-foreground)" }}>שעת התחלה</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required style={input} />
            </div>
          </div>
          {selectedService && date && startTime && (
            <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>
              סיום:&nbsp;
              {new Date(
                new Date(`${date}T${startTime}`).getTime() + selectedService.duration * 60_000
              ).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>

        {/* ── Notes ────────────────────────────────────────────── */}
        <textarea
          placeholder="הערות (אופציונלי)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full px-4 py-3 text-sm resize-none"
          style={{ borderRadius: "var(--radius)", border: "1px solid var(--border-color)", background: "var(--surface)", color: "var(--foreground)", outline: "none" }}
        />

        {/* ── Submit ───────────────────────────────────────────── */}
        <button
          type="submit"
          disabled={
            saving ||
            !selectedService ||
            !date ||
            !startTime ||
            (clientType === "registered" && !selectedClientId) ||
            (clientType === "custom" && !customName.trim())
          }
          className="w-full py-4 font-bold text-white text-base disabled:opacity-50"
          style={{ background: "var(--primary)", borderRadius: "var(--pill)" }}
        >
          {saving ? "שומר..." : "הוספת תור (מאושר)"}
        </button>
      </form>
    </div>
  );
}
