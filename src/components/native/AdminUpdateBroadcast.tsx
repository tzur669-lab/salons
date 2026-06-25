"use client";
import { useState } from "react";
import { auth } from "@/lib/firebase";

interface BroadcastResult {
  ok?: boolean;
  recipients?: number;
  sent?: number;
  pruned?: number;
  error?: string;
}

/**
 * Admin tool: broadcasts a push to EVERY client device.
 *
 * Default mode sends the standard "app update available" message; the manager can
 * also open "הודעה מותאמת" and type a custom title + text (e.g. a holiday notice or
 * a new-service announcement). Tapping the notification opens /download in the
 * system browser. Two-tap confirm — it reaches all clients at once.
 */
export function AdminUpdateBroadcast() {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [custom, setCustom] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<{ msg: string; tone: "ok" | "err" } | null>(null);

  async function send() {
    setConfirming(false);
    setBusy(true);
    setResult(null);
    try {
      const user = auth.currentUser;
      if (!user) {
        setResult({ tone: "err", msg: "לא מחוברת — התחברי מחדש." });
        return;
      }
      const token = await user.getIdToken();
      // Only send a body when the manager typed a custom message; otherwise the
      // server fills in its default "app update available" text.
      const payload =
        custom && (title.trim() || body.trim())
          ? { title: title.trim() || undefined, body: body.trim() || undefined }
          : undefined;
      const res = await fetch("/api/notify-update", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(payload ? { "Content-Type": "application/json" } : {}),
        },
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const data = (await res.json().catch(() => ({}))) as BroadcastResult;
      if (data?.ok) {
        setResult({
          tone: "ok",
          msg: `נשלח ✅ ${data.sent ?? 0} התראות ל-${data.recipients ?? 0} לקוחות. לחיצה על ההתראה תפתח את דף ההורדה.`,
        });
      } else if (res.status === 403) {
        setResult({ tone: "err", msg: "אין הרשאת ניהול לחשבון הזה." });
      } else if (res.status === 401) {
        setResult({ tone: "err", msg: "בעיית הזדהות — התחברי מחדש ונסי שוב." });
      } else {
        setResult({ tone: "err", msg: "שליחה נכשלה. נסי שוב." });
      }
    } catch {
      setResult({ tone: "err", msg: "שגיאת רשת — נסי שוב." });
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 12,
    border: "1px solid var(--border-color)", background: "var(--accent)",
    fontSize: 14, color: "var(--foreground)", outline: "none",
  };

  return (
    <div
      className="mb-5 p-4"
      style={{ background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border-color)" }}
    >
      <p className="font-bold text-sm mb-1" style={{ color: "var(--foreground)" }}>
        שליחת התראה לכל הלקוחות
      </p>
      <p className="text-xs mb-3" style={{ color: "var(--muted-foreground)", lineHeight: 1.6 }}>
        שולח לכל הלקוחות התראה על עדכון/הודעה. לחיצה על ההתראה תפתח את דף ההורדה עם הגרסה העדכנית.
      </p>

      {/* Custom-message toggle */}
      <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={custom}
          onChange={(e) => setCustom(e.target.checked)}
          style={{ width: 16, height: 16, accentColor: "var(--primary)" }}
        />
        <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>
          הודעה מותאמת אישית
        </span>
      </label>

      {custom && (
        <div className="flex flex-col gap-2 mb-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="כותרת (לדוגמה: עדכון חשוב)"
            maxLength={200}
            style={inputStyle}
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="תוכן ההודעה ללקוחות…"
            maxLength={1000}
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
          />
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            אם תשאירי ריק — תישלח הודעת ברירת המחדל על גרסה חדשה.
          </p>
        </div>
      )}

      {confirming ? (
        <div className="flex items-center gap-2">
          <button
            onClick={send}
            disabled={busy}
            className="text-sm px-4 py-2 rounded-full font-bold text-white active:scale-95 transition-transform disabled:opacity-60"
            style={{ background: "var(--primary)" }}
          >
            כן, שלח לכולם
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="text-sm px-4 py-2 rounded-full font-bold active:scale-95 transition-transform disabled:opacity-60"
            style={{ color: "var(--foreground)", border: "1px solid var(--border-color)" }}
          >
            ביטול
          </button>
        </div>
      ) : (
        <button
          onClick={() => {
            setResult(null);
            setConfirming(true);
          }}
          disabled={busy}
          className="text-sm px-4 py-2 rounded-full font-bold text-white active:scale-95 transition-transform disabled:opacity-60"
          style={{ background: "var(--primary)" }}
        >
          {busy ? "שולח…" : "שלח התראה לכל הלקוחות"}
        </button>
      )}

      {result && (
        <p
          dir="rtl"
          className="text-xs mt-3"
          style={{
            color: result.tone === "ok" ? "#3F8A5E" : "#C2596B",
            lineHeight: 1.6,
            wordBreak: "break-word",
          }}
        >
          {result.msg}
        </p>
      )}
    </div>
  );
}
