"use client";

/**
 * A single in-app toast shown to the admin when a new appointment request
 * arrives. Tapping it opens the dashboard; the ✕ dismisses it. Purely
 * presentational — the provider owns the queue and auto-dismiss timing.
 */
export function AdminToast({
  name,
  onOpen,
  onDismiss,
}: {
  name: string;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
      className="flex items-center gap-3 p-3.5 cursor-pointer active:scale-[0.99] transition-transform"
      style={{
        background: "var(--surface)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow)",
        border: "1.5px solid var(--rose)",
      }}
    >
      <span
        className="flex items-center justify-center rounded-full flex-shrink-0"
        style={{ width: 40, height: 40, background: "var(--rose-soft)", fontSize: 20 }}
      >
        🔔
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm" style={{ color: "var(--foreground)" }}>
          בקשת תור חדשה
        </p>
        <p className="text-xs mt-0.5 truncate" style={{ color: "var(--muted-foreground)" }}>
          {name ? `${name} · ` : ""}הקישי לצפייה ואישור
        </p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        aria-label="סגירה"
        className="flex-shrink-0 flex items-center justify-center rounded-full"
        style={{ width: 28, height: 28, color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
