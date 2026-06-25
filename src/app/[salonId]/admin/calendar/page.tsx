"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSalon } from "@/contexts/SalonProvider";
import { getAllAppointments } from "@/lib/firestore/appointments";
import { getAvailabilityRules, getBlockedTimes } from "@/lib/firestore/settings";
import type { Appointment, AvailabilityRule, BlockedTime } from "@/types";

const STATUS_STYLE: Record<string, { label: string; ink: string; bg: string; bar: string }> = {
  pending:          { label: "ממתין", ink: "#CE7C9B", bg: "#FCEFF3", bar: "#CE7C9B" },
  change_requested: { label: "שינוי מועד", ink: "#8B6BB0", bg: "#F0EAF6", bar: "#8B6BB0" },
  approved:         { label: "מאושר", ink: "#3F8A5E", bg: "#E8F3EC", bar: "#3F8A5E" },
  completed:        { label: "בוצע", ink: "#7C8794", bg: "#EEF1F5", bar: "#9AA5B1" },
};
// Statuses shown on the schedule (rejected/cancelled are hidden to declutter).
const VISIBLE = new Set(["pending", "change_requested", "approved", "completed"]);

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const OPENING_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Open-hours window for a date from availability rules (one_time overrides recurring). */
function openWindow(date: Date, rules: AvailabilityRule[]): string | null {
  const dk = dayKeyOf(date);
  const weekday = date.getDay();
  const oneTime = rules.filter((r) => r.type === "one_time" && r.date && dayKeyOf(r.date.toDate()) === dk);
  const recurring = rules.filter((r) => r.type === "recurring" && r.dayOfWeek === weekday);
  const applicable = oneTime.length > 0 ? oneTime : recurring;
  const open = applicable.filter((r) => r.isOpen);
  if (open.length === 0) return null;
  const ranges = open
    .map((r) => `${r.openTime}–${r.closeTime}`)
    .sort();
  return ranges.join(", ");
}

