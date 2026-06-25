"use client";
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { auth } from "@/lib/firebase";
import { getPushPermission, type PushPermission } from "@/lib/push";
import { hasBatteryPlugin, isIgnoringBatteryOptimizations } from "@/lib/battery-optimization";
import { detectOem, type Oem } from "@/lib/detect-oem";
import { isWebPushSupported, isStandalonePWA, getWebPushPermission } from "@/lib/web-push";

type Tone = "ok" | "warn" | "err" | "info";

interface Row {
  label: string;
  value: string;
  tone: Tone;
}

const OEM_LABEL: Record<Oem, string> = {
  oneplus: "OnePlus / OPPO / Realme",
  xiaomi: "Xiaomi / Redmi",
  huawei: "Huawei / Honor",
  samsung: "Samsung",
  generic: "אחר",
};

const TONE_ICON: Record<Tone, string> = { ok: "✅", warn: "⚠️", err: "❌", info: "ℹ️" };

function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function fetchLiveToken(): Promise<string | null> {
  return import("@capacitor-firebase/messaging")
    .then(({ FirebaseMessaging }) => FirebaseMessaging.getToken())
    .then(({ token }) => token || null)
    .catch(() => null);
}

function relativeAge(iso: string | null, serverNow: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = serverNow ? new Date(serverNow).getTime() : Date.now();
  const mins = Math.max(0, Math.round((now - then) / 60000));
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `לפני ${hours} שע׳`;
  return `לפני ${Math.round(hours / 24)} ימים`;
}

const PERMISSION_LABEL: Record<PushPermission | "unavailable", { value: string; tone: Tone }> = {
  granted: { value: "אושר", tone: "ok" },
  denied: { value: "נדחה — צריך להפעיל בהגדרות הטלפון", tone: "err" },
  prompt: { value: "עוד לא נשאל — צריך לאשר", tone: "warn" },
  "prompt-with-rationale": { value: "עוד לא נשאל — צריך לאשר", tone: "warn" },
  unavailable: { value: "לא זמין (לא באפליקציה)", tone: "info" },
};

const DELAY_SECONDS = 5;

interface SelfTestResult {
  ok?: boolean;
  reason?: string;
  code?: string;
  message?: string;
}

function describeTest(data: SelfTestResult): { msg: string; tone: "ok" | "err" } {
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
        msg: "המכשיר לא רשום לקבלת התראות. ודאי שאישרת התראות, וסגרי ופתחי את האפליקציה כדי לרשום את המכשיר.",
      };
    case "fcm-error":
      return { tone: "err", msg: `שגיאת FCM: ${data.code ?? ""} ${data.message ?? ""}`.trim() };
    case "admin-sdk":
      return { tone: "err", msg: "מפתחות השרת (Firebase Admin) לא נטענו ב-Vercel." };
    case "invalid-token":
    case "unauthorized":
      return { tone: "err", msg: "בעיית הזדהות — התחברי מחדש ונסי שוב." };
    default:
      return { tone: "err", msg: "שגיאה לא ידועה. נסי שוב." };
  }
}

/**
 * Notification Diagnostics — checks every gate in the push-delivery chain on the
 * real device and runs an end-to-end self-test, so we can pinpoint WHY reminders
 * stop (force-stop on swipe vs. permission vs. stale token vs. old APK) before
 * changing anything. Native-only; on web it shows that it must run inside the app.
 */
