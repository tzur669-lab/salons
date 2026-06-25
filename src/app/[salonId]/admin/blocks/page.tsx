"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { useSalon } from "@/contexts/SalonProvider";

interface Block {
  id: string;
  type: string;
  label: string;
  count: number;
  max: number;
  blocked: boolean;
  minutesLeft: number;
}

/**
 * Admin "release a locked-out client" screen.
 *
 * Shows every loginRateLimit counter (the same docs the manager would see in the
 * Firestore console), marks which are actively blocking, and lets the manager
 * delete one with a tap → the client can try to log in / reset their password
 * immediately instead of waiting 15 minutes.
 */
export default function AdminBlocksPage() {
  const { salonId } = useSalon();
  const [items, setItems] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setError("לא מחוברת — התחברי מחדש.");
        return;
      }
      const res = await fetch(`/api/admin/rate-limits?salonId=${encodeURIComponent(salonId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (data?.ok) {
        setItems(data.items ?? []);
      } else if (res.status === 403) {
        setError("אין הרשאת ניהול לחשבון הזה.");
      } else {
        setError("טעינה נכשלה. נסי שוב.");
      }
    } catch {
      setError("שגיאת רשת — נסי שוב.");
    } finally {
      setLoading(false);
    }
  }, [salonId]);

  useEffect(() => {
    load();
  }, [load]);

  async function release(id: string) {
    setBusyId(id);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setError("לא מחוברת — התחברי מחדש.");
        return;
      }
      const res = await fetch("/api/admin/rate-limits", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ salonId, id }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.ok) {
        setItems((prev) => prev.filter((b) => b.id !== id));
      } else {
        setError("שחרור נכשל. נסי שוב.");
      }
    } catch {
      setError("שגיאת רשת — נסי שוב.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="pb-20 md:pb-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-extrabold" style={{ color: "var(--foreground)" }}>
          שחרור חסימות
        </h1>
        <button
          onClick={() => { setLoading(true); load(); }}
          className="text-sm font-bold px-3 py-1.5 rounded-full"
          style={{ border: "1px solid var(--border-color)", color: "var(--foreground)" }}
        >
          רענן
        </button>
      </div>
      <p className="text-sm mb-6" style={{ color: "var(--muted-foreground)", lineHeight: 1.6 }}>
        לקוח שניסה להתחבר או לאפס סיסמה יותר מדי פעמים נחסם אוטומטית ל-15 דקות.
        כאן את יכולה למחוק את החסימה שלו כדי שיוכל לנסות שוב מיד.
      </p>

      {error && (
        <p className="text-sm text-center mb-4 p-3 rounded-2xl" style={{ color: "#C2596B", background: "#F8E9EC" }}>
          {error}
        </p>
      )}

      {loading ? (
        <div className="pt-10 flex justify-center">
          <span className="inline-block rounded-full animate-pulse" style={{ width: 14, height: 14, background: "var(--rose)" }} />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-center py-10" style={{ color: "var(--muted-foreground)" }}>
          אין חסימות פעילות 🎉
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between p-4 gap-3"
              style={{
                borderRadius: "var(--radius)",
                background: "var(--surface)",
                boxShadow: "var(--card-shadow)",
                border: b.blocked ? "1.5px solid #E53E3E" : "1px solid var(--border-color)",
              }}
            >
              <div className="min-w-0">
                <p className="font-bold text-sm truncate" style={{ color: "var(--foreground)" }} dir="auto">
                  {b.label}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                  {b.type} · {b.count}/{b.max} ניסיונות
                </p>
                <p className="text-xs mt-0.5 font-semibold" style={{ color: b.blocked ? "#C2596B" : "#3F8A5E" }}>
                  {b.blocked ? `חסום — עוד ${b.minutesLeft} דק׳` : "לא חסום כרגע"}
                </p>
              </div>
              <button
                onClick={() => release(b.id)}
                disabled={busyId === b.id}
                className="text-sm px-4 py-2 rounded-full font-bold text-white flex-shrink-0 disabled:opacity-50"
                style={{ background: "var(--primary)" }}
              >
                {busyId === b.id ? "..." : "שחרר"}
              </button>
            </div>
          ))}
        </div>
      )}

      <Link
        href={`/${salonId}/admin`}
        className="block text-sm font-semibold mt-8 text-center"
        style={{ color: "var(--primary)" }}
      >
        ← חזרה ללוח הניהול
      </Link>
    </div>
  );
}
