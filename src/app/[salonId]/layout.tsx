import { SalonProvider } from "@/contexts/SalonProvider";
import { AdminNotificationsProvider } from "@/components/notifications/AdminNotificationsProvider";

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
