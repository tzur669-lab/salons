import type { Metadata } from "next";
import { SalonProvider } from "@/contexts/SalonProvider";
import { AdminNotificationsProvider } from "@/components/notifications/AdminNotificationsProvider";
import { getSalonServer } from "@/lib/server/salon-read";
import { shortAppName } from "@/lib/app-name";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ salonId: string }>;
}): Promise<Metadata> {
  const { salonId } = await params;
  const salon = await getSalonServer(salonId);
  const name = salon?.displayName ?? salonId;
  const shortName = shortAppName(name);

  return {
    title: name,
    // Override the root manifest so each salon gets its own installable PWA identity.
    manifest: `/${salonId}/manifest.webmanifest`,
    // apple-mobile-web-app-title is emitted by appleWebApp.title (no need to duplicate in `other`).
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: shortName,
    },
    // Re-declare the root layout's `other` fields — Next merges metadata but replaces
    // `other` wholesale at the deepest level, so salon pages would lose them otherwise.
    other: {
      "apple-mobile-web-app-capable": "yes",
      "mobile-web-app-capable": "yes",
      "format-detection": "telephone=no",
    },
  };
}

export default async function SalonLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ salonId: string }>;
}) {
  const { salonId } = await params;
  return (
    <SalonProvider salonId={salonId}>
      <AdminNotificationsProvider>
        {children}
      </AdminNotificationsProvider>
    </SalonProvider>
  );
}
