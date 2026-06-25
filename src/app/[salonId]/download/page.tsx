"use client";
import { useEffect, useState } from "react";

/**
 * Public install/download landing page — the ONE permanent link to share with
 * clients (`/download`). It never changes; behind it the Android button points at
 * the permanent GitHub "latest release" APK URL, so it always serves the newest build.
 *
 *  - Android → big download button (the signed APK from GitHub Releases) + install hint.
 *  - iPhone  → "Add to Home Screen" guide (no APK on iOS; the PWA is the install path).
 *  - Desktop / other → both options, so the page is always usable.
 *
 * Standalone & login-free: renders browser-only state, stays `○ Static`.
 */

// APK hosted on the site itself (public/roni-nails.apk) so it downloads for everyone
// without needing the GitHub repo to be public. Override via env if the host changes.
const APK_URL =
  process.env.NEXT_PUBLIC_ANDROID_APK_URL ?? "/roni-nails.apk";

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as Mac; the touch-points check catches it.
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

type Platform = "android" | "ios" | "other";

export default function DownloadPage() {
  const [platform, setPlatform] = useState<Platform>("other");

  useEffect(() => {
    setPlatform(isAndroid() ? "android" : isIOS() ? "ios" : "other");
  }, []);

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
          alt="רוני ניילס"
          width={88}
          height={88}
          className="rounded-3xl shadow-sm"
        />
        <h1 className="mt-5 text-2xl font-bold">רוני ניילס</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
          התקינו את האפליקציה כדי לקבוע תורים ולקבל תזכורות
        </p>

        {showAndroid && (
          <div
            className="mt-8 w-full p-5 text-right"
            style={{ background: "var(--rose-soft)", borderRadius: "var(--radius)" }}
          >
            <p className="font-bold text-sm mb-3">אנדרואיד</p>
            <a
              href={APK_URL}
              download
              className="block w-full text-center text-base px-5 py-3 rounded-full font-bold text-white active:scale-95 transition-transform"
              style={{ background: "var(--primary)" }}
            >
              הורידו את האפליקציה
            </a>
            <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
              לאחר ההורדה, פתחו את הקובץ שירד והתקינו. אם אנדרואיד מבקש אישור —
              אשרו <strong>"התקנה ממקור לא ידוע"</strong> (זה תקין ובטוח). הקישור הזה תמיד
              מוביל לגרסה העדכנית ביותר.
            </p>
          </div>
        )}

        {showIOS && (
          <div
            className="mt-5 w-full p-5 text-right"
            style={{ background: "var(--rose-soft)", borderRadius: "var(--radius)" }}
          >
            <p className="font-bold text-sm mb-2">אייפון</p>
            <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
              פתחו את הדף הזה ב‑<strong>Safari</strong>, לחצו על כפתור השיתוף ⬆️ בסרגל,
              בחרו <strong>"הוסף למסך הבית"</strong>, ואז פתחו את האפליקציה מהאייקון החדש.
              האפליקציה תתעדכן לבד בכל פתיחה.
            </p>
          </div>
        )}

        <p className="mt-8 text-xs" style={{ color: "var(--muted-foreground)" }}>
          כבר מותקן אצלכם? האפליקציה מתעדכנת אוטומטית — אין צורך להוריד מחדש.
        </p>
      </div>
    </div>
  );
}
