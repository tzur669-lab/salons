"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signInWithCredential,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  createUserWithEmailAndPassword,
  signOut,
  type User,
  type UserCredential,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUser, createUser } from "@/lib/firestore/users";
import type { AppUser } from "@/types";

// Capacitor and Google Auth are lazily imported — only available on native builds.
// On web these imports are never executed.
let _Capacitor: typeof import("@capacitor/core").Capacitor | null = null;
let _GoogleAuth: typeof import("@codetrix-studio/capacitor-google-auth").GoogleAuth | null = null;
let _googleAuthInitialized = false;

async function getCapacitor() {
  if (!_Capacitor) {
    const mod = await import("@capacitor/core");
    _Capacitor = mod.Capacitor;
  }
  return _Capacitor;
}

// NOTE: returns the plugin wrapped in an object — never the bare plugin proxy.
// A Capacitor plugin proxy is "thenable" (any property access, incl. `.then`,
// returns a function), so returning it directly from an async function makes the
// runtime assimilate it as a promise and invoke `.then()` on it natively →
// "GoogleAuth.then() is not implemented on android". The wrapper avoids that.
async function getGoogleAuth() {
  if (!_GoogleAuth) {
    const mod = await import("@codetrix-studio/capacitor-google-auth");
    _GoogleAuth = mod.GoogleAuth;
  }
  return { GoogleAuth: _GoogleAuth };
}

// True when running as an installed/standalone PWA (iOS "Add to Home Screen" uses
// navigator.standalone; other platforms expose the display-mode media query). In this
// mode browser popups are unavailable, so an async signInWithPopup() failure burns the
// user-activation and the redirect fallback gets blocked as a non-user-initiated
// navigation → the Google picker never opens. Detecting it lets us call
// signInWithRedirect() directly inside the click gesture instead.
function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const mediaStandalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches === true;
  return iosStandalone || mediaStandalone;
}


// Fallbacks mirror the values in capacitor.config.ts so native sign-in still
// initializes with a valid client ID even if the NEXT_PUBLIC_* env vars are not
// set in the deployment. Without this, an unset env var made `clientId` undefined
// → GoogleAuth.initialize() could throw → on iOS the button appeared to do nothing.
const IOS_CLIENT_ID_FALLBACK = "903565127318-f8ut8smvr34nlpa7vjc0n72gmns17c0a.apps.googleusercontent.com";
const WEB_CLIENT_ID_FALLBACK = "903565127318-ugg7kjv1mgi51dsf7qer4l2p2c29hp5u.apps.googleusercontent.com";

async function initGoogleAuthOnce() {
  if (_googleAuthInitialized) return;
  const Cap = await getCapacitor();
  if (!Cap.isNativePlatform()) return;

  const platform = Cap.getPlatform(); // 'android' | 'ios'

  // iOS Client ID for iOS, Web Client ID (serverClientId) for Android — always a
  // defined string (env var → else the capacitor.config.ts value).
  const clientId =
    platform === "ios"
      ? process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID || IOS_CLIENT_ID_FALLBACK
      : process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID || WEB_CLIENT_ID_FALLBACK;

  try {
    const { GoogleAuth } = await getGoogleAuth();
    // NO grantOfflineAccess: the app only consumes the momentary ID token (for Firebase
    // signInWithCredential) — it never exchanges a server auth code or calls a Google API
    // on the user's behalf. Requesting offline access forced a fresh refresh-token grant on
    // every sign-in, which made Google re-send its "Sign in with Google" data-access email
    // each login. Without it, a returning user is a remembered grant → no repeat email.
    GoogleAuth.initialize({
      clientId,
      scopes: ["profile", "email"],
    });
  } catch (e) {
    // Never let a failed initialize block the actual signIn() — on iOS the plugin
    // also reads its config from GoogleService-Info.plist / capacitor.config.ts.
    console.error("[useAuth] GoogleAuth.initialize failed", e);
  }
  _googleAuthInitialized = true;
}

/**
 * Re-authenticates the current user with Google for sensitive operations
 * (changing email, setting a password). On native (Capacitor) we MUST use the
 * native Google Sign-In SDK + a credential — reauthenticateWithPopup() inside the
 * WebView triggers Firebase's redirect flow, which fails with
 * "missing initial state … sessionStorage" because the WebView's sessionStorage is
 * partitioned/cleared between the OAuth hops. On web we keep the popup, which stays
 * in the same document and avoids the redirect-state problem.
 */
