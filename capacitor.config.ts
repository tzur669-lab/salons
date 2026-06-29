import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.roninails.app',  // kept from fork for v1 — update in Part C when Firebase is re-wired for the Salons project
  appName: 'Salons',
  // Must point to an existing directory. public/ already exists in the Next.js project.
  // In remote URL mode Capacitor serves from server.url, not from webDir — but it
  // checks webDir exists at sync time and reads errorPath from it.
  webDir: 'public',

  server: {
    url: 'https://salonss.vercel.app',
    cleartext: false,
    androidScheme: 'https',

    // Native offline fallback: when the remote URL fails to load (no network at launch),
    // Capacitor loads this local file from the app bundle — before any React code runs.
    errorPath: '/offline.html',

    // Allow navigation to WhatsApp domains so the native OS intercepts wa.me links
    // and opens the WhatsApp app instead of loading inside the WebView (iOS fix).
    allowNavigation: [
      'wa.me',
      '*.wa.me',
      'api.whatsapp.com',
      '*.whatsapp.com',
    ],
  },

  android: {
    allowMixedContent: false,
    // Safe-off by default so a release build can't accidentally ship a remotely
    // debuggable WebView. Opt in for local debugging with CAP_DEBUG=true before `cap sync`.
    webContentsDebuggingEnabled: process.env.CAP_DEBUG === "true",
    backgroundColor: '#FDFAF7',
  },

  ios: {
    scheme: 'app',
    limitsNavigationsToAppBoundDomains: true,
    backgroundColor: '#FDFAF7',
    scrollEnabled: true,
    contentInset: 'automatic',
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#FDFAF7',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
      fadeOutDuration: 400,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#FDFAF7',
      overlaysWebView: true,
    },
    GoogleAuth: {
      // iosClientId  → iOS OAuth Client ID (CLIENT_ID in GoogleService-Info.plist)
      // clientId     → Android OAuth Client ID (from google-services.json)
      // serverClientId → Web OAuth Client ID (required by Firebase signInWithCredential)
      iosClientId: '903565127318-f8ut8smvr34nlpa7vjc0n72gmns17c0a.apps.googleusercontent.com',
      clientId: '903565127318-ugg7kjv1mgi51dsf7qer4l2p2c29hp5u.apps.googleusercontent.com',
      serverClientId: '903565127318-ugg7kjv1mgi51dsf7qer4l2p2c29hp5u.apps.googleusercontent.com',
      scopes: ['profile', 'email'],
      // No forceCodeForRefreshToken: the app uses only the ID token to sign into Firebase
      // and never needs a Google refresh token. Forcing a fresh auth-code grant per login
      // made Google re-send its "Sign in with Google" data-access email on every sign-in.
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
