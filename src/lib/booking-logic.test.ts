import { describe, it, expect } from "vitest";
import type { Timestamp } from "firebase/firestore";
import { generateDaySlots } from "@/lib/booking-logic";
import { weekdayOfDayKey, israelWallTimeToInstant, formatIsraelTime } from "@/lib/timezone";
import type { AvailabilityRule, BlockedTime } from "@/types";

const DAY = "2026-06-15";

// Minimal Timestamp stand-in — generateDaySlots only ever calls .toDate().
function fakeTs(d: Date): Timestamp {
  return { toDate: () => d } as unknown as Timestamp;
}
function inst(h: number, m: number): Date {
  return israelWallTimeToInstant(2026, 5, 15, h, m);
}
function recurring(open: string, close: string, isOpen = true): AvailabilityRule {
  return { id: "r", type: "recurring", dayOfWeek: weekdayOfDayKey(DAY), openTime: open, closeTime: close, isOpen };
}
function slotAt(slots: ReturnType<typeof generateDaySlots>, h: number, m: number) {
  const label = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return slots.find((s) => formatIsraelTime(s.startTime) === label);
}

describe("generateDaySlots", () => {
  it("emits 5-min slots across the window, all available, in Israel time", () => {
    const slots = generateDaySlots(DAY, 60, [recurring("09:00", "12:00")], [], []);
    expect(slots.length).toBe(25); // 09:00 … 11:00 inclusive, step 5
    expect(formatIsraelTime(slots[0].startTime)).toBe("09:00");
    expect(formatIsraelTime(slots[slots.length - 1].startTime)).toBe("11:00");
    expect(slots.every((s) => s.available)).toBe(true);
  });

  it("returns nothing when the service is longer than the window", () => {
    expect(generateDaySlots(DAY, 240, [recurring("09:00", "12:00")], [], [])).toEqual([]);
  });

  it("returns nothing when the day's rule is closed", () => {
    expect(generateDaySlots(DAY, 60, [recurring("09:00", "12:00", false)], [], [])).toEqual([]);
  });

  it("marks blocked windows unavailable (boundary-correct)", () => {
    const blocked: BlockedTime[] = [
      { id: "b", date: fakeTs(inst(12, 0)), startTime: "10:00", endTime: "11:00", isAllDay: false },
    ];
    const slots = generateDaySlots(DAY, 60, [recurring("09:00", "12:00")], blocked, []);
    expect(slotAt(slots, 9, 0)?.available).toBe(true); // 09:00–10:00 touches, no overlap
    expect(slotAt(slots, 9, 30)?.available).toBe(false); // 09:30–10:30 overlaps
    expect(slotAt(slots, 10, 0)?.available).toBe(false); // 10:00–11:00 overlaps
    expect(slotAt(slots, 11, 0)?.available).toBe(true); // 11:00–12:00 touches end, no overlap
  });

  it("marks existing appointments unavailable", () => {
    const existing = [{ start: inst(10, 0), end: inst(11, 0) }];
    const slots = generateDaySlots(DAY, 60, [recurring("09:00", "12:00")], [], existing);
    expect(slotAt(slots, 10, 0)?.available).toBe(false);
    expect(slotAt(slots, 9, 0)?.available).toBe(true);
  });

  it("lets a one_time closure override an open recurring rule", () => {
    const oneTimeClosed: AvailabilityRule = {
      id: "o",
      type: "one_time",
      date: fakeTs(inst(12, 0)),
      openTime: "00:00",
      closeTime: "23:59",
      isOpen: false,
    };
    expect(generateDaySlots(DAY, 60, [recurring("09:00", "20:00"), oneTimeClosed], [], [])).toEqual([]);
  });
});
