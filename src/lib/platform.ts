/**
 * Pure platform detection helpers (no Capacitor import — safe everywhere).
 */

/** True on iPhone / iPad / iPod, including iPadOS 13+ which reports as Mac. */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as Mac; the touch-points check catches it.
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** True on Android devices. */
export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

/**
 * True when running inside a social-media in-app browser (Instagram, Facebook,
 * WhatsApp, Messenger, Twitter/X, Line, Snapchat, TikTok, or a generic Android
 * webview). PWA install is impossible in these browsers — show an "open in
 * Chrome/Safari" prompt instead.
 */
export function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /FBAN|FBAV|Instagram|Line|WhatsApp|Messenger|Twitter|Snapchat|TikTok|\bwv\b/i.test(
    navigator.userAgent
  );
}
