"use client";
import { useEffect, useMemo, useState } from "react";
import { useSalon } from "@/contexts/SalonProvider";
import { getAllAppointments } from "@/lib/firestore/appointments";
import type { Appointment } from "@/types";

const DAY_NAMES = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function firstOfMonth(): string {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** An appointment counts as "served" (revenue-eligible) when completed, or approved
 *  and already finished — mirroring the my-appointments visual remap. */
function isServed(a: Appointment, nowMs: number): boolean {
  return a.status === "completed" || (a.status === "approved" && a.endTime.toMillis() <= nowMs);
}

export default function AdminReportsPage() {
  const { salonId } = useSalon();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState<string>(firstOfMonth());
  const [to, setTo] = useState<string>(ymd(new Date()));

  useEffect(() => {
    getAllAppointments(salonId)
      .then(setAppointments)
      .catch((e) => console.error("reports load failed:", e))
      .finally(() => setLoading(false));
  }, []);

  const report = useMemo(() => {
    const fromMs = new Date(`${from}T00:00:00`).getTime();
    const toMs = new Date(`${to}T23:59:59`).getTime();
    const nowMs = Date.now();

    const inRange = appointments.filter((a) => {
      const t = a.startTime.toMillis();
      return t >= fromMs && t <= toMs;
    });

    let revenue = 0;
    let servedCount = 0;
    let pendingCount = 0;
    let cancelledCount = 0;
    let pricedServed = 0; // served appts that actually have a recorded price
    const byService = new Map<string, { count: number; revenue: number }>();
    const byWeekday = [0, 0, 0, 0, 0, 0, 0];
    const clients = new Set<string>();

    for (const a of inRange) {
      if (a.status === "pending" || a.status === "change_requested") pendingCount++;
      if (a.status === "cancelled" || a.status === "rejected") cancelledCount++;

      if (isServed(a, nowMs)) {
        servedCount++;
        byWeekday[a.startTime.toDate().getDay()]++;
        if (a.clientId && a.clientId !== "guest") clients.add(a.clientId);
        const price = a.servicePrice ?? 0;
        if (a.servicePrice != null) pricedServed++;
        revenue += price;
        const cur = byService.get(a.serviceName) ?? { count: 0, revenue: 0 };
        cur.count++;
        cur.revenue += price;
        byService.set(a.serviceName, cur);
      }
    }

    const total = inRange.length;
    const cancellationRate = total > 0 ? Math.round((cancelledCount / total) * 100) : 0;
    const services = [...byService.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue);
    const maxWeekday = Math.max(1, ...byWeekday);
    const maxServiceRevenue = Math.max(1, ...services.map((s) => s.revenue));

    return {
      total, revenue, servedCount, pendingCount, cancelledCount, pricedServed,
      cancellationRate, services, byWeekday, maxWeekday, maxServiceRevenue,
      uniqueClients: clients.size,
    };
  }, [appointments, from, to]);

  function exportCsv() {
    const lines: string[] = [];
    lines.push(`דוח,${from} עד ${to}`);
    lines.push("");
    lines.push(`סה""כ תורים,${report.total}`);
    lines.push(`בוצעו,${report.servedCount}`);
    lines.push(`ממתינים,${report.pendingCount}`);
    lines.push(`בוטלו/נדחו,${report.cancelledCount}`);
    lines.push(`הכנסה (₪),${report.revenue}`);
    lines.push(`לקוחות ייחודיים,${report.uniqueClients}`);
    lines.push("");
    lines.push("שירות,כמות,הכנסה");
    for (const s of report.services) lines.push(`${s.name},${s.count},${s.revenue}`);
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const inputStyle: React.CSSProperties = {
    padding: "10px 12px", borderRadius: 12, fontSize: 14,
    border: "1px solid var(--border-color)", background: "var(--accent)",
    color: "var(--foreground)", outline: "none",
  };

  return (
    <div className="pb-20 md:pb-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-extrabold mb-4" style={{ color: "var(--foreground)" }}>דוחות</h1>

      {/* Range picker */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className="text-xs mb-1 block" style={{ color: "var(--muted-foreground)" }}>מתאריך</label>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: "var(--muted-foreground)" }}>עד תאריך</label>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
        </div>
        <button
          onClick={exportCsv}
          className="px-5 py-2.5 text-sm font-bold"
          style={{ background: "var(--rose-soft)", color: "var(--rose)", borderRadius: "var(--pill)", border: "1.5px solid var(--rose)" }}
        >
          ייצוא CSV
        </button>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <span className="inline-block rounded-full animate-pulse" style={{ width: 14, height: 14, background: "var(--rose)" }} />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <StatCard label="הכנסה" value={`₪${report.revenue.toLocaleString("he-IL")}`} accent />
            <StatCard label="תורים שבוצעו" value={String(report.servedCount)} />
            <StatCard label="לקוחות ייחודיים" value={String(report.uniqueClients)} />
            <StatCard label="אחוז ביטולים" value={`${report.cancellationRate}%`} />
          </div>

          {report.servedCount > report.pricedServed && (
            <p className="text-xs mb-6" style={{ color: "var(--muted-foreground)" }}>
              * ההכנסה מחושבת לפי תורים עם מחיר שמור ({report.pricedServed} מתוך {report.servedCount}). תורים ישנים ללא מחיר אינם נכללים.
            </p>
          )}

          {/* Revenue by service */}
          <h2 className="text-sm font-extrabold mb-3" style={{ color: "var(--foreground)" }}>הכנסה לפי שירות</h2>
          {report.services.length === 0 ? (
            <p className="text-sm mb-6" style={{ color: "var(--muted-foreground)" }}>אין נתונים בטווח זה</p>
          ) : (
            <div className="flex flex-col gap-2.5 mb-7">
              {report.services.map((s) => (
                <div key={s.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-bold" style={{ color: "var(--foreground)" }}>{s.name}</span>
                    <span style={{ color: "var(--muted-foreground)" }}>₪{s.revenue.toLocaleString("he-IL")} · {s.count}</span>
                  </div>
                  <div className="w-full rounded-full" style={{ height: 8, background: "var(--accent)" }}>
                    <div className="rounded-full" style={{ height: 8, width: `${(s.revenue / report.maxServiceRevenue) * 100}%`, background: "var(--rose)" }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Bookings by weekday */}
          <h2 className="text-sm font-extrabold mb-3" style={{ color: "var(--foreground)" }}>תורים לפי יום בשבוע</h2>
          <div className="flex items-end justify-between gap-2" style={{ height: 120 }}>
            {report.byWeekday.map((count, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1.5" style={{ height: "100%" }}>
                <span className="text-xs font-bold" style={{ color: "var(--muted-foreground)" }}>{count}</span>
                <div className="w-full rounded-t-lg" style={{ height: `${(count / report.maxWeekday) * 90}%`, minHeight: count > 0 ? 6 : 0, background: "var(--rose)" }} />
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{DAY_NAMES[i]}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="p-5" style={{ borderRadius: "var(--radius)", background: accent ? "var(--rose)" : "var(--surface)", boxShadow: "var(--card-shadow)" }}>
      <p className="text-xs mb-1" style={{ color: accent ? "rgba(255,255,255,0.85)" : "var(--muted-foreground)" }}>{label}</p>
      <p className="text-2xl font-extrabold" style={{ color: accent ? "white" : "var(--foreground)" }}>{value}</p>
    </div>
  );
}
