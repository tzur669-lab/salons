"use client";
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { auth } from "@/lib/firebase";
import {
  getPushPermission,
  requestPushPermission,
  registerPushToken,
  ensureReminderChannel,
} from "@/lib/push";
import {
  hasBatteryPlugin,
  isIgnoringBatteryOptimizations,
  requestIgnoreBatteryOptimizations,
} from "@/lib/battery-optimization";
import { detectOem } from "@/lib/detect-oem";

const ASKED_KEY = "push-soft-ask-done";
const BATTERY_ASKED_KEY = "battery-opt-ask-done";

// OEMs whose default battery "deep clean" force-stops swiped-away apps and blocks
// FCM — these are the devices that genuinely NEED the exemption. Samsung/Pixel and
// others deliver reliably without it, so we don't nag them.
const AGGRESSIVE_OEMS = new Set(["oneplus", "xiaomi", "huawei"]);

type Phase = "notif" | "battery";

/**
 * Startup permission flow (native only). Two chained steps:
 *
 *  1. Notification soft-ask — a friendly explainer BEFORE the one-shot OS prompt
 *     so we never waste it. Shown once, on first native launch, while permission
 *     is still "prompt". On "Allow" → fires the real OS request + registers token.
 *
 *  2. Battery-optimization step — runs ONLY after notifications were just granted,
 *     and only on a device that actually needs it (aggressive OEM + the native
 *     battery plugin present + not already exempt). It first explains WHY the
 *     exemption is needed, then opens the one-tap system battery dialog.
 *
 * Renders nothing on web / PWA. Degrades safely on older APKs without the battery
 * plugin (step 2 self-skips).
 */
export function PushPermissionPrompt() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("notif");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (localStorage.getItem(ASKED_KEY)) return;

    let cancelled = false;
    (async () => {
      await ensureReminderChannel();
      const state = await getPushPermission();
      // Only soft-ask when the OS will actually show a prompt.
      if (!cancelled && (state === "prompt" || state === "prompt-with-rationale")) {
        // Small delay so it doesn't collide with the splash/first paint.
        setTimeout(() => !cancelled && setOpen(true), 1400);
      } else {
        // Already granted or permanently denied → nothing to soft-ask.
        localStorage.setItem(ASKED_KEY, "1");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Decide whether to show the battery step. Returns true if the modal should
   * stay open on the "battery" phase, false if there's nothing to ask.
   */
  async function shouldAskBattery(): Promise<boolean> {
    try {
      if (localStorage.getItem(BATTERY_ASKED_KEY)) return false;
      if (!hasBatteryPlugin()) return false; // older APK → manual guide covers it
      if (!AGGRESSIVE_OEMS.has(detectOem())) return false; // device delivers fine without it
      if (await isIgnoringBatteryOptimizations()) return false; // already exempt
      return true;
    } catch {
      return false;
    }
  }

  async function allow() {
    setBusy(true);
    const granted = await requestPushPermission();
    if (granted && auth.currentUser) {
      await registerPushToken(auth.currentUser.uid);
    }
    localStorage.setItem(ASKED_KEY, "1");

    // Chain the battery step only when notifications were granted AND the device needs it.
    if (granted && (await shouldAskBattery())) {
      setBusy(false);
      setPhase("battery");
      return;
    }

    setBusy(false);
    setOpen(false);
  }

  function notNow() {
    localStorage.setItem(ASKED_KEY, "1");
    setOpen(false);
  }

  async function allowBattery() {
    setBusy(true);
    await requestIgnoreBatteryOptimizations(); // opens the one-tap system dialog
    localStorage.setItem(BATTERY_ASKED_KEY, "1");
    setBusy(false);
    setOpen(false);
  }

  function skipBattery() {
    localStorage.setItem(BATTERY_ASKED_KEY, "1");
    setOpen(false);
  }

  if (!open) return null;

  const onBackdrop = phase === "battery" ? skipBattery : notNow;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[1000] flex items-end justify-center"
      style={{ background: "rgba(40,26,32,0.45)" }}
      onClick={onBackdrop}
    >
      <div
        className="w-full max-w-md m-3 p-6 text-center"
        style={{
          background: "var(--surface)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {phase === "notif" ? (
          <>
            <h2 className="font-extrabold mb-2" style={{ color: "var(--foreground)", fontSize: 22 }}>
              שלא תפספסי את התור
            </h2>
            <p className="mb-6 text-sm" style={{ color: "var(--muted-foreground)", lineHeight: 1.6 }}>
              נשלח לך תזכורת עדינה בדיוק שעה לפני התור שלך אצל רני. אפשרי קבלת התראות כדי שלא תשכחי.
            </p>
            <button
              onClick={allow}
              disabled={busy}
              className="w-full py-3.5 font-bold text-white text-base active:scale-95 transition-transform disabled:opacity-60"
              style={{ background: "var(--primary)", borderRadius: "var(--pill)" }}
            >
              {busy ? "רגע..." : "כן, אשמח לתזכורת"}
            </button>
            <button
              onClick={notNow}
              disabled={busy}
              className="w-full py-3 mt-2 font-medium text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              לא עכשיו
            </button>
          </>
        ) : (
          <>
            <div
              className="mx-auto mb-4 flex items-center justify-center rounded-full"
              style={{ width: 64, height: 64, background: "var(--rose-soft)", fontSize: 30 }}
            >
              🔋
            </div>
            <h2 className="font-extrabold mb-2" style={{ color: "var(--foreground)", fontSize: 22 }}>
              עוד צעד קטן וזהו
            </h2>
            <p className="mb-6 text-sm" style={{ color: "var(--muted-foreground)", lineHeight: 1.6 }}>
              המכשיר שלך עוצר אפליקציות ברקע כדי לחסוך בסוללה — וזה עלול למנוע ממך לקבל את
              התזכורות. כדי לוודא שההתראות תמיד יגיעו, אפשרי לאפליקציה לרוץ ללא הגבלת סוללה.
            </p>
            <button
              onClick={allowBattery}
              disabled={busy}
              className="w-full py-3.5 font-bold text-white text-base active:scale-95 transition-transform disabled:opacity-60"
              style={{ background: "var(--primary)", borderRadius: "var(--pill)" }}
            >
              {busy ? "רגע..." : "אפשרי קבלת התראות תמיד"}
            </button>
            <button
              onClick={skipBattery}
              disabled={busy}
              className="w-full py-3 mt-2 font-medium text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              אחר כך
            </button>
          </>
        )}
      </div>
    </div>
  );
}
