"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setPersistence, browserLocalPersistence, browserSessionPersistence, fetchSignInMethodsForEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useSalon } from "@/contexts/SalonProvider";
import { ForgotPassword } from "@/components/shared/ForgotPassword";
import { Capacitor } from "@capacitor/core";

export default function LoginPage() {
  const { user, signInWithGoogle, signInWithEmail, signInByName, signUpWithEmail } = useAuth();
  const { salonId, salon } = useSalon();
  const router = useRouter();
  const isNative = Capacitor.isNativePlatform();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [disambiguateAccounts, setDisambiguateAccounts] = useState<
    { maskedPhone: string; index: number }[] | null
  >(null);

  useEffect(() => {
    // Don't redirect while the Forgot-Password modal is open: the SMS reset signs in
    // a temporary phone session mid-flow, which would otherwise navigate away and
    // unmount the modal. On success the modal calls onClose → this then redirects.
    if (user && !showForgotPassword) router.push(`/${salonId}`);
  }, [user, showForgotPassword, router, salonId]);

  async function applyPersistence() {
    await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
  }

  async function handleGoogle() {
    setLoading(true);
    let didNavigate = false;
    try {
      await applyPersistence();
      const result = await signInWithGoogle();
      if (result) {
        didNavigate = true;
        router.push(`/${salonId}`);
      }
    } catch (err) {
      console.error("[login] Google sign-in failed", err);
      setError("שגיאה בהתחברות עם Google");
    } finally {
      if (!didNavigate) setLoading(false);
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setDisambiguateAccounts(null);
    try {
      await applyPersistence();
      if (mode === "login") {
        if (identifier.includes("@")) {
          // Safety net for Google-only accounts on native (Google button hidden in v1).
          // Email Enumeration Protection must be OFF in Firebase Console →
          // Authentication → Settings for fetchSignInMethodsForEmail to work.
          if (isNative) {
            try {
              const methods = await fetchSignInMethodsForEmail(auth, identifier);
              if (methods.length === 1 && methods[0] === "google.com") {
                setError('המייל רשום דרך Google — לחצי על "שכחתי סיסמה" כדי להגדיר סיסמה ולהמשיך');
                setLoading(false);
                return;
              }
            } catch {
              // If the check fails (e.g. Enumeration Protection on), proceed normally.
            }
          }
          // Email login — straight to Firebase Auth
          await signInWithEmail(identifier, password);
          router.push(`/${salonId}`);
        } else {
          // Name login — secure server-side lookup
          const result = await signInByName(identifier, password);
          if (result.type === "ambiguous") {
            setDisambiguateAccounts(result.accounts);
            return;
          }
          router.push(`/${salonId}`);
        }
      } else {
        await signUpWithEmail(identifier, password, name);
        router.push(`/${salonId}`);
      }
    } catch (err: unknown) {
      if (mode === "login") {
        const code = (err as { code?: string })?.code;
        if (code === "name_not_found") setError("שם המשתמש לא נמצא במערכת");
        else if (code === "wrong_password") setError("שם משתמש או סיסמה שגויים");
        else if (code === "rate_limited") setError("יותר מדי ניסיונות — נסה שוב בעוד 15 דקות");
        else setError("שם משתמש/אימייל או סיסמה שגויים");
      } else {
        setError("שגיאה ביצירת חשבון");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDisambiguate(index: number) {
    setLoading(true);
    setError("");
    try {
      await applyPersistence();
      const result = await signInByName(identifier, password, index);
      if (result.type === "success") router.push(`/${salonId}`);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      setError(code === "wrong_password" ? "סיסמה שגויה" : "שגיאה — נסה שוב");
    } finally {
      setLoading(false);
    }
  }

  const field: React.CSSProperties = {
    width: "100%", padding: "14px 16px", borderRadius: 16,
    border: "1px solid var(--border-color)", background: "var(--surface)",
    fontSize: 16, color: "var(--foreground)", outline: "none",
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-5"
      style={{ background: "linear-gradient(168deg, var(--pink) 0%, var(--rose-soft) 55%, var(--background) 100%)" }}
    >
      <div
        className="w-full max-w-sm p-8"
        style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow)" }}
      >
        <div className="text-center mb-8">
          <div className="text-xs font-bold" style={{ letterSpacing: 3, color: "var(--rose)" }}>
            לק ג׳ל · רני
          </div>
          <h1 className="text-2xl font-extrabold mt-2" style={{ color: "var(--foreground)" }}>
            {salon?.displayName ?? salonId}
          </h1>
          <p className="text-sm mt-1.5" style={{ color: "var(--muted-foreground)" }}>
            {mode === "login" ? "התחברות לחשבון" : "יצירת חשבון חדש"}
          </p>
        </div>

        {/* Google Sign In — hidden on native (v1: Firebase not wired for native Google auth yet) */}
        {!isNative && (
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-4 font-bold transition-all active:scale-[0.99] disabled:opacity-60 mb-4"
            style={{ borderRadius: "var(--pill)", border: "1px solid var(--border-color)", color: "var(--foreground)", background: "var(--surface)" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>
              <path fill="#34A853" d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"/>
              <path fill="#FBBC05" d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 0 0 0 10.76l3.98-3.09z"/>
              <path fill="#EA4335" d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.69 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/>
            </svg>
            {loading ? "מתחבר..." : "המשך עם Google"}
          </button>
        )}

        {!isNative && (
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px" style={{ background: "var(--border-color)" }} />
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>או</span>
            <div className="flex-1 h-px" style={{ background: "var(--border-color)" }} />
          </div>
        )}

        {/* Disambiguation UI — shown when multiple accounts share the same name */}
        {disambiguateAccounts ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-center font-semibold" style={{ color: "var(--foreground)" }}>
              נמצאו מספר חשבונות בשם זה.
              <br />
              <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>בחר את מספר הטלפון שלך:</span>
            </p>
            {disambiguateAccounts.map((acc) => (
              <button
                key={acc.index}
                onClick={() => handleDisambiguate(acc.index)}
                disabled={loading}
                className="w-full py-3 rounded-2xl font-semibold disabled:opacity-60"
                style={{ background: "var(--rose-soft)", color: "var(--foreground)", border: "none", cursor: "pointer" }}
              >
                {acc.maskedPhone}
              </button>
            ))}
            {error && <p className="text-sm text-center" style={{ color: "#D2628A" }}>{error}</p>}
            <button
              onClick={() => { setDisambiguateAccounts(null); setError(""); }}
              className="text-sm text-center"
              style={{ color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer" }}
            >
              ← חזור
            </button>
          </div>
        ) : (
          /* Email / Name Form */
          <form onSubmit={handleEmail} className="flex flex-col gap-3">
            {mode === "signup" && (
              <input
                type="text"
                placeholder="שם מלא"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                style={field}
              />
            )}
            <input
              type="text"
              placeholder={mode === "signup" ? "אימייל (אופציונלי)" : "שם משתמש או אימייל"}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required={mode === "login"}
              dir="auto"
              style={field}
            />
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="סיסמה"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                dir="ltr"
                style={{ ...field, paddingLeft: 48 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)",
                  padding: 4, display: "flex", alignItems: "center",
                }}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>

            {/* Forgot password — login mode only */}
            {mode === "login" && (
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-sm text-right"
                style={{ color: "var(--rose)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                שכחתי סיסמה?
              </button>
            )}

            {/* Remember Me */}
            <label className="flex items-center gap-2 cursor-pointer select-none" dir="rtl">
              <div
                onClick={() => setRememberMe((v) => !v)}
                className="w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all"
                style={{
                  borderColor: rememberMe ? "var(--rose)" : "var(--border-color)",
                  background: rememberMe ? "var(--rose)" : "transparent",
                }}
              >
                {rememberMe && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                זכור אותי
              </span>
            </label>

            {error && (
              <p className="text-sm text-center" style={{ color: "#D2628A" }}>{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 font-bold text-white transition-opacity disabled:opacity-60"
              style={{ background: "var(--primary)", borderRadius: "var(--pill)" }}
            >
              {loading ? "רגע..." : mode === "login" ? "התחברות" : "הרשמה"}
            </button>
          </form>
        )}

        <button
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="w-full mt-4 text-sm text-center font-semibold"
          style={{ color: "var(--rose)" }}
        >
          {mode === "login" ? "אין לך חשבון? להרשמה" : "כבר יש חשבון? להתחברות"}
        </button>

        <button
          onClick={() => router.push(`/${salonId}`)}
          className="w-full mt-2 py-3.5 text-sm font-bold transition-all"
          style={{ borderRadius: "var(--pill)", border: "1px solid var(--border-color)", color: "var(--muted-foreground)" }}
        >
          המשך כאורח
        </button>
      </div>

      {showForgotPassword && (
        <ForgotPassword onClose={() => setShowForgotPassword(false)} />
      )}
    </div>
  );
}
