import { registerPlugin, Capacitor } from "@capacitor/core";

/**
 * Native bridge to Android battery-optimization controls. Backed by the custom
 * BatteryOptimizationPlugin (Java) — present only in the APK built after that
 * plugin was added. On web or an older APK every call is a safe no-op, and the
 * UI falls back to manual instructions.
 */
export interface BatteryOptimizationPlugin {
  isIgnoring(): Promise<{ ignoring: boolean }>;
  requestIgnore(): Promise<void>;
  openBatterySettings(): Promise<void>;
  openAppDetails(): Promise<void>;
}

const BatteryOptimization = registerPlugin<BatteryOptimizationPlugin>("BatteryOptimization");

/** True only when the native plugin is actually present (the Part-B APK). */
export function hasBatteryPlugin(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("BatteryOptimization");
}

/** Whether the app is already exempt from battery optimization. Assumes true when uncheckable. */
export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  if (!hasBatteryPlugin()) return true;
  try {
    return (await BatteryOptimization.isIgnoring()).ignoring;
  } catch {
    return true;
  }
}

/** One-tap system dialog to exempt the app from battery optimization. */
export async function requestIgnoreBatteryOptimizations(): Promise<void> {
  if (!hasBatteryPlugin()) return;
  try {
    await BatteryOptimization.requestIgnore();
  } catch (e) {
    console.error("[battery] requestIgnore failed", e);
  }
}

/** Opens the OS battery-optimization list (no special permission needed). */
export async function openBatterySettings(): Promise<void> {
  if (!hasBatteryPlugin()) return;
  try {
    await BatteryOptimization.openBatterySettings();
  } catch (e) {
    console.error("[battery] openBatterySettings failed", e);
  }
}

/** Opens this app's system settings page (for the OEM auto-launch toggle). */
export async function openAppDetailsSettings(): Promise<void> {
  if (!hasBatteryPlugin()) return;
  try {
    await BatteryOptimization.openAppDetails();
  } catch (e) {
    console.error("[battery] openAppDetails failed", e);
  }
}
