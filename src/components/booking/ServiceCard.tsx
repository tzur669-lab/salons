"use client";
import type { Service } from "@/types";

interface Props {
  service: Service;
  selected?: boolean;
  onSelect: (service: Service) => void;
}

export function ServiceCard({ service, selected, onSelect }: Props) {
  return (
    <button
      onClick={() => onSelect(service)}
      className="w-full text-right p-5 transition-all active:scale-[0.99]"
      style={{
        borderRadius: "var(--radius)",
        border: `2px solid ${selected ? "var(--rose)" : "var(--border-color)"}`,
        background: selected ? "var(--rose-soft)" : "var(--surface)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      <div className="flex justify-between items-center gap-3">
        <div className="flex-1">
          <h3 className="text-lg font-bold" style={{ color: "var(--foreground)" }}>
            {service.name}
          </h3>
          {service.description && (
            <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
              {service.description}
            </p>
          )}
          <p className="text-sm mt-1.5" style={{ color: "var(--muted-foreground)" }}>
            {service.duration} דקות
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {service.price != null && (
            <span className="text-lg font-extrabold" style={{ color: "var(--rose)" }}>
              ₪{service.price}
            </span>
          )}
          <span
            className="flex items-center justify-center rounded-full"
            style={{
              width: 34,
              height: 34,
              background: selected ? "var(--rose)" : "var(--rose-soft)",
            }}
          >
            {selected ? (
              <svg width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 7.5l3 3 6-7" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="var(--rose)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 9H4M8 4L3 9l5 5" />
              </svg>
            )}
          </span>
        </div>
      </div>
    </button>
  );
}
