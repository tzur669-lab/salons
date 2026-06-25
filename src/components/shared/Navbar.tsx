"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useSalon } from "@/contexts/SalonProvider";
import { useAdminNotifications } from "@/components/notifications/AdminNotificationsProvider";

type NavItem = { href: string; label: string; short: string; owner?: boolean };

function buildNavItems(salonId: string, isOwner: boolean, loggedIn: boolean): NavItem[] {
  const items: NavItem[] = [
    { href: `/${salonId}`,                  label: "בית",          short: "בית" },
    { href: `/${salonId}/book`,             label: "הזמנת תור",   short: "הזמנה" },
    { href: `/${salonId}/my-appointments`,  label: "התורים שלי",  short: "התורים" },
    { href: `/${salonId}/clinic`,           label: "פרטים",       short: "פרטים" },
  ];
  if (loggedIn) items.push({ href: `/${salonId}/profile`, label: "פרופיל", short: "פרופיל" });
  if (isOwner)  items.push({ href: `/${salonId}/admin`,   label: "ניהול",   short: "ניהול", owner: true });
  return items;
}

function NavBadge({ count }: { count: number }) {
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

export function Navbar() {
  const { user, appUser, logout } = useAuth();
  const { salonId, salon, isOwner } = useSalon();
  const { pendingCount } = useAdminNotifications();
  const pathname = usePathname();
  const router = useRouter();

  const NAV_ITEMS = buildNavItems(salonId, isOwner, !!user);

  if (pathname.startsWith(`/${salonId}/admin`)) return null;

  async function handleLogout() {
    await logout();
    router.push(`/${salonId}`);
  }

  return (
    <>
      <header
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--border-color)", paddingTop: "env(safe-area-inset-top)" }}
        className="sticky top-0 z-50"
      >
        <div className="max-w-3xl mx-auto px-5 min-h-16 h-16 flex items-center justify-between">
          <Link href={`/${salonId}`} className="text-lg font-extrabold tracking-tight" style={{ color: "var(--foreground)" }}>
            {salon?.displayName ?? salonId}
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-4 py-2 rounded-full text-sm font-medium transition-colors inline-flex items-center gap-1.5"
                  style={
                    active
                      ? { background: "var(--rose-soft)", color: "var(--foreground)", fontWeight: 700 }
                      : { color: "var(--muted-foreground)" }
                  }
                >
                  {item.label}
                  {item.owner && <NavBadge count={pendingCount} />}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {user && appUser?.name && (
              <span className="px-3 py-1.5 rounded-full text-sm font-semibold" style={{ background: "var(--rose-soft)", color: "var(--foreground)" }}>
                {appUser.name.split(" ")[0]}
              </span>
            )}
            {user ? (
              <button onClick={handleLogout} className="px-3 py-2 rounded-full text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
                יציאה
              </button>
            ) : (
              <Link href={`/${salonId}/login`} className="px-5 py-2.5 rounded-full text-sm font-bold text-white" style={{ background: "var(--primary)" }}>
                התחברות
              </Link>
            )}
          </div>
        </div>
      </header>

      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50 flex"
        style={{ background: "var(--surface)", borderTop: "1px solid var(--border-color)", padding: "8px 6px calc(10px + env(safe-area-inset-bottom))" }}
      >
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className="relative flex-1 flex flex-col items-center gap-1.5 py-1">
              {item.owner && pendingCount > 0 && (
                <span className="absolute left-1/2 -translate-x-1/2" style={{ top: -3, marginInlineStart: 18 }}>
                  <NavBadge count={pendingCount} />
                </span>
              )}
              <span className="rounded-full transition-colors" style={{ width: 24, height: 5, background: active ? "var(--rose)" : "transparent" }} />
              <span className="text-xs" style={{ color: active ? "var(--foreground)" : "var(--muted-foreground)", fontWeight: active ? 700 : 500 }}>
                {item.short}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
