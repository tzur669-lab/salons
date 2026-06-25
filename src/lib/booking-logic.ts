import type { AvailabilityRule, BlockedTime, TimeSlot } from "@/types";
import {
  israelWallTimeToInstant,
  israelDayKey,
  parseDayKey,
  weekdayOfDayKey,
} from "@/lib/timezone";

const SLOT_INTERVAL_MINUTES = 5;

function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Pure slot generator for ONE Israel calendar day. No Firebase, no `Date.setHours`
 * (which silently used whatever timezone the code ran in). Availability windows and
 * blocked periods are computed in minutes-from-midnight (Israel wall time); the
 * resulting slot boundaries are converted to absolute instants via the Asia/Jerusalem
 * helper, so overlap checks against existing appointments (absolute instants) and the
 * returned times are correct no matter where this runs (UTC server, any-tz device).
 *
 * Now called server-side from /api/availability so the booking client never reads the
 * appointments collection directly (privacy + read-cost). Kept pure + exhaustively
 * unit-testable.
 *
 * @param dayKey          "YYYY-MM-DD" in Israel time
 * @param serviceDuration minutes
 * @param rules           all availability rules (recurring + one_time)
 * @param blockedTimes    all blocked periods (filtered to this day internally)
 * @param existing        already-taken intervals as absolute instants
 */
export function generateDaySlots(
  dayKey: string,
  serviceDuration: number,
  rules: AvailabilityRule[],
  blockedTimes: BlockedTime[],
  existing: Array<{ start: Date; end: Date }>
): TimeSlot[] {
  const { year, monthIndex, day } = parseDayKey(dayKey);
  const weekday = weekdayOfDayKey(dayKey);

  // One-time rules override recurring for the whole day (matches prior behavior).
  const oneTimeRules = rules.filter(
    (r) => r.type === "one_time" && r.date && israelDayKey(r.date.toDate()) === dayKey
  );
  const recurringRules = rules.filter(
    (r) => r.type === "recurring" && r.dayOfWeek === weekday
  );
  const applicable = oneTimeRules.length > 0 ? oneTimeRules : recurringRules;

  if (!applicable.length || applicable.every((r) => !r.isOpen)) return [];

  const dayBlocked = blockedTimes.filter((bt) => israelDayKey(bt.date.toDate()) === dayKey);

  const slots: TimeSlot[] = [];
  for (const rule of applicable) {
    if (!rule.isOpen) continue;
    const openMin = hmToMinutes(rule.openTime);
    const closeMin = hmToMinutes(rule.closeTime);

    for (
      let startMin = openMin;
      startMin + serviceDuration <= closeMin;
      startMin += SLOT_INTERVAL_MINUTES
    ) {
      const endMin = startMin + serviceDuration;

      const blocked = dayBlocked.some((bt) => {
        if (bt.isAllDay) return true;
        const bs = hmToMinutes(bt.startTime);
        const be = hmToMinutes(bt.endTime);
        return startMin < be && endMin > bs;
      });

      const startTime = israelWallTimeToInstant(year, monthIndex, day, Math.floor(startMin / 60), startMin % 60);
      const endTime = israelWallTimeToInstant(year, monthIndex, day, Math.floor(endMin / 60), endMin % 60);

      const overlap = existing.some((s) => startTime < s.end && endTime > s.start);

      slots.push({ startTime, endTime, available: !blocked && !overlap });
    }
  }

  return slots.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}
