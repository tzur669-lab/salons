"use client";
import { useEffect, useState } from "react";
import { useSalon } from "@/contexts/SalonProvider";
import { isStandalonePWA } from "@/lib/web-push";
import { isIOS, isInAppBrowser } from "@/lib/platform";

type Platform = "android" | "ios" | "other";

export default function DownloadPage() {
  const { salon } = useSalon();
  const displayName = salon?.displayName ?? "הסלון";
  const salonCode = salon?.salonCode;

  const [platform, setPlatform] = useState<Platform>("other");
  const [inAppBrowser, setInAppBrowser] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setPlatform(/android/i.test(ua) ? "android" : isIOS() ? "ios" : "other");
    setInAppBrowser(isInAppBrowser());
    setInstalled(isStandalonePWA());
  }, []);

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

        {/* In-app browser (Instagram / WhatsApp / FB) */}
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

        {/* Android / desktop: download APK */}
        {!installed && !inAppBrowser && showAndroid && (
          <div
            className="mt-8 w-full p-5 text-right"
            style={{ background: "var(--rose-soft)", borderRadius: "var(--radius)" }}
          >
            <p className="font-bold text-sm mb-4">אנדרואיד</p>

            <a
              href="/salons-app.apk"
              download
              className="block w-full text-center text-base px-5 py-3 rounded-full font-bold text-white active:scale-95 transition-transform"
              style={{ background: "var(--primary)" }}
            >
              הורדת האפליקציה
            </a>

            <p className="text-xs mt-2 text-center" style={{ color: "var(--muted-foreground)" }}>
              הדפדפן עשוי לבקש אישור להתקנה מ&apos;מקורות לא ידועים&apos; — זהו תהליך רגיל ובטוח לחלוטין.
            </p>

            {salonCode && (
              <div
                className="mt-5 p-4 rounded-2xl text-center"
                style={{ background: "var(--surface)", border: "1px solid var(--border-color)" }}
              >
                <p className="text-xs mb-2" style={{ color: "var(--muted-foreground)" }}>
                  בפתיחה הראשונה של האפליקציה הקלידי את הקוד:
                </p>
                <p
                  className="text-4xl font-extrabold tracking-[0.25em]"
                  style={{ color: "var(--rose)", fontVariantNumeric: "tabular-nums" }}
                  dir="ltr"
                >
                  {salonCode}
                </p>
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
