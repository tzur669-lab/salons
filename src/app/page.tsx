"use client";
import Link from "next/link";

export default function RootLanding() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6 px-6"
      dir="rtl"
      style={{ background: "var(--background)" }}
    >
      <h1
        className="font-extrabold text-center"
        style={{ color: "var(--foreground)", fontSize: "clamp(36px, 10vw, 64px)", letterSpacing: "-1.5px" }}
      >
        Salons 💅
      </h1>
      <p className="text-center" style={{ color: "var(--muted-foreground)", maxWidth: 320, lineHeight: 1.6 }}>
        הכניסי את הלינק שקיבלת מהמאניקוריסטית שלך,
        <br />
        או <Link href="/onboard" style={{ color: "var(--rose)", textDecoration: "underline" }}>הצטרפי כמאניקוריסטית</Link>.
      </p>
    </div>
  );
}
