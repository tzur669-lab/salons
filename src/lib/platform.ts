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
