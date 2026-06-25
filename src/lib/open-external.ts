import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { isIOS } from "@/lib/platform";

/**
 * Opens a URL in the system browser (Chrome Custom Tab on Android,
 * SFSafariViewController on iOS). This ensures native app intents fire
 * correctly — e.g. wa.me links open WhatsApp instead of loading a web
 * page inside the WebView.
 * On web / PWA, opens a new tab normally.
 */
export async function openExternal(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url });
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * Opens a WhatsApp chat link. Accepts a `https://wa.me/<phone>?text=<t>` URL.
 *
 * On native we DON'T route through the wa.me web page: on iOS SFSafariViewController
 * never hands the universal link to the WhatsApp app, and on both platforms the
 * wa.me web→app redirect re-encodes the text and corrupts astral emoji (e.g. 🤍
 * `%F0%9F%A4%8D` arrives as `ð¤…` mojibake). Instead we rewrite to the native
 * `whatsapp://send?phone=&text=` scheme and let the OS launch WhatsApp directly,
 * so WhatsApp's own decoder reads the (unchanged) percent-encoded UTF-8 text.
 *
 * The `text` is reused verbatim from the wa.me URL — it is already
 * `encodeURIComponent`-ed by the builders in `whatsapp.ts`, so we must NOT
 * re-encode it. Falls back to the wa.me URL in the system browser if the scheme
 * can't be opened (e.g. WhatsApp not installed).
 *
 * On iOS **web/PWA** (Safari tab or installed PWA — no Capacitor bridge) we ALSO
 * use the `whatsapp://` scheme, via `window.location.href`: callers invoke this
 * after awaited work (status update + client push), by which point the tap's
 * transient activation has expired and Safari silently popup-blocks
 * `window.open` (returns null, no error). A same-window scheme navigation is
 * not subject to the popup blocker. If WhatsApp isn't installed the navigation
 * fails silently, so a visibility-checked timer falls back to the wa.me URL.
 *
 * On desktop web we keep `window.open(wa.me)` (no `whatsapp://` handler).
 */
export async function openWhatsApp(waUrl: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const scheme = toWhatsAppScheme(waUrl);
    if (!scheme) {
      // Not a recognizable wa.me link — open as-is in the system browser.
      await Browser.open({ url: waUrl });
      return;
    }
    try {
      // Navigating to a non-http(s) scheme makes Capacitor's WebView hand the URL
      // to the OS (UIApplication.open on iOS / Intent on Android) → WhatsApp opens.
      window.location.href = scheme;
    } catch {
      await Browser.open({ url: waUrl });
    }
    return;
  }

  // Web / installed PWA.
  const scheme = isIOS() ? toWhatsAppScheme(waUrl) : null;
  if (!scheme) {
    window.open(waUrl, "_blank", "noopener,noreferrer");
    return;
  }

  // If WhatsApp opened, the page hides → cancel the fallback. If we're still
  // visible after the grace period, WhatsApp isn't installed → go to wa.me.
  const fallback = window.setTimeout(() => {
    if (document.visibilityState === "visible") window.location.href = waUrl;
  }, 2000);
  const cancelFallback = () => {
    if (document.visibilityState === "hidden") window.clearTimeout(fallback);
  };
  document.addEventListener("visibilitychange", cancelFallback, { once: true });
  window.addEventListener("pagehide", () => window.clearTimeout(fallback), { once: true });

  window.location.href = scheme;
}

/**
 * Converts `https://wa.me/<phone>?text=<encoded>` → `whatsapp://send?phone=<phone>&text=<encoded>`,
 * preserving the already-encoded `text` exactly (no decode/re-encode round-trip
 * that could mangle astral emoji). Returns null if the URL isn't a wa.me link.
 */
function toWhatsAppScheme(waUrl: string): string | null {
  // wa.me puts the phone in the path: wa.me/<phone>?text=...
  const phoneMatch = waUrl.match(/wa\.me\/(\d+)/i);
  if (!phoneMatch) return null;
  const phone = phoneMatch[1];

  // Extract the raw, already-encoded text query param WITHOUT decoding it.
  const textMatch = waUrl.match(/[?&]text=([^&]*)/);
  const encodedText = textMatch ? textMatch[1] : "";

  const params = [`phone=${phone}`];
  if (encodedText) params.push(`text=${encodedText}`);
  return `whatsapp://send?${params.join("&")}`;
}