export async function reauthenticateWithGoogle(currentUser: User): Promise<void> {
  const Cap = await getCapacitor();

  if (Cap.isNativePlatform()) {
    await initGoogleAuthOnce();
    const { GoogleAuth } = await getGoogleAuth();
    const googleUser = await GoogleAuth.signIn();
    if (!googleUser.authentication.idToken) {
      throw new Error("No ID token from Google Sign-In");
    }
    const credential = GoogleAuthProvider.credential(
      googleUser.authentication.idToken,
      googleUser.authentication.accessToken
    );
    await reauthenticateWithCredential(currentUser, credential);
    return;
  }

  // Web / desktop PWA: popup keeps the same document context (no redirect-state loss).
  await reauthenticateWithPopup(currentUser, new GoogleAuthProvider());
}

// ── Auth methods (module-level: stateless, rely on the auth-state listener) ──────
async function signInWithGoogle(): Promise<User | undefined> {
  const Cap = await getCapacitor();

  if (Cap.isNativePlatform()) {
    // Native: use the native Google Sign-In SDK — bypasses WebView OAuth restriction.
    // Ensure initialize() has run before signIn() — the effect kicks it off but
    // may not have finished if the user taps the button immediately (iOS race).
    await initGoogleAuthOnce();
    const { GoogleAuth } = await getGoogleAuth();
    try {
      const googleUser = await GoogleAuth.signIn();

      if (!googleUser.authentication.idToken) {
        throw new Error("No ID token from Google Sign-In");
      }

      const credential = GoogleAuthProvider.credential(
        googleUser.authentication.idToken,
        googleUser.authentication.accessToken
      );

      const result = await signInWithCredential(auth, credential);

      const u = await getUser(result.user.uid);
      if (!u) {
        await createUser(result.user.uid, {
          name: result.user.displayName ?? (googleUser as { name?: string }).name ?? "",
          email: result.user.email ?? "",
          phone: "",
          role: "client",
        }).catch(console.error);
      }

      return result.user;
    } catch (err: unknown) {
      const message = (err as Error)?.message ?? "";
      // User tapped cancel in the native dialog — silent
      if (message.includes("canceled") || message.includes("cancelled")) return;
      throw err;
    }
  } else {
    // Web / PWA
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    // Installed/standalone PWA (esp. iOS "Add to Home Screen"): popups are
    // unavailable and an async popup failure burns the user-activation, so the
    // redirect fallback below gets blocked as a non-user-initiated navigation and
    // the Google picker never opens. Go straight to redirect *inside the click
    // gesture*. getRedirectResult() in the effect below completes the return leg
    // (relies on the same-origin authDomain + /__/auth proxy already shipped in
    // firebase.ts / next.config.ts).
    if (isStandaloneDisplay()) {
      await signInWithRedirect(auth, provider);
      return;
    }

    try {
      const result = await signInWithPopup(auth, provider);
      const u = await getUser(result.user.uid);
      if (!u) {
        await createUser(result.user.uid, {
          name: result.user.displayName ?? "",
          email: result.user.email ?? "",
          phone: "",
          role: "client",
        }).catch(console.error);
      }
      return result.user;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      // Popup couldn't open/complete → fall back to a full-page redirect.
      if (
        code === "auth/popup-blocked" ||
        code === "auth/popup-cancelled-by-user" ||
        code === "auth/cancelled-popup-request" ||
        code === "auth/operation-not-supported-in-this-environment"
      ) {
        await signInWithRedirect(auth, provider);
        return;
      }
      throw err;
    }
  }
}

async function signInWithEmail(email: string, password: string): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password);
}

async function signUpWithEmail(email: string, password: string, name: string): Promise<User> {
  const authEmail = email.trim() || `noemail_${Date.now()}@placeholder.com`;
  const result = await createUserWithEmailAndPassword(auth, authEmail, password);
  try {
    await createUser(result.user.uid, {
      name,
      email: email.trim() || "",
      authEmail,
      phone: "",
      role: "client",
    });
  } catch (err) {
    console.error("Firestore createUser failed after signup:", err);
  }
  return result.user;
}

type SignInByNameResult =
  | { type: "success" }
  | { type: "ambiguous"; accounts: { maskedPhone: string; index: number }[] };