export function NotificationDiagnostics() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Self-test state
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [testResult, setTestResult] = useState<{ msg: string; tone: "ok" | "err" } | null>(null);

  // Shared across native + web: report server-side token registration + freshness.
  async function serverRegRow(): Promise<Row> {
    try {
      const user = auth.currentUser;
      if (!user) return { label: "רישום בשרת", value: "לא מחוברת — התחברי מחדש", tone: "err" };
      const idToken = await user.getIdToken();
      const res = await fetch("/api/push-token-status", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        hasToken?: boolean;
        deviceCount?: number;
        tokenUpdatedAt?: string | null;
        serverTime?: string | null;
      };
      if (data.ok && data.hasToken) {
        const n = data.deviceCount ?? 1;
        return {
          label: "רישום בשרת",
          value: `${n} מכשיר${n > 1 ? "ים" : ""} · עודכן ${relativeAge(data.tokenUpdatedAt ?? null, data.serverTime ?? null)}`,
          tone: "ok",
        };
      }
      return {
        label: "רישום בשרת",
        value: "לא רשום — השרת לא יכול לשלוח התראות למכשיר הזה",
        tone: "err",
      };
    } catch {
      return { label: "רישום בשרת", value: "שגיאת רשת בבדיקה", tone: "warn" };
    }
  }

  async function collectWeb() {
    const result: Row[] = [];
    const ios = isIOSDevice();
    const standalone = isStandalonePWA();

    result.push({ label: "מכשיר", value: ios ? "web · iOS (אייפון)" : "web · דפדפן", tone: "info" });

    result.push({
      label: "מותקן כאפליקציה (PWA)",
      value: standalone ? "כן" : ios ? "לא — חובה “הוסף למסך הבית” באייפון" : "לא (מומלץ להתקין)",
      tone: standalone ? "ok" : ios ? "err" : "warn",
    });

    const supported = await isWebPushSupported();
    result.push({
      label: "תמיכה בהתראות",
      value: supported ? "נתמך" : ios && !standalone ? "ייתמך אחרי התקנה למסך הבית" : "לא נתמך (נדרש iOS 16.4+ / VAPID)",
      tone: supported ? "ok" : "warn",
    });

    const perm = getWebPushPermission();
    const permMap: Record<string, { value: string; tone: Tone }> = {
      granted: { value: "אושר", tone: "ok" },
      denied: { value: "נדחה — הפעילי בהגדרות", tone: "err" },
      default: { value: "עוד לא אושר", tone: "warn" },
      unavailable: { value: "לא זמין", tone: "info" },
    };
    const pi = permMap[perm];
    result.push({ label: "הרשאת התראות", value: pi.value, tone: pi.tone });

    result.push(await serverRegRow());

    setRows(result);
    setLoading(false);
  }

  // No synchronous setState here — the loading/copied reset lives in the refresh
  // handler so the mount effect can call collect() without a cascading render.
  async function collect() {
    if (!Capacitor.isNativePlatform()) {
      await collectWeb();
      return;
    }

    const result: Row[] = [];

    // 1. Platform / OEM
    const oem = detectOem();
    result.push({
      label: "מכשיר",
      value: `${Capacitor.getPlatform()} · ${OEM_LABEL[oem]}`,
      tone: oem === "oneplus" || oem === "xiaomi" || oem === "huawei" ? "warn" : "info",
    });

    // 2. Notification permission
    const perm = await getPushPermission();
    const permInfo = PERMISSION_LABEL[perm];
    result.push({ label: "הרשאת התראות", value: permInfo.value, tone: permInfo.tone });

    // 3. Battery-optimization exemption
    if (!hasBatteryPlugin()) {
      result.push({
        label: "פטור מאופטימיזציית סוללה",
        value: "לא ניתן לבדוק — הגרסה המותקנת מיושנת (צריך לבנות APK מחדש)",
        tone: "warn",
      });
    } else {
      const ignoring = await isIgnoringBatteryOptimizations();
      result.push({
        label: "פטור מאופטימיזציית סוללה",
        value: ignoring ? "פטור (תקין)" : "לא פטור — המערכת עלולה לעצור את האפליקציה",
        tone: ignoring ? "ok" : "err",
      });
    }

    // 4. Live FCM token (on-device)
    const liveToken = await fetchLiveToken();
    result.push({
      label: "טוקן FCM במכשיר",
      value: liveToken ? `קיים …${liveToken.slice(-8)}` : "לא הושג — בעיה ברישום FCM",
      tone: liveToken ? "ok" : "err",
    });

    // 5. Server-side token registration + freshness
    result.push(await serverRegRow());

    setRows(result);
    setLoading(false);
  }

  useEffect(() => {
    // Deferred so the first state update lands after mount (no cascading render).
    const id = setTimeout(() => void collect(), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refresh() {
    setLoading(true);
    setCopied(false);
    void collect();
  }

  async function runSelfTest() {
    setBusy(true);
    setTestResult(null);
    for (let s = DELAY_SECONDS; s > 0; s--) {
      setCountdown(s);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setCountdown(0);
    try {
      const user = auth.currentUser;
      if (!user) {
        setTestResult({ tone: "err", msg: "לא מחוברת — התחברי מחדש." });
        return;
      }
      const idToken = await user.getIdToken();
      const res = await fetch("/api/self-test-push", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = (await res.json().catch(() => ({}))) as SelfTestResult;
      setTestResult(describeTest(data));
    } catch {
      setTestResult({ tone: "err", msg: "שגיאת רשת — נסי שוב." });
    } finally {
      setBusy(false);
    }
  }

  async function copyReport() {
    const lines = rows.map((r) => `${TONE_ICON[r.tone]} ${r.label}: ${r.value}`);
    const report = [
      "דוח בדיקת התראות — רוני ניילס",
      new Date().toISOString(),
      ...lines,
      testResult ? `בדיקת שליחה: ${testResult.msg}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const toneColor: Record<Tone, string> = {
    ok: "#3F8A5E",
    warn: "#B8860B",
    err: "#C2596B",
    info: "var(--muted-foreground)",
  };

  return (
    <div
      dir="rtl"
      className="mb-5 p-4"
      style={{ background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border-color)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="font-bold text-sm" style={{ color: "var(--foreground)" }}>
          בדיקת התראות
        </p>
        <button
          onClick={refresh}
          disabled={loading}
          className="text-xs font-semibold disabled:opacity-60"
          style={{ color: "var(--primary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          {loading ? "בודק…" : "רענון"}
        </button>
      </div>

      {loading && rows.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          בודק את מצב ההתראות…
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-xs" style={{ lineHeight: 1.6 }}>
              <span style={{ flexShrink: 0 }}>{TONE_ICON[r.tone]}</span>
              <span style={{ color: "var(--foreground)", fontWeight: 600, flexShrink: 0 }}>{r.label}:</span>
              <span style={{ color: toneColor[r.tone], wordBreak: "break-word" }}>{r.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* End-to-end self-test */}
      <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--border-color)" }}>
        <p className="text-xs mb-2" style={{ color: "var(--muted-foreground)", lineHeight: 1.7 }}>
          שלחי לעצמך התראת בדיקה. אחרי הלחיצה — נעלי או מזערי את המסך כדי לראות אותה כבאנר.
          <br />
          <strong>הבדיקה המכרעת:</strong> אם ההתראה מגיעה כשהאפליקציה ממוזערת אבל
          <strong> מפסיקה</strong> אחרי שמעבירים אותה מהאפליקציות האחרונות (swipe) — המערכת
          עוצרת את האפליקציה, והפתרון הוא פטור מאופטימיזציית סוללה + הפעלה אוטומטית.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={runSelfTest}
            disabled={busy}
            className="text-sm px-4 py-2 rounded-full font-bold text-white active:scale-95 transition-transform disabled:opacity-60"
            style={{ background: "var(--primary)" }}
          >
            {busy ? (countdown > 0 ? `נעלי את המסך… ${countdown}` : "שולח…") : "שלח לי התראת בדיקה"}
          </button>
          <button
            onClick={copyReport}
            disabled={rows.length === 0}
            className="text-sm px-4 py-2 rounded-full font-bold border disabled:opacity-60"
            style={{ borderColor: "var(--border-color)", color: "var(--foreground)", background: "var(--surface)" }}
          >
            {copied ? "הועתק ✓" : "העתק דוח"}
          </button>
        </div>
        {testResult && (
          <p
            dir="rtl"
            className="text-xs mt-3"
            style={{
              color: testResult.tone === "ok" ? "#3F8A5E" : "#C2596B",
              lineHeight: 1.6,
              wordBreak: "break-word",
            }}
          >
            {testResult.msg}
          </p>
        )}
      </div>
    </div>
  );
}
