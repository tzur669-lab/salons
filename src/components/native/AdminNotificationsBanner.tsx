"use client";
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { auth } from "@/lib/firebase";
import {
  getPushPermission,
  requestPushPermission,
  registerPushToken,
  ensureReminderChannel,
  type PushPermission,
} from "@/lib/push";

/**
 * Admin-facing push opt-in, shown on the dashboard (native only) until the admin
 * has granted notifications. This is what actually gets Roni's device token
 * stored under her uid so /api/notify-admin can reach her when a request arrives.
 *
 *  - "prompt" state → button that fires the Android-13 OS request (via
 *    FirebaseMessaging.requestPermissions) and then registers the token.
 *  - "denied" state → guides her to re-enable in phone settings (OS won't
 *    re-prompt once denied).
 * Renders nothing when granted, on web, or while loading.
 */
export function AdminNotificationsBanner() {
  const [state, setState] = useState<PushPermission | "unavailable" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    getPushPermission().then(setState);
  }, []);

  if (!state || state === "granted" || state === "unavailable") return null;

  async function enable() {
    setBusy(true);
    setError(null);
    // Make sure the HIGH-importance channel exists before the first push lands.
    await ensureReminderChannel();
    const granted = await requestPushPermission();
    if (granted && auth.currentUser) {
      const ok = await registerPushToken(auth.currentUser.uid);
      if (!ok) setError("הרישום נכשל — בדקי חיבור לאינטרנט ונסי שוב.");
    }
    setState(await getPushPermission());
    setBusy(false);
  }

  const denied = state === "denied";

  return (
    <div
      className="mb-5 p-4 flex items-start gap-3"
      style={{ background: "var(--rose-soft)", borderRadius: "var(--radius)", border: "1.5px solid var(--rose)" }}
    >
      <span style={{ fontSize: 22, lineHeight: 1 }}>🔔</span>
      <div className="flex-1">
        <p className="font-bold text-sm mb-0.5" style={{ color: "var(--foreground)" }}>
          התראות על בקשות תור חדשות
        </p>
        {denied ? (
          <p className="text-xs" style={{ color: "var(--muted-foreground)", lineHeight: 1.6 }}>
            כדי לקבל התראה בכל פעם שלקוחה קובעת תור, הפעילי התראות בהגדרות הטלפון ← אפליקציות ← רוני ניילס ← התראות.
          </p>
        ) : (
          <>
            <p className="text-xs mb-3" style={{ color: "var(--muted-foreground)", lineHeight: 1.6 }}>
              קבלי התראה ישירה לטלפון בכל פעם שמתקבלת בקשת תור חדשה — גם כשהאפליקציה סגורה.
            </p>
            <button
              onClick={enable}
              disabled={busy}
              className="text-sm px-4 py-2 rounded-full font-bold text-white active:scale-95 transition-transform disabled:opacity-60"
              style={{ background: "var(--primary)" }}
            >
              {busy ? "רגע..." : "הפעלת התראות"}
            </button>
            {error && (
              <p className="text-xs mt-2" dir="rtl" style={{ color: "#C2596B", lineHeight: 1.6 }}>
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
