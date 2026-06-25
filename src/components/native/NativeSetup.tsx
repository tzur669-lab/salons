"use client";
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useBookingStore } from "@/store/bookingStore";

/**
 * Renders nothing — handles native-only side effects:
 * 1. Status bar: dark icons on the light pink background, overlay mode (edge-to-edge)
 * 2. Android back button: routes to wizard prevStep() or browser history.back()
 *
 * Mounted once at the root layout. No-op on web / PWA.
 */
export function NativeSetup() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Status bar
    import("@capacitor/status-bar")
      .then(({ StatusBar, Style }) => {
        StatusBar.setStyle({ style: Style.Dark });
        StatusBar.setOverlaysWebView({ overlay: true });
      })
      .catch(console.error);

    // Android back button
    import("@capacitor/app")
      .then(({ App }) => {
        App.addListener("backButton", ({ canGoBack }) => {
          // Check booking wizard state without React subscription (Zustand supports this)
          const { step, prevStep } = useBookingStore.getState();
          const isInWizard = window.location.pathname === "/book";

          if (isInWizard && step > 1) {
            prevStep();
            return;
          }

          if (canGoBack) {
            window.history.back();
          } else {
            // No browser history left — send app to background (Android only)
            App.minimizeApp();
          }
        });
      })
      .catch(console.error);
  }, []);

  return null;
}
