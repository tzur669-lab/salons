"use client";
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  hasBatteryPlugin,
  isIgnoringBatteryOptimizations,
  requestIgnoreBatteryOptimizations,
  openBatterySettings,
  openAppDetailsSettings,
} from "@/lib/battery-optimization";
import { detectOem, OEM_HINT, type Oem } from "@/lib/detect-oem";

const DISMISS_KEY = "bg-delivery-guide-dismissed";

/**
 * Admin guidance to keep push working after the app is swiped away. OEMs like
 * OnePlus/OPPO kill backgrounded apps and block FCM unless the app is exempt
 * from battery optimization. Ships via Vercel and works on the current APK (manual
 * steps); once the BatteryOptimization native plugin is in a build, it upgrades to
 * one-tap buttons. Native-only; dismissible; auto-hides once the app is exempt.
 */
export function BackgroundDeliveryGuide() {
  const [show, setShow] = useState(false);
  const [plugin, setPlugin] = useState(false);
  const [ignoring, setIgnoring] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [oem, setOem] = useState<Oem>("generic");

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    setOem(detectOem());
    const hasPlugin = hasBatteryPlugin();
    setPlugin(hasPlugin);

    if (!hasPlugin) {
      setShow(true); // current APK → manual guide
      return;
    }

    let removeListener: (() => void) | undefined;
    isIgnoringBatteryOptimizations().then((ig) => {
      setIgnoring(ig);
      setShow(!ig); // already exempt → nothing to nag about
    });
    // Re-check when returning from the system dialog / settings.
    import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) isIgnoringBatteryOptimizations().then(setIgnoring);
        })
      )
      .then((handle) => {
        removeListener = () => handle.remove();
      })
      .catch(() => {});
    return () => removeListener?.();
  }, []);

  if (!show || ignoring === true) return null;

  async function allow() {
    setBusy(true);
    await requestIgnoreBatteryOptimizations();
    setIgnoring(await isIgnoringBatteryOptimizations());
    setBusy(false);
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  }

  return (
    <div
      dir="rtl"
      className="mb-5 p-4"
      style={{ background: "var(--rose-soft)", borderRadius: "var(--radius)", border: "1.5px solid var(--rose)" }}
    >
      <div className="flex items-start gap-3">
        <span style={{ fontSize: 22, lineHeight: 1 }}>📵</span>
        <div className="flex-1">
          <p className="font-bold text-sm mb-1" style={{ color: "var(--foreground)" }}>
            התראות כשהאפליקציה סגורה
          </p>

          {plugin ? (
            <>
              <p className="text-xs mb-3" style={{ color: "var(--muted-foreground)", lineHeight: 1.6 }}>
                בלחיצה אחת תאשרי לאפליקציה לרוץ ברקע כדי לקבל כל בקשת תור — גם כשהיא סגורה.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={allow}
                  disabled={busy}
                  className="text-sm px-4 py-2 rounded-full font-bold text-white active:scale-95 transition-transform disabled:opacity-60"
                  style={{ background: "var(--primary)" }}
                >
                  {busy ? "רגע…" : "אפשרי ריצה ברקע"}
                </button>
                <button
                  onClick={openBatterySettings}
                  className="text-sm px-4 py-2 rounded-full font-bold border"
                  style={{ borderColor: "var(--border-color)", color: "var(--foreground)", background: "var(--surface)" }}
                >
                  הגדרות סוללה
                </button>
                <button
                  onClick={openAppDetailsSettings}
                  className="text-sm px-4 py-2 rounded-full font-bold border"
                  style={{ borderColor: "var(--border-color)", color: "var(--foreground)", background: "var(--surface)" }}
                >
                  הפעלה אוטומטית
                </button>
              </div>
              <p className="text-xs mt-3" style={{ color: "var(--muted-foreground)", lineHeight: 1.6 }}>
                בנוסף, ב“הפעלה אוטומטית” הפעילי את רוני ניילס (חשוב ב-OnePlus/OPPO/Xiaomi).
              </p>
            </>
          ) : (
            <p className="text-xs" style={{ color: "var(--muted-foreground)", lineHeight: 1.7 }}>
              {OEM_HINT[oem]}
            </p>
          )}

          <button
            onClick={dismiss}
            className="text-xs mt-3 font-semibold"
            style={{ color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            הבנתי, הסתר
          </button>
        </div>
      </div>
    </div>
  );
}
