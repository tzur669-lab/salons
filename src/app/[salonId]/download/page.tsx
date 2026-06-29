"use client";
import { useEffect, useState } from "react";
import { useSalon } from "@/contexts/SalonProvider";
import { isStandalonePWA, ensureServiceWorkerRegistered } from "@/lib/web-push";
import { isIOS, isAndroid, isInAppBrowser } from "@/lib/platform";

/**
 * Public install/download landing page — the permanent per-salon link for clients.
 * Each salon has its own URL (`/{salonId}/download`) so the installed PWA is named
 * after that salon and opens directly into her booking site.
 *
 * The `beforeinstallprompt` event is captured by an inline script in the root layout
 * (runs at HTML-parse time, before React hydrates) and stashed on
 * `window.__deferredInstallPrompt`. This page reads it synchronously on mount —
 * no hydration race, no lost event.
 *
 *  - Android / desktop Chrome + prompt available → one-tap native install dialog.
 *  - Android / desktop Chrome + prompt not yet ready → numbered step guide.
 *  - In-app browser (Instagram / WhatsApp / Facebook) → "open in Chrome/Safari" banner.
 *  - iPhone → Safari "הוסף למסך הבית" guide (iOS has no programmatic install API).
 *  - Already installed → friendly "already installed" note.
 */

type Platform = "android" | "ios" | "other";

export default function DownloadPage() {
  const { salon } = useSalon();
  const displayName = salon?.displayName ?? "הסלון";

  const [platform, setPlatform] = useState<Platform>("other");
  const [inAppBrowser, setInAppBrowser] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    setPlatform(isAndroid() ? "android" : isIOS() ? "ios" : "other");
    setInAppBrowser(isInAppBrowser());
    setInstalled(isStandalonePWA());

    // Read the stash synchronously — the inline layout script captured this before
    // React hydrated, so there is no race condition.
    if (window.__deferredInstallPrompt) {
      setInstallPrompt(window.__deferredInstallPrompt);
    }

    // Also register the SW here (belt-and-suspenders; the layout script already does
    // it globally, but this ensures it for direct /download navigations).
    ensureServiceWorkerRegistered();

    // Late-arrival handler: fires if the browser emits the event after our mount.
    function onReady() {
      if (window.__deferredInstallPrompt) {
        setInstallPrompt(window.__deferredInstallPrompt);
      }
    }
    function onInstalled() {
      setInstallPrompt(null);
      window.__deferredInstallPrompt = null;
      setInstalled(true);
    }
    window.addEventListener("installprompt-ready", onReady);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("installprompt-ready", onReady);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!installPrompt) {
      // Prompt not available — reveal the manual steps guide.
      setShowSteps(true);
      return;
    }
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    // The event is one-shot: reset regardless of outcome so no second call is attempted.
    setInstallPrompt(null);
    window.__deferredInstallPrompt = null;
    if (outcome === "accepted") {
      setInstalled(true);
    } else {
      // User dismissed the native dialog → fall back to the manual guide.
      setShowSteps(true);
    }
  }

  function copyLink() {
    navigator.clipboard?.writeText(window.location.href).catch(() => {});
  }

  const showAndroid = platform === "android" || platform === "other";
  const showIOS = platform === "ios" || platform === "other";

  return (
    <div
      dir="rtl"
      className="min-h-screen flex flex-col items-center px-6 py-12"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/icon-192.png"
          alt={displayName}
          width={88}
          height={88}
          className="rounded-3xl shadow-sm"
        />
        <h1 className="mt-5 text-2xl font-bold">{displayName}</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
          {installed
            ? "האפליקציה כבר מותקנת — פתחי אותה מהאייקון במסך הבית."
            : "התקינו את האפליקציה כדי לקבוע תורים ולקבל תזכורות"}
        </p>

        {/* In-app browser (Instagram / WhatsApp / FB) — install impossible */}
        {!installed && inAppBrowser && (
          <div
            className="mt-8 w-full p-5 text-right"
            style={{ background: "var(--rose-soft)", borderRadius: "var(--radius)" }}
          >
            <p className="font-bold text-sm mb-3">פתחו בדפדפן רגיל</p>
            <p className="text-xs leading-relaxed mb-4" style={{ color: "var(--muted-foreground)" }}>
              התקנת האפליקציה לא אפשרית מתוך דפדפן פנימי. העתיקו את הקישור ופתחו אותו
              ב‑<strong>Chrome</strong> (אנדרואיד) או ב‑<strong>Safari</strong> (אייפון).
            </p>
            <button
              onClick={copyLink}
              className="block w-full text-center text-base px-5 py-3 rounded-full font-bold text-white active:scale-95 transition-transform"
              style={{ background: "var(--primary)" }}
            >
              העתק קישור
            </button>
          </div>
        )}

        {/* Android / desktop: install button (or manual steps) */}
        {!installed && !inAppBrowser && showAndroid && (
          <div
            className="mt-8 w-full p-5 text-right"
            style={{ background: "var(--rose-soft)", borderRadius: "var(--radius)" }}
          >
            <p className="font-bold text-sm mb-4">אנדרואיד / מחשב</p>

            {/* Primary button — always shown */}
            <button
              onClick={handleInstall}
              className="block w-full text-center text-base px-5 py-3 rounded-full font-bold text-white active:scale-95 transition-transform"
              style={{ background: "var(--primary)" }}
            >
              התקינו את האפליקציה
            </button>

            {/* Manual steps — shown when no deferred prompt or after dismiss */}
            {(!installPrompt || showSteps) && (
              <div className="mt-4 flex flex-col gap-3">
                {[
                  { n: "1", text: <>לחצו על <strong>⋮</strong> בפינה העליונה של הדפדפן</> },
                  { n: "2", text: <>בחרו <strong>&quot;התקן אפליקציה&quot;</strong> או <strong>&quot;הוסף למסך הבית&quot;</strong></> },
                  { n: "3", text: <>לחצו <strong>התקן</strong> ופתחו מהאייקון החדש</> },
                ].map(({ n, text }) => (
                  <div key={n} className="flex items-start gap-3">
                    <span
                      className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold text-white mt-0.5"
                      style={{ background: "var(--primary)" }}
                    >
                      {n}
                    </span>
                    <p className="text-sm leading-relaxed pt-0.5" style={{ color: "var(--foreground)" }}>
                      {text}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* iPhone: Safari Add to Home Screen guide */}
        {!installed && !inAppBrowser && showIOS && (
          <div
            className="mt-5 w-full p-5 text-right"
            style={{ background: "var(--rose-soft)", borderRadius: "var(--radius)" }}
          >
            <p className="font-bold text-sm mb-2">אייפון</p>
            <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
              פתחו את הדף הזה ב‑<strong>Safari</strong>, לחצו על כפתור השיתוף ⬆️ בסרגל,
              בחרו <strong>&quot;הוסף למסך הבית&quot;</strong>, ואז פתחו את האפליקציה מהאייקון החדש.
              האפליקציה תתעדכן לבד בכל פתיחה.
            </p>
          </div>
        )}

        {!installed && (
          <p className="mt-8 text-xs" style={{ color: "var(--muted-foreground)" }}>
            כבר מותקן אצלכם? האפליקציה מתעדכנת אוטומטית — אין צורך להתקין מחדש.
          </p>
        )}
      </div>
    </div>
  );
}
