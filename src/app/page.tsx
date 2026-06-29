"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getBoundSalon, setBoundSalon } from "@/lib/salon-binding";

type State = "loading" | "gate" | "error" | "resolving";

export default function RootLanding() {
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [code, setCode] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  useEffect(() => {
    getBoundSalon().then((id) => {
      if (id) {
        router.replace(`/${id}`);
      } else {
        setState("gate");
      }
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 4) return;
    setState("resolving");
    setErrorMsg("");
    try {
      const res = await fetch(`/api/resolve-code?code=${encodeURIComponent(code)}`);
      if (!res.ok) {
        setErrorMsg("הקוד לא נמצא — בדקי שוב עם הסלון");
        setState("gate");
        return;
      }
      const { salonId } = await res.json() as { salonId: string };
      await setBoundSalon(salonId);
      router.replace(`/${salonId}`);
    } catch {
      setErrorMsg("שגיאת רשת — נסי שוב");
      setState("gate");
    }
  }

  function handleDigit(idx: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = code.slice(0, idx) + digit + code.slice(idx + 1);
    setCode(next);
    if (digit && idx < 3) inputRefs[idx + 1].current?.focus();
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !code[idx] && idx > 0) {
      inputRefs[idx - 1].current?.focus();
    }
  }

  if (state === "loading") return null;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-8 px-6"
      dir="rtl"
      style={{ background: "var(--background)" }}
    >
      <div className="text-center">
        <h1
          className="font-extrabold"
          style={{ color: "var(--foreground)", fontSize: "clamp(36px, 10vw, 56px)", letterSpacing: "-1.5px" }}
        >
          Salons 💅
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
          הכניסי את קוד הסלון שקיבלת
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col items-center gap-6">
        {/* 4-digit PIN entry */}
        <div className="flex gap-3" dir="ltr">
          {[0, 1, 2, 3].map((idx) => (
            <input
              key={idx}
              ref={inputRefs[idx]}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={code[idx] ?? ""}
              onChange={(e) => handleDigit(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              onFocus={(e) => e.target.select()}
              className="text-center text-2xl font-bold"
              style={{
                width: 60, height: 68,
                borderRadius: 16,
                border: `2px solid ${code[idx] ? "var(--rose)" : "var(--border-color)"}`,
                background: "var(--surface)",
                color: "var(--foreground)",
                outline: "none",
                fontSize: 28,
                transition: "border-color 0.15s",
              }}
            />
          ))}
        </div>

        {errorMsg && (
          <p className="text-sm text-center" style={{ color: "#D2628A" }}>{errorMsg}</p>
        )}

        <button
          type="submit"
          disabled={code.length !== 4 || state === "resolving"}
          className="w-56 py-3.5 font-bold text-white transition-opacity disabled:opacity-40"
          style={{ background: "var(--primary)", borderRadius: "var(--pill)" }}
        >
          {state === "resolving" ? "מחברת..." : "כניסה"}
        </button>
      </form>

      <p className="text-xs text-center" style={{ color: "var(--muted-foreground)", maxWidth: 280, lineHeight: 1.6 }}>
        הקוד מגיע מהסלון שלך (4 ספרות).
        <br />
        <Link href="/onboard" style={{ color: "var(--rose)", textDecoration: "underline" }}>
          להצטרפות כמאניקוריסטית
        </Link>
      </p>
    </div>
  );
}
