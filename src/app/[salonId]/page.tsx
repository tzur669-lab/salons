"use client";
import Link from "next/link";
import { AppShell } from "@/components/shared/AppShell";
import { WhatsAppFab } from "@/components/shared/WhatsAppFab";
import { useSalon } from "@/contexts/SalonProvider";

const STEPS: [string, string][] = [
  ["בוחרים טיפול", "מהרשימה"],
  ["בוחרים מתי", "יום ושעה פנויים"],
  ["וזהו", "המאניקוריסטית מאשרת בוואטסאפ"],
];

export default function SalonHomePage() {
  const { salonId, salon } = useSalon();
  const name = salon?.displayName ?? salonId;

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
        </div>

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
