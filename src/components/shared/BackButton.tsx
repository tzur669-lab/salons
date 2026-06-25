"use client";
import { usePathname, useRouter } from "next/navigation";

// Routes where the back button should NOT appear (landing + home + admin section).
function shouldHide(pathname: string): boolean {
  return pathname === "/" || pathname === "/home" || pathname.startsWith("/admin");
}

/**
 * Back button shown at the top of the page content (top-right in RTL — the circled
 * location), instead of in the top app bar. On a deep link / hard refresh the browser
 * history may be empty, so router.back() would do nothing (or exit the app); in that
 * case we fall back to navigating Home.
 */
export function BackButton() {
  const pathname = usePathname();
  const router = useRouter();

  if (shouldHide(pathname)) return null;

  function handleBack() {
    // history.length is 1 when this is the first entry (fresh tab / deep link / refresh).
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/home");
    }
  }

  return (
    <div className="pt-5">
      <button
        onClick={handleBack}
        className="font-bold flex items-center gap-1.5 px-4 py-2 text-sm transition-all active:scale-95"
        style={{
          color: "var(--rose)",
          background: "var(--rose-soft)",
          borderRadius: "var(--pill)",
          border: "1.5px solid var(--rose)",
          cursor: "pointer",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
        חזור
      </button>
    </div>
  );
}
