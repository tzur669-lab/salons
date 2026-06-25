"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSalon } from "@/contexts/SalonProvider";
import { useBookingStore } from "@/store/bookingStore";
import { getServices } from "@/lib/firestore/services";
import { getClinicSettings } from "@/lib/firestore/settings";
import { toDayKey } from "@/lib/timezone";
import { ServiceCard } from "@/components/booking/ServiceCard";
import { TimeSlotPicker } from "@/components/booking/TimeSlotPicker";
import { GuestForm } from "@/components/booking/GuestForm";
import { BookingConfirmation } from "@/components/booking/BookingConfirmation";
import { AppShell } from "@/components/shared/AppShell";
import { toHebrewDateShort, getHebrewHolidays } from "@/lib/hebrew-calendar";
import type { Service, TimeSlot, ClinicSettings } from "@/types";

// ─── Calendar helpers ──────────────────────────────────────────────
const MONTHS_HE = [
  "ינואר","פברואר","מרץ","אפריל","מאי","יוני",
  "יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר",
];
const DAY_HEADERS = ["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];

/** Returns an array of 42 cells (6 weeks × 7 days).
 *  Cells before the 1st of the month and after the last day are null. */
function buildCalendarCells(year: number, month: number): (Date | null)[] {
  const firstDow = new Date(year, month, 1).getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// ─── Page ─────────────────────────────────────────────────────────
export default function BookPage() {
  const { user, appUser } = useAuth();
  const { salonId, salon } = useSalon();
  const store = useBookingStore();

  const [services,     setServices]     = useState<Service[]>([]);
  const [slots,        setSlots]        = useState<TimeSlot[]>([]);
  const [clinicSettings, setClinicSettings] = useState<ClinicSettings | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError,   setSlotsError]   = useState(false);
  const [slotsReload,  setSlotsReload]  = useState(0); // bump to retry
  const [submitting,   setSubmitting]   = useState(false);
  const [done,         setDone]         = useState(false);
  const [guestRecoveryUrl, setGuestRecoveryUrl] = useState<string | null>(null);

  // Calendar navigation state
  const todayMidnight = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
  const minDate = todayMidnight; // today is bookable
  const maxDate = new Date(todayMidnight); maxDate.setDate(maxDate.getDate() + 60);

  const [calYear,    setCalYear]    = useState(minDate.getFullYear());
  const [calMonth,   setCalMonth]   = useState(minDate.getMonth());
  const [holidays,   setHolidays]   = useState<Map<string, string>>(new Map());

  useEffect(() => {
    getServices(salonId, true).then(setServices).catch(console.error);
    getClinicSettings(salonId).then(setClinicSettings).catch(console.error);
  }, []);

  // Load Hebrew holidays whenever the displayed year changes
  useEffect(() => {
    const evs = getHebrewHolidays(calYear);
    const map = new Map(evs.map((e) => [e.date.toDateString(), e.name]));
    setHolidays(map);
  }, [calYear]);

  // Load time slots whenever service + date change. Slots are computed server-side
  // (/api/availability) so this client never reads the appointments collection —
  // the server returns only anonymous slot times, already Israel-tz-correct and with
  // past slots removed.
  useEffect(() => {
    if (!store.selectedService || !store.selectedDate) return;
    const service = store.selectedService;
    const d = store.selectedDate;
    setLoadingSlots(true);
    setSlotsError(false);
    const dayKey = toDayKey(d.getFullYear(), d.getMonth(), d.getDate());
    // AbortController prevents a stale response from a previous date/service
    // selection overwriting the slots for the currently selected one.
    const controller = new AbortController();
    fetch("/api/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ salonId, dayKey, serviceDuration: service.duration }),
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
        setLoadingSlots(false);
      })
      .catch((err: unknown) => {
        if ((err as Error).name === "AbortError") return; // stale request — ignore
        // Fail closed: show an explicit error + retry, never an empty grid that
        // looks like "fully booked" or "no hours" when the load actually failed.
        setSlots([]);
        setSlotsError(true);
        setLoadingSlots(false);
      });
    return () => controller.abort();
  }, [store.selectedService, store.selectedDate, slotsReload]);

  async function submit(guestInfo?: { name: string; phone: string }) {
    if (
      !store.selectedService ||
      !store.selectedStartTime ||
      !store.selectedEndTime ||
      !store.selectedDate
    ) return;

    setSubmitting(true);
    try {
      const token = user ? await user.getIdToken() : null;

      const d = store.selectedDate;
      const dayKey = toDayKey(d.getFullYear(), d.getMonth(), d.getDate());

      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          salonId,
          dayKey,
          startTime:       store.selectedStartTime.toISOString(),
          endTime:         store.selectedEndTime.toISOString(),
          serviceId:       store.selectedService.id,
          serviceName:     store.selectedService.name,
          serviceDuration: store.selectedService.duration,
          // Guests supply name/phone; for auth users the server reads from Firestore.
          ...(!user && { clientName: guestInfo?.name, clientPhone: guestInfo?.phone }),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        if (
          err.error === "slot-taken" ||
          err.error === "slot-in-past" ||
          err.error === "slot-not-found"
        ) {
          store.setStep(2);
          alert("הזמן שבחרת כבר לא פנוי. אנא בחרו זמן אחר.");
          return;
        }
        if (err.error === "rate_limited") {
          alert("בקשות רבות מדי. אנא המתינו מספר דקות ונסו שנית.");
          return;
        }
        throw new Error(err.error ?? "server_error");
      }

      const { appointmentId, guestToken } = await res.json() as { appointmentId: string; guestToken?: string };

      // Guests get a one-time recovery link so they can return to view/cancel the
      // appointment without an account (the token is only returned here, once).
      if (guestToken && typeof window !== "undefined") {
        setGuestRecoveryUrl(`${window.location.origin}/${salonId}/guest?t=${guestToken}`);
      }

      // Notify the admin (email + push). The route reads the appointment document
      // by id as its source of truth, so we send only the id — the notification
      // can't be forged or carry mismatched details. `keepalive` lets the request
      // finish even if the user closes the app right after seeing the confirmation.
      fetch("/api/notify-admin", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salonId, appointmentId }),
      }).catch(console.error);

      setDone(true);
    } catch {
      alert("שגיאה בשליחת הבקשה. נסו שוב.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Confirmation screen ──────────────────────────────────────────
  if (done && store.selectedService && store.selectedStartTime && store.selectedEndTime) {
    const clientName = appUser?.name ?? store.guestInfo?.name ?? "";
    return (
      <AppShell>
        <div className="pt-6">
          <BookingConfirmation
            service={store.selectedService}
            startTime={store.selectedStartTime}
            endTime={store.selectedEndTime}
            clientName={clientName}
            clinicAddress={clinicSettings?.address}
            guestRecoveryUrl={guestRecoveryUrl ?? undefined}
          />
          <button
            onClick={() => { store.reset(); setDone(false); setGuestRecoveryUrl(null); }}
            className="w-full mt-4 py-4 font-bold transition-all"
            style={{ borderRadius: "var(--pill)", border: "1px solid var(--border-color)", background: "var(--surface)", color: "var(--foreground)" }}
          >
            לקביעת תור נוסף
          </button>
        </div>
      </AppShell>
    );
  }

  // ── Calendar month nav ───────────────────────────────────────────
  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  }
  const lastDayOfPrevMonth = new Date(calYear, calMonth, 0);
  const firstDayOfNextMonth = new Date(calYear, calMonth + 1, 1);
  const canPrev = lastDayOfPrevMonth >= minDate;
  const canNext = firstDayOfNextMonth <= maxDate;

  const calCells = buildCalendarCells(calYear, calMonth);

  const stepLabels = ["טיפול", "מועד", "אישור"];

  // ── Main render ──────────────────────────────────────────────────
  return (
    <AppShell>
      <div className="pt-6 pb-10 max-w-xl mx-auto">
        <h1 className="text-2xl font-extrabold mb-6" style={{ color: "var(--foreground)" }}>
          קביעת תור
        </h1>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {stepLabels.map((label, i) => {
            const reached = store.step >= i + 1;
            const current = store.step === i + 1;
            return (
              <div key={i} className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="flex items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      width: 24, height: 24,
                      background: reached ? "var(--rose)" : "var(--rose-soft)",
                      color: reached ? "#fff" : "var(--muted-foreground)",
                    }}
                  >
                    {store.step > i + 1 ? "✓" : i + 1}
                  </span>
                  <span
                    className="text-sm"
                    style={{ color: current ? "var(--foreground)" : "var(--muted-foreground)", fontWeight: current ? 700 : 500 }}
                  >
                    {label}
                  </span>
                </div>
                {i < 2 && <span style={{ width: 16, height: 1, background: "var(--border-color)" }} />}
              </div>
            );
          })}
        </div>

        {/* ── Step 1 — Service ──────────────────────────────────── */}
        {store.step === 1 && (
          <div className="flex flex-col gap-3">
            {services.map((s) => (
              <ServiceCard
                key={s.id}
                service={s}
                selected={store.selectedService?.id === s.id}
                onSelect={store.setService}
              />
            ))}
          </div>
        )}

        {/* ── Step 2 — Date + Time ──────────────────────────────── */}
        {store.step === 2 && store.selectedService && (
          <div>
            <button
              onClick={() => store.setStep(1)}
              className="mb-5 font-bold flex items-center gap-1.5 px-4 py-2.5 text-sm transition-all active:scale-95"
              style={{ color: "var(--rose)", background: "var(--rose-soft)", borderRadius: "var(--pill)", border: "1.5px solid var(--rose)" }}
            >
              <span style={{ fontSize: 18 }}>›</span> חזרה
            </button>

            <h2 className="text-base font-bold mb-4" style={{ color: "var(--foreground)" }}>
              בחרו תאריך
            </h2>

            {/* Month navigation */}
            <div className="flex items-center justify-between mb-3" dir="ltr">
              <button
                onClick={prevMonth}
                disabled={!canPrev}
                className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg disabled:opacity-25 transition-opacity"
                style={{ background: "var(--surface)", border: "1px solid var(--border-color)", color: "var(--foreground)" }}
              >
                ‹
              </button>
              <span className="font-bold text-sm" style={{ color: "var(--foreground)" }}>
                {MONTHS_HE[calMonth]} {calYear}
              </span>
              <button
                onClick={nextMonth}
                disabled={!canNext}
                className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg disabled:opacity-25 transition-opacity"
                style={{ background: "var(--surface)", border: "1px solid var(--border-color)", color: "var(--foreground)" }}
              >
                ›
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAY_HEADERS.map((d) => (
                <div key={d} className="text-center text-xs py-1 font-bold" style={{ color: "var(--muted-foreground)" }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div
              className="grid grid-cols-7 gap-y-1 mb-6 p-3"
              style={{ borderRadius: "var(--radius)", border: "1px solid var(--border-color)", background: "var(--surface)" }}
            >
              {calCells.map((day, i) => {
                if (!day) return <div key={i} className="h-12" />;

                const isPast     = day < minDate;
                const isFuture   = day > maxDate;
                const disabled   = isPast || isFuture;
                const selected   = store.selectedDate?.toDateString() === day.toDateString();
                const isToday    = day.toDateString() === todayMidnight.toDateString();
                const holiday    = holidays.get(day.toDateString());
                const hebrewDate = toHebrewDateShort(day);

                return (
                  <button
                    key={i}
                    disabled={disabled}
                    onClick={() => store.setDate(new Date(day))}
                    title={holiday ?? undefined}
                    className="h-12 flex flex-col items-center justify-center rounded-xl transition-all mx-0.5 disabled:opacity-25 disabled:cursor-not-allowed active:scale-95 gap-0"
                    style={{
                      background: selected ? "var(--rose)" : isToday ? "var(--rose-soft)" : "transparent",
                      color:      selected ? "white" : isToday ? "var(--rose)" : "var(--foreground)",
                      border:     selected ? "none"  : isToday ? "1.5px solid var(--rose)" : "none",
                    }}
                  >
                    <span className="text-sm font-bold leading-none">{day.getDate()}</span>
                    <span
                      className="text-[8px] leading-none mt-0.5"
                      style={{ color: selected ? "rgba(255,255,255,0.8)" : "var(--muted-foreground)" }}
                    >
                      {hebrewDate}
                    </span>
                    {holiday && (
                      <span
                        className="w-1 h-1 rounded-full mt-0.5"
                        style={{ background: selected ? "white" : "var(--rose)" }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Time slots */}
            {store.selectedDate && (
              <>
                <h2 className="text-base font-bold mb-4" style={{ color: "var(--foreground)" }}>
                  בחרו שעה
                </h2>
                {loadingSlots ? (
                  <p className="text-center py-4 text-sm" style={{ color: "var(--muted-foreground)" }}>
                    טוען...
                  </p>
                ) : slotsError ? (
                  <div className="text-center py-6">
                    <p className="text-sm mb-3" style={{ color: "var(--muted-foreground)" }}>
                      לא הצלחנו לטעון את השעות הפנויות
                    </p>
                    <button
                      onClick={() => setSlotsReload((n) => n + 1)}
                      className="px-5 py-2.5 text-sm font-bold"
                      style={{ background: "var(--rose-soft)", color: "var(--rose)", borderRadius: "var(--pill)", border: "1.5px solid var(--rose)" }}
                    >
                      נסו שוב
                    </button>
                  </div>
                ) : (
                  <TimeSlotPicker
                    slots={slots}
                    selectedStart={store.selectedStartTime}
                    onSelect={store.setTimeSlot}
                  />
                )}
              </>
            )}
          </div>
        )}

        {/* ── Step 3 — Confirm ─────────────────────────────────── */}
        {store.step === 3 &&
          store.selectedService &&
          store.selectedStartTime &&
          store.selectedEndTime && (
          <div>
            <button
              onClick={() => store.setStep(2)}
              className="mb-4 font-bold flex items-center gap-1.5 px-4 py-2.5 text-sm transition-all active:scale-95"
              style={{ color: "var(--rose)", background: "var(--rose-soft)", borderRadius: "var(--pill)", border: "1.5px solid var(--rose)" }}
            >
              <span style={{ fontSize: 18 }}>›</span> חזרה
            </button>

            {/* Summary */}
            <div className="p-5 mb-5" style={{ borderRadius: "var(--radius)", background: "var(--rose-soft)" }}>
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: "var(--muted-foreground)" }}>טיפול</span>
                  <span className="font-bold">{store.selectedService.name}</span>
                </div>
                {store.selectedService.price != null && (
                  <div className="flex justify-between">
                    <span style={{ color: "var(--muted-foreground)" }}>מחיר</span>
                    <span className="font-bold">₪{store.selectedService.price}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span style={{ color: "var(--muted-foreground)" }}>משך הטיפול</span>
                  <span className="font-bold">{store.selectedService.duration} דקות</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: "var(--muted-foreground)" }}>תאריך</span>
                  <span className="font-bold">
                    {store.selectedStartTime.toLocaleDateString("he-IL", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: "var(--muted-foreground)" }}>שעה</span>
                  <span className="font-bold" dir="ltr">
                    {store.selectedStartTime.toLocaleTimeString("he-IL", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            </div>

            {user ? (
              <button
                onClick={() => submit()}
                disabled={submitting}
                className="w-full py-4 font-bold text-white text-base disabled:opacity-60"
                style={{ background: "var(--rose)", borderRadius: "var(--pill)" }}
              >
                {submitting ? "שולח..." : `שליחה ל${salon?.displayName ?? salonId}`}
              </button>
            ) : (
              <GuestForm onSubmit={submit} loading={submitting} />
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
