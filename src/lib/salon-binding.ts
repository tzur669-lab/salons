/**
 * Persists the "bound salon" — the salonId the current device is permanently
 * linked to after first-launch code entry.
 *
 * On native (Android/iOS APK): uses @capacitor/preferences (backed by
 * SharedPreferences / NSUserDefaults), which survives low-memory kills and
 * OS-level WebView storage evictions. Also mirrors to localStorage so web
 * code can read it synchronously when needed.
 *
 * On web / PWA: localStorage only.
 */

const LS_KEY = "boundSalonId";
const PREF_KEY = "boundSalonId";

let _isNative: boolean | null = null;

async function isNative(): Promise<boolean> {
  if (_isNative !== null) return _isNative;
  try {
    const { Capacitor } = await import("@capacitor/core");
    _isNative = Capacitor.isNativePlatform();
  } catch {
    _isNative = false;
  }
  return _isNative;
}

export async function getBoundSalon(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (await isNative()) {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      const { value } = await Preferences.get({ key: PREF_KEY });
      if (value) {
        // Keep localStorage in sync so synchronous reads work after first async load.
        localStorage.setItem(LS_KEY, value);
        return value;
      }
    } catch {
      // Fall through to localStorage mirror.
    }
  }
  return localStorage.getItem(LS_KEY);
}

export async function setBoundSalon(salonId: string): Promise<void> {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_KEY, salonId);
  if (await isNative()) {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.set({ key: PREF_KEY, value: salonId });
    } catch {
      // Preferences unavailable — localStorage mirror is the fallback.
    }
  }
}

export async function clearBoundSalon(): Promise<void> {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LS_KEY);
  if (await isNative()) {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.remove({ key: PREF_KEY });
    } catch {}
  }
}

/** Synchronous read from the localStorage mirror — use only where async isn't possible. */
export function getBoundSalonSync(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LS_KEY);
}
