"use client";
import Link from "next/link";
import Image from "next/image";
import { AppShell } from "@/components/shared/AppShell";
import { WhatsAppFab } from "@/components/shared/WhatsAppFab";
import { useSalon } from "@/contexts/SalonProvider";

const STEPS: [string, string][] = [
  ["בוחרים טיפול", "מהרשימה"],
  ["בוחרים מתי", "יום ושעה פנויים"],
  ["וזהו", "המאניקוריסטית מאשרת בוואטסאפ"],
];

/**
 * Client body of the salon home page. `instagramUrl` + `galleryImages` are read
 * server-side ([salonId]/page.tsx) and passed in as props, so the Instagram button
 * and portfolio teaser are present on first paint — no client fetch, no layout shift.
 * Conditional: each only renders when the owner actually configured it.
 */
export function HomeContent({
  instagramUrl,
  galleryImages,
}: {
  instagramUrl: string;
  galleryImages: string[];
}) {
  const { salonId, salon } = useSalon();
  const name = salon?.displayName ?? salonId;
  const hasPortfolio = galleryImages.length > 0;
  const preview = galleryImages.slice(0, 4);

  return (
    <AppShell>
      <div className="pt-5 md:pt-7 pb-10">
        <div
          className="text-center px-6 py-14 md:py-20"
          style={{
            borderRadius: "var(--radius-lg)",
            background: "linear-gradient(168deg, var(--pink) 0%, var(--rose-soft) 70%, var(--surface) 100%)",
          }}
        >
          <div className="text-xs font-bold" style={{ letterSpacing: 3, color: "var(--rose)" }}>
            {name}
          </div>
          <h1
            className="font-extrabold mt-4"
            style={{ color: "var(--foreground)", fontSize: "clamp(44px, 12vw, 80px)", lineHeight: 0.98, letterSpacing: "-2px" }}
          >
            קביעת תור<br />אונליין
          </h1>
          <p
            className="mx-auto mt-5 text-base md:text-lg"
            style={{ maxWidth: 320, color: "var(--foreground)", opacity: 0.7, lineHeight: 1.6 }}
          >
            בוחרים טיפול, יום ושעה. {name} מאשרת בוואטסאפ.
          </p>
          <Link
            href={`/${salonId}/book`}
            className="inline-block mt-8 px-10 py-4 font-bold text-white text-base active:scale-95 transition-transform"
            style={{ background: "var(--primary)", borderRadius: "var(--pill)", boxShadow: "var(--shadow)" }}
          >
            קביעת תור
          </Link>

          {instagramUrl && (
            <div className="mt-6">
              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="עקבו באינסטגרם"
                className="inline-flex items-center gap-2 px-6 py-3 font-bold text-white text-sm active:scale-95 transition-transform"
                style={{
                  borderRadius: "var(--pill)",
                  background: "linear-gradient(45deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)",
                  boxShadow: "0 6px 18px rgba(188,24,136,0.25)",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="2" y="2" width="20" height="20" rx="5.5" stroke="#fff" strokeWidth="2" />
                  <circle cx="12" cy="12" r="4.2" stroke="#fff" strokeWidth="2" />
                  <circle cx="17.4" cy="6.6" r="1.3" fill="#fff" />
                </svg>
                עקבו באינסטגרם
              </a>
            </div>
          )}
        </div>

        {/* Portfolio teaser → dedicated page (only when there are photos) */}
        {hasPortfolio && (
          <Link
            href={`/${salonId}/portfolio`}
            className="block mt-10 p-5 transition-all active:scale-[0.99]"
            style={{ borderRadius: "var(--radius)", background: "var(--surface)", boxShadow: "var(--card-shadow)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-lg font-bold" style={{ color: "var(--foreground)" }}>תיק עבודות</p>
              <span className="text-sm font-bold" style={{ color: "var(--rose)" }}>צפייה בהכל ←</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {preview.map((url, i) => (
                <div key={i} className="relative overflow-hidden" style={{ aspectRatio: "1 / 1", borderRadius: 12 }}>
                  <Image src={url} alt={`עבודה ${i + 1}`} fill sizes="(max-width: 768px) 25vw, 120px" className="object-cover" />
                </div>
              ))}
            </div>
          </Link>
        )}

        <h2 className="font-extrabold mt-12 mb-4" style={{ color: "var(--foreground)", fontSize: 26, letterSpacing: "-0.6px" }}>
          איך זה עובד
        </h2>
        <div className="grid md:grid-cols-3 gap-3">
          {STEPS.map(([title, body], i) => (
            <div key={i} className="p-6" style={{ borderRadius: "var(--radius)", background: "var(--surface)", boxShadow: "var(--card-shadow)" }}>
              <div
                className="flex items-center justify-center rounded-full font-extrabold mb-3.5"
                style={{ width: 42, height: 42, background: "var(--rose-soft)", color: "var(--rose)", fontSize: 18 }}
              >
                {i + 1}
              </div>
              <div className="text-lg font-bold" style={{ color: "var(--foreground)" }}>{title}</div>
              <div className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>{body}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-10">
          <Link
            href={`/${salonId}/clinic`}
            className="p-6 text-center transition-all active:scale-[0.99]"
            style={{ borderRadius: "var(--radius)", background: "var(--surface)", boxShadow: "var(--card-shadow)" }}
          >
            <p className="text-base font-bold" style={{ color: "var(--foreground)" }}>פרטים ומיקום</p>
            <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>שעות, כתובת ויצירת קשר</p>
          </Link>
          <Link
            href={`/${salonId}/my-appointments`}
            className="p-6 text-center transition-all active:scale-[0.99]"
            style={{ borderRadius: "var(--radius)", background: "var(--surface)", boxShadow: "var(--card-shadow)" }}
          >
            <p className="text-base font-bold" style={{ color: "var(--foreground)" }}>התורים שלי</p>
            <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>צפייה ומעקב</p>
          </Link>
        </div>
      </div>
      <WhatsAppFab />
    </AppShell>
  );
}
