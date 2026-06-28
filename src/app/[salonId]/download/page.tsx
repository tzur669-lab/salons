"use client";
import { useEffect, useState } from "react";
import { useSalon } from "@/contexts/SalonProvider";
import { isStandalonePWA, ensureServiceWorkerRegistered } from "@/lib/web-push";

/**
 * Public install/download landing page — the permanent per-salon link for clients.
 * Each salon has its own URL (`/{salonId}/download`) so the installed PWA is named
 * after that salon and opens directly into her booking site.
 *
 *  - Android / desktop Chrome → "התקן את האפליקציה" via beforeinstallprompt, with
 *    a text fallback if the prompt isn't available.
 *  - iPhone → Safari "הוסף למסך הבית" guide (iOS has no programmatic install API).
 *  - Already installed → show a friendly "already installed" note instead.
 *
 * The SW is eagerly registered on mount so Chrome's installability heuristic fires
 * beforeinstallprompt even for first-time visitors who never granted push permission.
 */

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

type Platform = "android" | "ios" | "other";

export default function DownloadPage() {
  const { salon } = useSalon();
  const displayName = salon?.displayName ?? "הסלון";

  const [platform, setPlatform] = useState<Platform>("other");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setPlatform(isAndroid() ? "android" : isIOS() ? "ios" : "other");
    setInstalled(isStandalonePWA());

    // Register the SW early so Chrome fires beforeinstallprompt even for users
    // who never granted push permission.
    ensureServiceWorkerRegistered();

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setInstallPrompt(null);
      setInstalled(true);
    }
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

        {!installed && showAndroid && (
          <div
            className="mt-8 w-full p-5 text-right"
            style={{ background: "var(--rose-soft)", borderRadius: "var(--radius)" }}
          >
            <p className="font-bold text-sm mb-3">אנדרואיד / מחשב</p>
            <button
              onClick={installPrompt ? handleInstall : undefined}
              className="block w-full text-center text-base px-5 py-3 rounded-full font-bold text-white active:scale-95 transition-transform"
              style={{ background: "var(--primary)" }}
            >
              הוסיפו למסך הבית
            </button>
            {!installPrompt && (
              <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                פתחו את תפריט הדפדפן (⋮) ובחרו <strong>&quot;התקן אפליקציה&quot;</strong>{" "}
                או <strong>&quot;הוסף למסך הבית&quot;</strong>.
              </p>
            )}
          </div>
        )}

        {!installed && showIOS && (
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
