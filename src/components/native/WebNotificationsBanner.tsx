"use client";
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { auth } from "@/lib/firebase";
import {
  isWebPushSupported,
  isStandalonePWA,
  getWebPushPermission,
  requestWebPushPermission,
  registerWebPushToken,
  type WebPushPermission,
} from "@/lib/web-push";
import { isIOS } from "@/lib/platform";

type View = "hidden" | "ios-install" | "enable" | "denied";

/**
 * Web-only push opt-in (the iPhone-PWA path). Native uses NotificationsBanner.
 *  - iOS & not installed → guide to "Add to Home Screen" (push only works in the
 *    installed PWA on iOS; a button in a Safari tab cannot work).
 *  - supported & permission "default" → an enable button (gesture-first request).
 *  - "denied" → instructions to re-enable in Settings.
 * Renders nothing on native, when unsupported, or when already granted.
 */
export function WebNotificationsBanner() {
  const [view, setView] = useState<View>("hidden");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    let cancelled = false;
    (async () => {
      const ios = isIOS();
      const standalone = isStandalonePWA();
      // iOS in a Safari tab: push is unsupported until the user installs the PWA.
      if (ios && !standalone) {
        if (!cancelled) setView("ios-install");
        return;
      }
      if (!(await isWebPushSupported())) return; // desktop-unsupported / VAPID missing
      const perm = getWebPushPermission();
      if (cancelled) return;
      setView(perm === "denied" ? "denied" : perm === "default" ? "enable" : "hidden");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (view === "hidden") return null;

  async function enable() {
    setBusy(true);
    // Gesture-first: requestWebPushPermission() must be the first call (Safari).
    const result = await requestWebPushPermission();
    if (result === "granted") {
      const uid = auth.currentUser?.uid;
      if (uid) await registerWebPushToken(uid);
    }
    const perm: WebPushPermission = getWebPushPermission();
    setView(perm === "granted" ? "hidden" : perm === "denied" ? "denied" : "enable");
    setBusy(false);
  }

  return (
    <div
      dir="rtl"
      className="mb-5 p-4 flex items-start gap-3"
      style={{ background: "var(--rose-soft)", borderRadius: "var(--radius)" }}
    >
      <span style={{ fontSize: 22, lineHeight: 1 }}>🔔</span>
      <div className="flex-1">
        <p className="font-bold text-sm mb-1" style={{ color: "var(--foreground)" }}>
          תזכורות לתורים
        </p>

        {view === "ios-install" && (
          <p className="text-xs" style={{ color: "var(--muted-foreground)", lineHeight: 1.7 }}>
            כדי לקבל תזכורות באייפון: לחצי על כפתור השיתוף ⬆️ בסרגל של Safari, בחרי
            <strong> “הוסף למסך הבית”</strong>, ואז פתחי את האפליקציה מהאייקון החדש והפעילי
            התראות. (נדרש iOS 16.4 ומעלה.)
          </p>
        )}

        {view === "enable" && (
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

        {view === "denied" && (
          <p className="text-xs" style={{ color: "var(--muted-foreground)", lineHeight: 1.6 }}>
            ההתראות חסומות. כדי להפעיל: הגדרות הטלפון ← התראות ← רוני ניילס ← אפשרי התראות
            (או בהגדרות האתר/אפליקציה בדפדפן).
          </p>
        )}
      </div>
    </div>
  );
}
