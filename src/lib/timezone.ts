/**
 * Asia/Jerusalem timezone helpers — the single source of truth for calendar math.
 *
 * The whole business runs in Israel time, but code runs in three places with
 * DIFFERENT clocks: the client (device tz, often but not always Israel), the Vercel
 * server (UTC), and the cron. Doing `date.setHours()` therefore produced different
 * instants depending on where it ran. These helpers convert between an absolute
 * instant and an Israel wall-clock time explicitly, using the Intl timezone database
 * so DST (Israel shifts in March/October) is handled correctly — no dependency.
 *
 * Invariant: timestamps are absolute instants; "HH:MM" availability strings are
 * Israel wall time; day keys are "YYYY-MM-DD" in Israel time.
 */

const TZ = "Asia/Jerusalem";

/** Minutes Israel is AHEAD of UTC at `instant` (e.g. +120 in winter, +180 in summer). */
function israelOffsetMinutes(instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  // The Israel wall-clock reading, re-interpreted as if it were UTC.
  const asUTC = Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second);
  return Math.round((asUTC - instant.getTime()) / 60000);
}

/**
 * The absolute instant for a given Israel wall-clock time. DST-aware: a second pass
 * corrects the rare case where the first guess lands on the wrong side of a DST edge.
 */
export function israelWallTimeToInstant(
  year: number,
  monthIndex: number, // 0-based, like Date
  day: number,
  hour: number,
  minute: number
): Date {
  const guessUTC = Date.UTC(year, monthIndex, day, hour, minute, 0);
  const offset1 = israelOffsetMinutes(new Date(guessUTC));
  let instant = guessUTC - offset1 * 60000;
  const offset2 = israelOffsetMinutes(new Date(instant));
  if (offset2 !== offset1) instant = guessUTC - offset2 * 60000;
  return new Date(instant);
}

/** The Israel-time calendar day of an instant, as "YYYY-MM-DD". */
export function israelDayKey(instant: Date): string {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

/** Build a day key from explicit calendar components (e.g. a calendar cell). */
export function toDayKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Parse "YYYY-MM-DD" into Date-style components (monthIndex 0-based). */
export function parseDayKey(dayKey: string): { year: number; monthIndex: number; day: number } {
  const [y, m, d] = dayKey.split("-").map(Number);
  return { year: y, monthIndex: m - 1, day: d };
}

/** Day-of-week (0=Sun..6=Sat) for a day key — independent of any runtime timezone. */
export function weekdayOfDayKey(dayKey: string): number {
  const { year, monthIndex, day } = parseDayKey(dayKey);
  return new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
}

/** Format an instant as Israel wall-clock "HH:MM" (24h), regardless of runtime tz. */
export function formatIsraelTime(instant: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}
