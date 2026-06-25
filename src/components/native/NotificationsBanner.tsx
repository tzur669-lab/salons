"use client";
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { auth } from "@/lib/firebase";
import {
  getPushPermission,
  requestPushPermission,
  registerPushToken,
  type PushPermission,
} from "@/lib/push";

/**
 * Shown on "My Appointments" (native only) when reminders can't be delivered:
 *  - "prompt" state → an actionable button that fires the OS request + registers.
 *  - "denied" state → instructions to re-enable in phone settings (the OS won't
 *    show the prompt again, so a button can't help — Android one-shot).
 * Renders nothing when granted, on web, or while loading.
 */
export function NotificationsBanner() {
  const [state, setState] = useState<PushPermission | "unavailable" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    getPushPermission().then(setState);
  }, []);

  if (!state || state === "granted" || state === "unavailable") return null;

  async function enable() {
    setBusy(true);
    const granted = await requestPushPermission();
    if (granted && auth.currentUser) await registerPushToken(auth.currentUser.uid);
    setState(await getPushPermission());
    setBusy(false);
  }

  const denied = state === "denied";

  return (
    <div
      className="mb-5 p-4 flex items-start gap-3"
      style={{ background: "var(--rose-soft)", borderRadius: "var(--radius)" }}
    >
      <span style={{ fontSize: 22, lineHeight: 1 }}>🔔</span>
      <div className="flex-1">
        <p className="font-bold text-sm mb-0.5" style={{ color: "var(--foreground)" }}>
          תזכורות לתורים כבויות
        </p>
        {denied ? (
          <p className="text-xs" style={{ color: "var(--muted-foreground)", lineHeight: 1.6 }}>
            כדי לקבל תזכורת שעה לפני התור, הפעילי התראות בהגדרות הטלפון ← אפליקציות ← רוני ניילס ← התראות.
          </p>
        ) : (
          <>
            <p className="text-xs mb-3" style={{ color: "var(--muted-foreground)", lineHeight: 1.6 }}>
              נשלח לך תזכורת עדינה בדיוק שעה לפני התור.
            </p>
            <button
              onClick={enable}
              disabled={busy}
              className="text-sm px-4 py-2 rounded-full font-bold text-white active:scale-95 transition-transform disabled:opacity-60"
              style={{ background: "var(--primary)" }}
            >
              {busy ? "רגע..." : "הפעלת תזכורות"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
