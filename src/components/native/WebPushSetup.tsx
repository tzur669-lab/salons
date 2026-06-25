"use client";
import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  isWebPushSupported,
  isStandalonePWA,
  getWebPushPermission,
  registerWebPushToken,
} from "@/lib/web-push";

/**
 * Web mirror of the native refresh-on-launch (push.ts initPushNotifications):
 * for an installed PWA where permission was already granted, re-fetch and store
 * the FCM web token on every launch (tokens rotate while the app is closed).
 * Never prompts — there's no user gesture at launch, so it only runs when the
 * permission is already "granted". Renders nothing.
 */
export function WebPushSetup() {
  useEffect(() => {
    // Synchronous guards — checked before subscribing so the cleanup always has
    // a valid `unsub` reference. isWebPushSupported is async and therefore runs
    // inside the listener (checked again after each auth event).
    if (!isStandalonePWA()) return;
    if (getWebPushPermission() !== "granted") return;

    let active = true;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!active || !user) return;
      if (!(await isWebPushSupported())) return;
      if (!active) return; // re-check after the async call
      registerWebPushToken(user.uid).catch(() => {});
    });

    return () => {
      active = false;
      unsub(); // actually detaches the Firebase listener (was never called before)
    };
  }, []);

  return null;
}
