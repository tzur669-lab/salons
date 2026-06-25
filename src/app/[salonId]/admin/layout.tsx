"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSalon } from "@/contexts/SalonProvider";
import { useAdminNotifications } from "@/components/notifications/AdminNotificationsProvider";

function buildNav(salonId: string) {
  return [
    { href: `/${salonId}/admin`,                   label: "לוח ראשי" },
    { href: `/${salonId}/admin/appointments`,       label: "תורים" },
    { href: `/${salonId}/admin/calendar`,           label: "יומן" },
    { href: `/${salonId}/admin/reports`,            label: "דוחות" },
    { href: `/${salonId}/admin/services`,           label: "שירותים" },
    { href: `/${salonId}/admin/availability`,       label: "זמינות" },
    { href: `/${salonId}/admin/clients`,            label: "לקוחות" },
    { href: `/${salonId}/admin/clinic`,             label: "פרטים ומידע" },
    { href: `/${salonId}/admin/payment`,            label: "תשלום" },
  ];
}

function PendingBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="inline-flex items-center justify-center font-extrabold text-white"
      style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, fontSize: 11, lineHeight: 1, background: "var(--rose)" }}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { salonId, salon, isOwner, loading } = useSalon();
  const { pendingCount } = useAdminNotifications();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !isOwner) router.replace(`/${salonId}`);
  }, [isOwner, loading, router, salonId]);

  if (loading || !isOwner) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
        <span className="inline-block rounded-full animate-pulse" style={{ width: 14, height: 14, background: "var(--rose)" }} />
      </div>
    );
  }

  const ADMIN_NAV = buildNav(salonId);
  const homeHref  = `/${salonId}/admin`;

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <header
        className="sticky top-0 z-50 px-5 h-14 flex items-center justify-between"
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--border-color)" }}
      >
        <Link href={homeHref} className="text-lg font-extrabold" style={{ color: "var(--foreground)" }}>
          {salon?.displayName ?? salonId}
        </Link>
        <span className="text-xs px-3 py-1.5 rounded-full font-bold" style={{ background: "var(--rose-soft)", color: "var(--rose)" }}>
          ממשק ניהול
        </span>
      </header>

      <div className="flex max-w-5xl mx-auto">
        <aside
          className="hidden md:flex flex-col w-52 p-4 gap-1 min-h-screen sticky top-14"
          style={{ borderLeft: "1px solid var(--border-color)" }}
        >
          {ADMIN_NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={
                  active
                    ? { background: "var(--rose-soft)", color: "var(--foreground)", fontWeight: 700 }
                    : { color: "var(--muted-foreground)" }
                }
              >
                <span className="rounded-full" style={{ width: 6, height: 6, background: active ? "var(--rose)" : "transparent" }} />
                <span className="flex-1">{item.label}</span>
                {item.href === homeHref && <PendingBadge count={pendingCount} />}
              </Link>
            );
          })}
        </aside>

        <main className="flex-1 p-4 pb-24 md:pb-4">{children}</main>
      </div>

      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 flex overflow-x-auto z-50"
        style={{ background: "var(--surface)", borderTop: "1px solid var(--border-color)", padding: "6px 4px calc(8px + env(safe-area-inset-bottom))" }}
      >
        {ADMIN_NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex-shrink-0 flex flex-col items-center gap-1.5 px-3.5 py-1.5"
            >
              {item.href === homeHref && pendingCount > 0 && (
                <span className="absolute" style={{ top: -2, insetInlineEnd: 6 }}>
                  <PendingBadge count={pendingCount} />
                </span>
              )}
              <span className="rounded-full" style={{ width: 20, height: 4, background: active ? "var(--rose)" : "transparent" }} />
              <span className="text-xs whitespace-nowrap" style={{ color: active ? "var(--foreground)" : "var(--muted-foreground)", fontWeight: active ? 700 : 500 }}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
