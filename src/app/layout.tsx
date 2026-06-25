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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="min-h-screen antialiased">
        <NativeSetup />
        <PushPermissionPrompt />
        <WebPushPermissionPrompt />
        <WebPushSetup />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
