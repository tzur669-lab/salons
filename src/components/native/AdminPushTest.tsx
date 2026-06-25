"use client";
import { useState } from "react";
import { auth } from "@/lib/firebase";

const DELAY_SECONDS = 5;

interface TestResult {
  ok?: boolean;
  reason?: string;
  code?: string;
  message?: string;
}

function describe(data: TestResult): { msg: string; tone: "ok" | "err" } {
  if (data?.ok) {
    return {
      tone: "ok",
      msg: "נשלח ✅ בדקי את הטלפון. (אם האפליקציה פתוחה בחזית — ההתראה מופיעה בתוך האפליקציה ולא כבאנר.)",
    };
  }
  switch (data?.reason) {
    case "no-token":
      return {
        tone: "err",
        msg: "המכשיר לא רשום לקבלת התראות. פתחי את האפליקציה בטלפון, ודאי שאישרת התראות, וסגרי ופתחי אותה מחדש כדי לרשום את המכשיר.",
      };
    case "fcm-error":
      return { tone: "err", msg: `שגיאת FCM: ${data.code ?? ""} ${data.message ?? ""}`.trim() };
    case "admin-sdk":
      return { tone: "err", msg: "מפתחות השרת (Firebase Admin) לא נטענו ב-Vercel." };
    case "forbidden":
      return { tone: "err", msg: "אין הרשאת ניהול לחשבון הזה." };
    case "invalid-token":
    case "unauthorized":
      return { tone: "err", msg: "בעיית הזדהות — התחברי מחדש ונסי שוב." };
    default:
      return { tone: "err", msg: "שגיאה לא ידועה. נסי שוב." };
  }
}

/**
 * Admin diagnostic: sends a real push to the admin's own device via
 * /api/admin-test-push and shows the precise outcome. A short countdown gives
 * time to background the app first (foreground apps don't show a banner).
 */
export function AdminPushTest() {
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [result, setResult] = useState<{ msg: string; tone: "ok" | "err" } | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    for (let s = DELAY_SECONDS; s > 0; s--) {
      setCountdown(s);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setCountdown(0);
    try {
      const user = auth.currentUser;
      if (!user) {
        setResult({ tone: "err", msg: "לא מחוברת — התחברי מחדש." });
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch("/api/admin-test-push", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as TestResult;
      setResult(describe(data));
    } catch {
      setResult({ tone: "err", msg: "שגיאת רשת — נסי שוב." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mb-5 p-4"
      style={{ background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border-color)" }}
    >
      <p className="font-bold text-sm mb-1" style={{ color: "var(--foreground)" }}>
        בדיקת התראות
      </p>
      <p className="text-xs mb-3" style={{ color: "var(--muted-foreground)", lineHeight: 1.6 }}>
        שולח התראת בדיקה למכשיר שלך. אחרי הלחיצה — נעלי או מזערי את המסך כדי לראות את ההתראה כבאנר.
      </p>
      <button
        onClick={run}
        disabled={busy}
        className="text-sm px-4 py-2 rounded-full font-bold text-white active:scale-95 transition-transform disabled:opacity-60"
        style={{ background: "var(--primary)" }}
      >
        {busy ? (countdown > 0 ? `נעלי את המסך… ${countdown}` : "שולח…") : "שלח לי התראת בדיקה"}
      </button>
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
