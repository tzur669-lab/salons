"use client";
import type { TimeSlot } from "@/types";
import { formatIsraelTime } from "@/lib/timezone";

interface Props {
  slots: TimeSlot[];
  selectedStart: Date | null;
  onSelect: (start: Date, end: Date) => void;
}

// Slot instants are absolute; always label them in Israel wall time so a device
// in another timezone still shows the salon's actual hours.
function formatTime(date: Date): string {
  return formatIsraelTime(date);
}

export function TimeSlotPicker({ slots, selectedStart, onSelect }: Props) {
  if (slots.length === 0) {
    return (
      <p className="text-center py-8 text-sm" style={{ color: "var(--muted-foreground)" }}>
        אין שעות פנויות ביום זה
      </p>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-2.5">
      {slots.map((slot, i) => {
        const isSelected = selectedStart?.getTime() === slot.startTime.getTime();
        return (
          <button
            key={i}
            disabled={!slot.available}
            onClick={() => onSelect(slot.startTime, slot.endTime)}
            dir="ltr"
            className="py-3 text-sm font-bold transition-all disabled:cursor-not-allowed active:scale-95"
            style={{
              borderRadius: 14,
              border: `2px solid ${isSelected ? "var(--rose)" : "var(--border-color)"}`,
              background: isSelected ? "var(--rose)" : slot.available ? "var(--surface)" : "var(--muted)",
              color: isSelected ? "#fff" : slot.available ? "var(--foreground)" : "var(--faint)",
              textDecoration: slot.available ? "none" : "line-through",
            }}
          >
            {formatTime(slot.startTime)}
          </button>
        );
      })}
    </div>
  );
}
