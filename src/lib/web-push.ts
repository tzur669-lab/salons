import { Capacitor } from "@capacitor/core";
import {
  isSupported,
  getMessaging,
  getToken,
  onMessage,
  type Messaging,
} from "firebase/messaging";
import app, { auth } from "@/lib/firebase";

/**
 * Web Push for installed PWAs (the iPhone path — iOS 16.4+, home-screen only).
 * Counterpart of the native `push.ts`; uses the Firebase Web SDK + a service
 * worker instead of the Capacitor plugin. Tokens land in the same `pushTokens/`
 * store via /api/register-push-token, so the existing cron sends to them with
 * no server change. Every entry point is a safe no-op where unsupported.
 */

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
const SW_URL = "/firebase-messaging-sw.js";

let _messaging: Messaging | null = null;
let _registration: ServiceWorkerRegistration | null = null;
let _foregroundBound = false;

/** True only on a real browser that supports FCM Web Push (async — calls isSupported()). */
export async function isWebPushSupported(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) return false; // native uses the Capacitor plugin
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return false;
  if (!VAPID_KEY) return false; // not configured yet
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

/** Whether the app is running as an installed PWA (required for push on iOS). */
export function isStandalonePWA(): boolean {
  if (typeof window === "undefined") return false;
  const mql = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone;
  return !!mql || iosStandalone === true;
}

export type WebPushPermission = "granted" | "denied" | "default" | "unavailable";

/** Current permission without prompting. */
export function getWebPushPermission(): WebPushPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unavailable";
  return Notification.permission as WebPushPermission;
}

/**
 * Requests OS notification permission. MUST be called as the FIRST thing inside a
 * user-gesture handler — Safari blocks the prompt if any async work runs before
 * it. Hence this does nothing but call requestPermission().
 */
export function requestWebPushPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return Promise.resolve("denied");
  }
  return Notification.requestPermission();
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (_registration?.active) return _registration;
  if (!("serviceWorker" in navigator)) return null;
  await navigator.serviceWorker.register(SW_URL);
  // getToken() needs an ACTIVE service worker — registering returns before the
  // worker finishes installing/activating, so `subscribe` fails with
  // "no active Service Worker". `.ready` resolves only once one is active.
  _registration = await navigator.serviceWorker.ready;
  return _registration;
}

function bindForeground(messaging: Messaging) {
  if (_foregroundBound) return;
  _foregroundBound = true;
  // Foreground messages aren't auto-displayed by the SW — show them manually.
  onMessage(messaging, (payload) => {
    const title = payload.notification?.title ?? "רוני ניילס";
    const body = payload.notification?.body ?? "";
    const route = (payload.data?.route as string | undefined) ?? "/my-appointments";
    _registration
      ?.showNotification(title, { body, data: { route }, icon: "/icons/icon-192.png" })
      .catch(() => {});
  });
}

/**
 * Registers the SW, obtains an FCM web token, and stores it for this user.
 * Assumes permission is already granted (call after requestWebPushPermission()).
 * Returns true on success. Safe to call repeatedly (refresh-on-launch).
 */
export async function registerWebPushToken(userId: string): Promise<boolean> {
  if (!(await isWebPushSupported())) return false;
  if (getWebPushPermission() !== "granted") return false;
  try {
    const registration = await ensureRegistration();
    if (!registration) return false;
    _messaging ??= getMessaging(app);
    const token = await getToken(_messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return false;
    bindForeground(_messaging);
    // The route derives the uid from this ID token (body userId is ignored).
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) return false;
    const res = await fetch("/api/register-push-token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ token, userId, platform: "web" }),
    });
    return res.ok;
  } catch (e) {
    console.error("[web-push] registerWebPushToken failed", e);
    return false;
  }
}

/** The current web token if one can be obtained (for logout cleanup). Null otherwise. */
export async function getCurrentWebToken(): Promise<string | null> {
  if (!(await isWebPushSupported())) return null;
  if (getWebPushPermission() !== "granted") return null;
  try {
    const registration = await ensureRegistration();
    if (!registration) return null;
    _messaging ??= getMessaging(app);
    return (await getToken(_messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration })) || null;
  } catch {
    return null;
  }
}
