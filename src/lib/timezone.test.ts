import { describe, it, expect } from "vitest";
import {
  israelWallTimeToInstant,
  israelDayKey,
  toDayKey,
  weekdayOfDayKey,
  formatIsraelTime,
} from "@/lib/timezone";

describe("timezone (Asia/Jerusalem)", () => {
  it("winter wall time → UTC+2", () => {
    expect(israelWallTimeToInstant(2026, 0, 15, 9, 0).toISOString()).toBe("2026-01-15T07:00:00.000Z");
  });

  it("summer wall time → UTC+3 (DST)", () => {
    expect(israelWallTimeToInstant(2026, 6, 15, 9, 0).toISOString()).toBe("2026-07-15T06:00:00.000Z");
  });

  it("formatIsraelTime round-trips the wall time", () => {
    expect(formatIsraelTime(israelWallTimeToInstant(2026, 6, 15, 9, 0))).toBe("09:00");
    expect(formatIsraelTime(israelWallTimeToInstant(2026, 0, 15, 18, 30))).toBe("18:30");
  });

  it("never shifts the calendar day across all 365 days of 2026 (incl. both DST edges)", () => {
    let shifts = 0;
    const d = new Date(Date.UTC(2026, 0, 1));
    while (d.getUTCFullYear() === 2026) {
      const key = toDayKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      const back = israelDayKey(israelWallTimeToInstant(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0));
      if (back !== key) shifts++;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    expect(shifts).toBe(0);
  });

  it("weekdayOfDayKey is timezone-independent (2026-01-01 is Thursday)", () => {
    expect(weekdayOfDayKey("2026-01-01")).toBe(4);
    expect(weekdayOfDayKey("2026-01-04")).toBe(0); // Sunday
  });
});
