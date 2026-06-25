"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { verifyPasswordResetCode, confirmPasswordReset } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useSalon } from "@/contexts/SalonProvider";

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

export default function ResetPasswordForm() {
  const { salonId, salon } = useSalon();
  const params = useSearchParams();
  const oobCode = params.get("oobCode") ?? "";

  const [status, setStatus] = useState<"loading" | "valid" | "invalid" | "success">("loading");
  const [accountEmail, setAccountEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!oobCode) { setStatus("invalid"); return; }
    verifyPasswordResetCode(auth, oobCode)
      .then((email) => { setAccountEmail(email); setStatus("valid"); })
      .catch(() => setStatus("invalid"));
  }, [oobCode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) { setError("הסיסמאות אינן תואמות"); return; }
    if (newPassword.length < 6) { setError("הסיסמה חייבת להכיל לפחות 6 תווים"); return; }
    setSaving(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setStatus("success");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/expired-action-code" || code === "auth/invalid-action-code") {
        setError("הקישור פג תוקף — בקש קישור חדש");
      } else if (code === "auth/weak-password") {
        setError("הסיסמה חלשה מדי — מינימום 6 תווים");
      } else {
        setError(`שגיאה: ${code ?? "unknown"}`);
      }
    } finally {
      setSaving(false);
    }
  }

  const loginHref = `/${salonId}/login`;
  const salonName = salon?.displayName ?? salonId;

  const fieldStyle: React.CSSProperties = {
    width: "100%", padding: "14px 16px", borderRadius: 16,
    border: "1px solid var(--border-color)", background: "var(--accent)",
    fontSize: 16, color: "var(--foreground)", outline: "none",
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-5"
      style={{ background: "linear-gradient(168deg, var(--pink) 0%, var(--rose-soft) 55%, var(--background) 100%)" }}
    >
      <div className="w-full max-w-sm p-8 rounded-3xl shadow-xl" style={{ background: "var(--surface)" }} dir="rtl">
        <div className="text-center mb-8">
          <div className="text-xs font-bold" style={{ letterSpacing: 3, color: "var(--rose)" }}>{salonName}</div>
          <h1 className="text-2xl font-extrabold mt-2" style={{ color: "var(--foreground)" }}>איפוס סיסמה</h1>
        </div>

        {status === "loading" && (
          <div className="flex justify-center py-8">
            <span className="inline-block rounded-full animate-pulse" style={{ width: 14, height: 14, background: "var(--rose)" }} />
          </div>
        )}

        {status === "invalid" && (
          <div className="text-center py-4">
            <p className="text-3xl mb-3">⚠️</p>
            <p className="font-semibold mb-2" style={{ color: "var(--foreground)" }}>הקישור פג תוקף או אינו תקין</p>
            <p className="text-sm mb-6" style={{ color: "var(--muted-foreground)" }}>בקש קישור חדש מדף ההתחברות</p>
            <Link href={loginHref} className="inline-block px-6 py-3 rounded-full font-semibold text-white text-sm" style={{ background: "var(--primary)" }}>
              חזור להתחברות
            </Link>
          </div>
        )}

        {status === "valid" && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {accountEmail && (
              <p className="text-sm text-center" style={{ color: "var(--muted-foreground)" }}>
                מאפס סיסמה עבור: <span dir="ltr" className="font-medium" style={{ color: "var(--foreground)" }}>{accountEmail}</span>
              </p>
            )}
            <div style={{ position: "relative" }}>
              <input
                type={showPwd ? "text" : "password"}
                placeholder="סיסמה חדשה"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required dir="ltr"
                style={{ ...fieldStyle, paddingLeft: 48 }}
              />
              <button type="button" onClick={() => setShowPwd((v) => !v)}
                style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 4, display: "flex", alignItems: "center" }}
                tabIndex={-1}
              >
                <EyeIcon open={showPwd} />
              </button>
            </div>
            <input type="password" placeholder="אישור סיסמה חדשה" value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)} required dir="ltr" style={fieldStyle} />
            {error && <p className="text-sm text-center" style={{ color: "#e53e3e" }}>{error}</p>}
            <button type="submit" disabled={saving} className="w-full py-3.5 font-bold text-white disabled:opacity-60"
              style={{ background: "var(--primary)", borderRadius: "var(--pill)" }}>
              {saving ? "שומר..." : "שמור סיסמה חדשה"}
            </button>
          </form>
        )}

        {status === "success" && (
          <div className="text-center py-4">
            <p className="text-3xl mb-3">✅</p>
            <p className="font-semibold mb-2" style={{ color: "var(--foreground)" }}>הסיסמה עודכנה בהצלחה!</p>
            <p className="text-sm mb-6" style={{ color: "var(--muted-foreground)" }}>כעת ניתן להתחבר עם הסיסמה החדשה</p>
            <Link href={loginHref} className="inline-block px-6 py-3 rounded-full font-semibold text-white text-sm" style={{ background: "var(--primary)" }}>
              להתחברות
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
