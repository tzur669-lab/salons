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
} from "@/lib/web-push";

const ASKED_KEY = "web-push-soft-ask-done";

/**
 * Startup permission flow for the **installed PWA** (the iPhone path) — the web
 * twin of the native PushPermissionPrompt. iOS cannot fire the OS notification
 * prompt on page load (it requires transient user activation), so the closest
 * compliant "ask immediately on launch" is this soft-ask modal shown on first
 * launch: its single button tap fires the real OS prompt.
 *
 * Shown once, only when the OS would actually show a dialog (permission
 * "default"). The OS prompt is one-shot on iOS — a soft-ask first means a
 * reflexive dismissal doesn't burn it permanently. Renders nothing on native
 * (PushPermissionPrompt owns that), in a Safari tab (push unsupported until
 * installed — WebNotificationsBanner shows the install guide), or when
 * unsupported/already answered.
 *
 * Mounted in layout.tsx ABOVE <Providers> → must NOT call useAuth(); reads
 * auth.currentUser directly. If nobody is signed in yet, granting permission is
 * still valuable (it's per-origin): the token gets registered after login by
 * useAuth's push init / WebPushSetup's next-launch refresh.
 */
export function WebPushPermissionPrompt() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    if (!isStandalonePWA()) return;
    if (localStorage.getItem(ASKED_KEY)) return;

    let cancelled = false;
    (async () => {
      if (!(await isWebPushSupported())) return;
      if (cancelled) return;
      if (getWebPushPermission() === "default") {
        // Small delay so it doesn't collide with the first paint.
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

  async function allow() {
    setBusy(true);
    // Gesture-first: requestWebPushPermission() must be the FIRST call in the
    // handler — Safari blocks the prompt if any async work runs before it.
    const result = await requestWebPushPermission();
    if (result === "granted") {
      const uid = auth.currentUser?.uid;
      if (uid) await registerWebPushToken(uid);
    }
    localStorage.setItem(ASKED_KEY, "1");
    setBusy(false);
    setOpen(false);
  }

  function notNow() {
    localStorage.setItem(ASKED_KEY, "1");
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[1000] flex items-end justify-center"
      style={{ background: "rgba(40,26,32,0.45)" }}
      onClick={notNow}
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
        <h2 className="font-extrabold mb-2" style={{ color: "var(--foreground)", fontSize: 22 }}>
          שלא תפספסי את התור
        </h2>
        <p className="mb-6 text-sm" style={{ color: "var(--muted-foreground)", lineHeight: 1.6 }}>
          נעדכן אותך כשהתור מאושר ונשלח תזכורת עדינה בדיוק שעה לפני התור שלך אצל רני.
          אפשרי קבלת התראות כדי שלא תשכחי.
        </p>
        <button
          onClick={allow}
          disabled={busy}
          className="w-full py-3.5 font-bold text-white text-base active:scale-95 transition-transform disabled:opacity-60"
          style={{ background: "var(--primary)", borderRadius: "var(--pill)" }}
        >
          {busy ? "רגע..." : "כן, אשמח לעדכונים"}
        </button>
        <button
          onClick={notNow}
          disabled={busy}
          className="w-full py-3 mt-2 font-medium text-sm"
          style={{ color: "var(--muted-foreground)" }}
        >
          לא עכשיו
        </button>
      </div>
    </div>
  );
}