export default function AdminCalendarPage() {
  const { salonId } = useSalon();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [blocked, setBlocked] = useState<BlockedTime[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"day" | "week">("day");
  const [cursor, setCursor] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });

  useEffect(() => {
    Promise.all([getAllAppointments(salonId), getAvailabilityRules(salonId), getBlockedTimes(salonId)])
      .then(([appts, r, b]) => { setAppointments(appts); setRules(r); setBlocked(b); })
      .catch((e) => console.error("calendar load failed:", e))
      .finally(() => setLoading(false));
  }, []);

  // Days currently shown: 1 (day mode) or 7 starting on the cursor's week Sunday.
  const days = useMemo(() => {
    if (mode === "day") return [cursor];
    const weekStart = addDays(cursor, -cursor.getDay()); // back to Sunday
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [cursor, mode]);

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      if (!VISIBLE.has(a.status)) continue;
      const dk = dayKeyOf(a.startTime.toDate());
      (map.get(dk) ?? map.set(dk, []).get(dk)!).push(a);
    }
    for (const list of map.values()) list.sort((x, y) => x.startTime.toMillis() - y.startTime.toMillis());
    return map;
  }, [appointments]);

  function move(dir: -1 | 1) {
    setCursor((c) => addDays(c, dir * (mode === "week" ? 7 : 1)));
  }
  function goToday() {
    const d = new Date(); d.setHours(0, 0, 0, 0); setCursor(d);
  }

  const rangeLabel = mode === "day"
    ? cursor.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })
    : `${days[0].toLocaleDateString("he-IL", { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString("he-IL", { day: "numeric", month: "short" })}`;

  return (
    <div className="pb-20 md:pb-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-extrabold" style={{ color: "var(--foreground)" }}>יומן</h1>
        <Link
          href={`/${salonId}/admin/appointments/new`}
          className="px-5 py-2.5 text-sm font-bold text-white"
          style={{ background: "var(--primary)", borderRadius: "var(--pill)" }}
        >
          הוספת תור
        </Link>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-4">
        {(["day", "week"] as const).map((m) => {
          const active = mode === m;
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="px-4 py-2 text-sm font-bold transition-all"
              style={active
                ? { background: "var(--rose)", color: "white", borderRadius: "var(--pill)" }
                : { background: "var(--surface)", color: "var(--muted-foreground)", borderRadius: "var(--pill)", border: "1px solid var(--border-color)" }}
            >
              {m === "day" ? "יום" : "שבוע"}
            </button>
          );
        })}
        <button
          onClick={goToday}
          className="ms-auto px-4 py-2 text-sm font-bold"
          style={{ background: "var(--rose-soft)", color: "var(--rose)", borderRadius: "var(--pill)", border: "1.5px solid var(--rose)" }}
        >
          היום
        </button>
      </div>

      {/* Range nav */}
      <div className="flex items-center justify-between mb-5" dir="ltr">
        <button onClick={() => move(-1)} className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg" style={{ background: "var(--surface)", border: "1px solid var(--border-color)", color: "var(--foreground)" }}>‹</button>
        <span className="font-bold text-sm" style={{ color: "var(--foreground)" }}>{rangeLabel}</span>
        <button onClick={() => move(1)} className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg" style={{ background: "var(--surface)", border: "1px solid var(--border-color)", color: "var(--foreground)" }}>›</button>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <span className="inline-block rounded-full animate-pulse" style={{ width: 14, height: 14, background: "var(--rose)" }} />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {days.map((day) => {
            const dk = dayKeyOf(day);
            const list = byDay.get(dk) ?? [];
            const hours = openWindow(day, rules);
            const dayBlocks = blocked.filter((b) => dayKeyOf(b.date.toDate()) === dk);
            const isToday = dk === dayKeyOf(new Date());
            return (
              <div key={dk}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-extrabold" style={{ color: isToday ? "var(--rose)" : "var(--foreground)" }}>
                    {DAY_NAMES[day.getDay()]} · {day.toLocaleDateString("he-IL", { day: "numeric", month: "long" })}
                  </h2>
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }} dir="ltr">
                    {hours ?? "סגור"}
                  </span>
                </div>

                {dayBlocks.map((b) => (
                  <div key={b.id} className="mb-2 px-4 py-2 text-xs font-semibold" style={{ borderRadius: 12, background: "#F1ECEE", color: "#8B7E84" }}>
                    🚫 חסום {b.isAllDay ? "(כל היום)" : `${b.startTime}–${b.endTime}`}{b.reason ? ` · ${b.reason}` : ""}
                  </div>
                ))}

                {list.length === 0 ? (
                  <p className="text-xs py-3" style={{ color: "var(--muted-foreground)" }}>אין תורים</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {list.map((a) => {
                      const stt = STATUS_STYLE[a.status] ?? STATUS_STYLE.approved;
                      const start = a.startTime.toDate();
                      const end = a.endTime.toDate();
                      return (
                        <div key={a.id} className="flex items-stretch gap-3 p-3" style={{ borderRadius: "var(--radius)", background: "var(--surface)", boxShadow: "var(--card-shadow)" }}>
                          <span className="rounded-full" style={{ width: 4, background: stt.bar }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-extrabold text-sm" style={{ color: "var(--foreground)" }} dir="ltr">
                                {start.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}–{end.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              <span className="text-xs px-2.5 py-1 rounded-full font-bold whitespace-nowrap" style={{ background: stt.bg, color: stt.ink }}>{stt.label}</span>
                            </div>
                            <p className="text-sm font-bold truncate mt-0.5" style={{ color: "var(--foreground)" }}>{a.clientName}</p>
                            <p className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{a.serviceName}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 text-center">
        <Link href={`/${salonId}/admin/appointments`} className="text-sm font-semibold" style={{ color: "var(--primary)" }}>
          לניהול ואישור תורים ←
        </Link>
      </div>
    </div>
  );
}
