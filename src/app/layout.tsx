// NOTE: Do NOT add `export const dynamic = "force-dynamic"` here. Every page is a
// client component that fetches Firebase data in the browser, so the server only
// needs to emit a static shell. Forcing dynamic rendering made every navigation pay
// a serverless invocation (cold-start lag in the Capacitor WebView) for no benefit.
// API routes and the service-worker route declare their own runtime/dynamic config.

import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { NativeSetup } from "@/components/native/NativeSetup";
import { PushPermissionPrompt } from "@/components/native/PushPermissionPrompt";
import { WebPushPermissionPrompt } from "@/components/native/WebPushPermissionPrompt";
import { WebPushSetup } from "@/components/native/WebPushSetup";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover", // content renders behind notch / Dynamic Island
  themeColor: "#FCF1F3",
};

export const metadata: Metadata = {
  title: "Salons | הזמנת תורים",
  description: "הזמינו תור בקלות אצל מניקוריסטית השכונה שלכם",
  manifest: "/manifest.json",
  icons: { apple: "/icons/apple-touch-icon.png" },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": "Salons",
    "mobile-web-app-capable": "yes",
    "format-detection": "telephone=no",
  },
};

/**
 * Inline script that runs at HTML-parse time, before React hydrates.
 * Captures `beforeinstallprompt` (Chrome Android) so the download page
 * can read it synchronously — avoiding the hydration-race where the event
 * fires before useEffect listeners are registered.
 * Also registers the service worker early on every page so Chrome's
 * installability heuristic is satisfied before the user reaches /download.
 */
const earlyCapture = `
(function(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(function(){});
  }
  function capture(e){
    e.preventDefault();
    window.__deferredInstallPrompt = e;
    window.dispatchEvent(new Event('installprompt-ready'));
  }
  window.addEventListener('beforeinstallprompt', capture);
  window.addEventListener('appinstalled', function(){
    window.__deferredInstallPrompt = null;
  });
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="min-h-screen antialiased">
        {/* eslint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: earlyCapture }} />
        <NativeSetup />
        <PushPermissionPrompt />
        <WebPushPermissionPrompt />
        <WebPushSetup />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
