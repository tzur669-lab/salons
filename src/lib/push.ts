import { Capacitor } from "@capacitor/core";
import { auth } from "@/lib/firebase";
import { openExternal } from "@/lib/open-external";

/**
 * Native FCM push: permission flow + token registration + reminder channel.
 *
 * Design (Android 13+ aware):
 *  - The OS notification prompt is ONE-SHOT — once denied it never shows again.
 *    So we NEVER call requestPermissions() blindly. A soft-ask UI
 *    (PushPermissionPrompt) gates the real request; this module only requests
 *    when explicitly told to.
 *  - Token freshness: initPushNotifications() runs on every native launch (via
 *    useAuth's auth-state listener). If permission is already granted it
 *    re-fetches and re-stores the token — catching tokens that rotated while the
 *    app was closed (the case the live `tokenReceived` listener can't catch).
 */

export const REMINDER_CHANNEL_ID = "appointment-reminders";

export type PushPermission = "granted" | "denied" | "prompt" | "prompt-with-rationale";

// Returns the plugin wrapped in an object — never the bare plugin proxy.
// Returning a Capacitor plugin proxy directly from an async function makes the
// runtime treat it as a thenable and call `.then()` on it natively →
// "FirebaseMessaging.then() is not implemented on android". The wrapper avoids it.
async function plugin() {
  const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
  return { FirebaseMessaging };
}

/**
 * Creates the HIGH-importance Android channel reminders are sent on, so they
 * appear as a heads-up notification with sound (FCM's auto channel is low
 * importance → silent, no pop-up). Idempotent. Android-only, no-op elsewhere.
 */
export async function ensureReminderChannel(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
  try {
    const { FirebaseMessaging } = await plugin();
    await FirebaseMessaging.createChannel({
      id: REMINDER_CHANNEL_ID,
      name: "תזכורות לתורים",
      description: "תזכורת שעה לפני התור שלך",
      importance: 4, // IMPORTANCE_HIGH → heads-up + sound
      visibility: 1, // VISIBILITY_PUBLIC
      vibration: true,
      lights: true,
    });
  } catch (e) {
    console.error("[push] createChannel failed", e);
  }
}

/** Current permission state without prompting. */
export async function getPushPermission(): Promise<PushPermission | "unavailable"> {
  if (!Capacitor.isNativePlatform()) return "unavailable";
  try {
    const { FirebaseMessaging } = await plugin();
    const { receive } = await FirebaseMessaging.checkPermissions();
    return receive as PushPermission;
  } catch {
    return "unavailable";
  }
}

/**
 * Requests OS notification permission. Call ONLY after a soft-ask.
 * Returns true if granted. Never re-prompts when already denied (one-shot).
 */
export async function requestPushPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { FirebaseMessaging } = await plugin();
    const current = (await FirebaseMessaging.checkPermissions()).receive;
    if (current === "granted") return true;
    if (current === "denied") return false; // OS won't show the dialog again
    const { receive } = await FirebaseMessaging.requestPermissions();
    return receive === "granted";
  } catch (e) {
    console.error("[push] requestPermissions failed", e);
    return false;
  }
}

/**
 * Fetches the current FCM token and stores it for this user. Assumes permission
 * is granted. Safe to call repeatedly (also serves as refresh-on-launch).
 */
export async function registerPushToken(userId: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { FirebaseMessaging } = await plugin();
    const { token } = await FirebaseMessaging.getToken();
    const saved = await saveToken(token, userId);

    // Re-bind listeners (avoid duplicates across calls).
    await FirebaseMessaging.removeAllListeners();
    await FirebaseMessaging.addListener("tokenReceived", (event) => {
      saveToken(event.token, userId).catch(console.error);
    });
    await FirebaseMessaging.addListener("notificationActionPerformed", (event) => {
      const data = event.notification.data as Record<string, string> | undefined;
      // `url` = an absolute link meant for the SYSTEM browser (e.g. the app-update
      // download — a WebView can't download an APK). `route` = in-app navigation.
      const url = data?.url;
      if (url) {
        openExternal(url).catch(console.error);
        return;
      }
      const route = data?.route;
      if (route) window.location.href = route;
    });
    return saved;
  } catch (e) {
    console.error("[push] registerPushToken failed", e);
    return false;
  }
}

/**
 * Called from useAuth after login AND on every native launch.
 * Ensures the channel exists and, IF permission is already granted, refreshes +
 * stores the token. Does NOT prompt — the soft-ask owns the first request.
 */
export async function initPushNotifications(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await ensureReminderChannel();
  const state = await getPushPermission();
  if (state === "granted") {
    await registerPushToken(userId);
  }
}

async function saveToken(token: string, userId: string): Promise<boolean> {
  try {
    // The route derives the uid from this ID token (body userId is ignored). If
    // there's no signed-in user there's nothing to register — bail quietly.
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) return false;
    const platform = Capacitor.getPlatform(); // "android" | "ios"
    const res = await fetch("/api/register-push-token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ token, userId, platform }),
    });
    return res.ok;
  } catch (e) {
    console.error("[push] saveToken failed", e);
    return false;
  }
}