async function signInByName(
  name: string,
  password: string,
  disambiguateIndex?: number
): Promise<SignInByNameResult> {
  const res = await fetch("/api/login-by-name", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, password, disambiguateIndex }),
  });
  const data = await res.json();

  if (data.type === "success") {
    await signInWithCustomToken(auth, data.token);
    return { type: "success" };
  }
  if (data.type === "ambiguous") {
    return { type: "ambiguous", accounts: data.accounts };
  }
  throw Object.assign(new Error(data.error), { code: data.error });
}

async function logout(): Promise<void> {
  const currentUser = auth.currentUser;

  if (currentUser) {
    const Cap = await getCapacitor();
    const uid = currentUser.uid;
    // Grab the ID token while still signed in — the route authorizes the delete by
    // verifying it (and derives the uid from it). Fetched once, before signOut().
    const idToken = await currentUser.getIdToken().catch(() => null);
    // Session hygiene: remove THIS device's token (server-side, via Admin SDK —
    // a client-side Firestore delete is denied by the default-deny rules) so the
    // next user on this device doesn't inherit the previous user's pushes.
    const removeToken = async (token: string) => {
      await fetch("/api/register-push-token", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ token }),
      }).catch(() => {});
    };

    if (Cap.isNativePlatform()) {
      await import("@capacitor-firebase/messaging")
        .then(async ({ FirebaseMessaging }) => {
          const { token } = await FirebaseMessaging.getToken().catch(() => ({ token: "" }));
          if (token) await removeToken(token);
          await FirebaseMessaging.deleteToken().catch(() => {});
        })
        .catch(() => {});
    } else {
      // Web/PWA: remove the current web-push token if one is registered.
      await import("@/lib/web-push")
        .then(({ getCurrentWebToken }) => getCurrentWebToken())
        .then((token) => (token ? removeToken(token) : undefined))
        .catch(() => {});
    }
  }

  await signOut(auth);
}

// ── Context ──────────────────────────────────────────────────────────────────
export interface AuthValue {
  user: User | null;
  appUser: AppUser | null;
  loading: boolean;
  isAdmin: boolean;
  needsPhone: boolean;
  signInWithGoogle: () => Promise<User | undefined>;
  signInWithEmail: (email: string, password: string) => Promise<UserCredential>;
  signInByName: (name: string, password: string, disambiguateIndex?: number) => Promise<SignInByNameResult>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * One auth listener for the whole app. Previously `useAuth` was a hook, so every
 * component that called it registered its own onAuthStateChanged listener and
 * re-fetched the users/{uid} doc — N duplicate reads + a loading flicker on each
 * navigation. Now a single provider owns the state and broadcasts via context.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initialize native Google Auth once (no-op on web)
    initGoogleAuthOnce().catch(console.error);

    // Handle redirect result in case popup was blocked and redirect was used as fallback
    getRedirectResult(auth)
      .then(async (result) => {
        if (result?.user) {
          const u = await getUser(result.user.uid);
          if (!u) {
            await createUser(result.user.uid, {
              name: result.user.displayName ?? "",
              email: result.user.email ?? "",
              phone: "",
              role: "client",
            }).catch(console.error);
          }
        }
      })
      .catch(console.error);

    // Main auth state listener
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        let u = await getUser(firebaseUser.uid);
        if (!u) {
          await createUser(firebaseUser.uid, {
            name: firebaseUser.displayName ?? "",
            email: firebaseUser.email ?? "",
            phone: "",
            role: "client",
          }).catch(console.error);
          u = await getUser(firebaseUser.uid);
        }

        setAppUser(u);

        // Initialize push notifications after login (native only)
        import("@/lib/push")
          .then(({ initPushNotifications }) => initPushNotifications(firebaseUser.uid))
          .catch(console.error);
      } else {
        setAppUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const value = useMemo<AuthValue>(() => {
    const isAdmin = appUser?.role === "admin";
    const needsPhone = !!user && !!appUser && !appUser.phoneVerified;
    return {
      user,
      appUser,
      loading,
      isAdmin,
      needsPhone,
      signInWithGoogle,
      signInWithEmail,
      signInByName,
      signUpWithEmail,
      logout,
    };
  }, [user, appUser, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Read the shared auth state. Must be used inside <AuthProvider> (mounted in providers.tsx). */
export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
