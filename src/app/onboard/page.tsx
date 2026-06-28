"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setPersistence, browserLocalPersistence } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";

const DAYS = [
  { idx: 0, label: "ראשון" },
  { idx: 1, label: "שני" },
  { idx: 2, label: "שלישי" },
  { idx: 3, label: "רביעי" },
  { idx: 4, label: "חמישי" },
  { idx: 5, label: "שישי" },
  { idx: 6, label: "שבת" },
];

const DEFAULT_OPEN_DAYS = [0, 1, 2, 3, 4]; // Sun-Thu

const fieldStyle: React.CSSProperties = {
  width: "100%", padding: "13px 16px", borderRadius: 16,
  border: "1px solid var(--border-color)", background: "var(--accent)",
  fontSize: 16, color: "var(--foreground)", outline: "none", direction: "rtl",
};

export default function OnboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();

  // ── First-login auth (no pre-existing salon to log in through) ──────────────
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [authEmail, setAuthEmail] = useState("");
  const [authName, setAuthName] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [step, setStep] = useState<1 | 2>(1);
  const [inviteCode, setInviteCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [englishName, setEnglishName] = useState("");
  const [phone, setPhone] = useState("");
  const [notifEmail, setNotifEmail] = useState("");
  const [address, setAddress] = useState("");
  const [openTime, setOpenTime] = useState("09:00");
  const [closeTime, setCloseTime] = useState("19:00");
  const [openDays, setOpenDays] = useState<number[]>(DEFAULT_OPEN_DAYS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Prefill the alert email with the owner's real login email (skip placeholders).
  useEffect(() => {
    if (user?.email && !user.email.includes("noemail_")) setNotifEmail(user.email);
  }, [user?.email]);

  function toggleDay(idx: number) {
    setOpenDays((prev) =>
      prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx]
    );
  }

  // After sign-in the global auth listener sets `user` → this page re-renders
  // straight into the registration form (we're already on /onboard, no redirect).
  async function handleGoogle() {
    setAuthError("");
    setAuthBusy(true);
    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithGoogle();
    } catch {
      setAuthError("שגיאה בהתחברות עם Google");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    if (authMode === "signup" && authName.trim().length < 2) {
      setAuthError("הכנס שם מלא");
      return;
    }
    if (!authEmail.includes("@")) { setAuthError("אימייל לא תקין"); return; }
    if (authPassword.length < 6) { setAuthError("הסיסמה חייבת לפחות 6 תווים"); return; }
    setAuthBusy(true);
    try {
      await setPersistence(auth, browserLocalPersistence);
      if (authMode === "signup") {
        await signUpWithEmail(authEmail.trim(), authPassword, authName.trim());
      } else {
        await signInWithEmail(authEmail.trim(), authPassword);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/email-already-in-use") setAuthError("האימייל כבר רשום — התחבר/י במקום");
      else if (code === "auth/invalid-credential" || code === "auth/wrong-password") setAuthError("אימייל או סיסמה שגויים");
      else if (authMode === "signup") setAuthError("שגיאה ביצירת חשבון");
      else setAuthError("אימייל או סיסמה שגויים");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSubmit() {
    setError("");
    if (!user) { setError("נדרשת כניסה לחשבון"); return; }
    if (!inviteCode.trim()) { setError("הכנס קוד הזמנה"); return; }
    if (displayName.trim().length < 2) { setError("שם הסלון קצר מדי"); return; }
    if (phone.replace(/\D/g, "").length < 9) { setError("מספר טלפון לא תקין"); return; }
    if (!address.trim()) { setError("הכנס כתובת"); return; }
    if (openDays.length === 0) { setError("בחר לפחות יום פעילות אחד"); return; }
    if (openTime >= closeTime) { setError("שעת פתיחה חייבת להיות לפני שעת סגירה"); return; }

    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          inviteCode: inviteCode.trim(),
          displayName: displayName.trim(),
          englishName: englishName.trim(),
          phone: phone.trim(),
          address: address.trim(),
          openTime,
          closeTime,
          openDays,
          notificationEmail: notifEmail.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msgs: Record<string, string> = {
          "invalid-invite-code": "קוד ההזמנה לא קיים",
          "invite-code-inactive": "קוד ההזמנה אינו פעיל",
          "invite-code-exhausted": "קוד ההזמנה כבר נוצל",
          "already-owner": "כבר יש לך סלון רשום",
          unauthorized: "נדרשת כניסה לחשבון",
          "slug-collision": "שגיאה ביצירת כתובת הסלון — נסה שם אחר",
        };
        setError(msgs[data?.error] ?? `שגיאה: ${data?.error ?? "unknown"}`);
        if (data?.error === "already-owner" && data?.salonId) {
          router.push(`/${data.salonId}/admin`);
        }
        return;
      }
      router.push(`/${data.salonId}/admin`);
    } catch {
      setError("שגיאת רשת — נסה שוב");
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
        <span className="inline-block rounded-full animate-pulse" style={{ width: 14, height: 14, background: "var(--rose)" }} />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-5"
      style={{ background: "linear-gradient(168deg, var(--pink) 0%, var(--rose-soft) 55%, var(--background) 100%)" }}
    >
      <div className="w-full max-w-sm p-8 rounded-3xl shadow-xl" style={{ background: "var(--surface)" }} dir="rtl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-xs font-bold mb-1" style={{ letterSpacing: 3, color: "var(--rose)" }}>Salons 💅</div>
          <h1 className="text-2xl font-extrabold" style={{ color: "var(--foreground)" }}>הרשמת סלון חדש</h1>
          {user && (
            <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
              שלב {step} מתוך 2
            </p>
          )}
        </div>

        {!user ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-center mb-1" style={{ color: "var(--muted-foreground)" }}>
              {authMode === "signup"
                ? "צרי חשבון כדי לרשום את הסלון שלך"
                : "התחברי לחשבון כדי להמשיך בהרשמה"}
            </p>

            {/* Google */}
            <button
              onClick={handleGoogle}
              disabled={authBusy}
              type="button"
              className="w-full flex items-center justify-center gap-3 py-3.5 px-4 font-bold disabled:opacity-60"
              style={{ borderRadius: "var(--pill)", border: "1px solid var(--border-color)", color: "var(--foreground)", background: "var(--surface)" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>
                <path fill="#34A853" d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"/>
                <path fill="#FBBC05" d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 0 0 0 10.76l3.98-3.09z"/>
                <path fill="#EA4335" d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.69 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/>
              </svg>
              {authBusy ? "מתחבר..." : "המשך עם Google"}
            </button>

            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px" style={{ background: "var(--border-color)" }} />
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>או</span>
              <div className="flex-1 h-px" style={{ background: "var(--border-color)" }} />
            </div>

            {/* Email / password */}
            <form onSubmit={handleAuthSubmit} className="flex flex-col gap-3">
              {authMode === "signup" && (
                <input
                  style={fieldStyle}
                  placeholder="שם מלא"
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                />
              )}
              <input
                style={fieldStyle}
                placeholder="אימייל"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                type="email"
                dir="ltr"
                autoComplete="email"
              />
              <input
                style={fieldStyle}
                placeholder="סיסמה"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                type="password"
                dir="ltr"
                autoComplete={authMode === "signup" ? "new-password" : "current-password"}
              />

              {authError && <p className="text-sm text-center" style={{ color: "#e53e3e" }}>{authError}</p>}

              <button
                type="submit"
                disabled={authBusy}
                className="w-full py-3.5 font-bold text-white disabled:opacity-60"
                style={{ background: "var(--primary)", borderRadius: "var(--pill)" }}
              >
                {authBusy ? "רגע..." : authMode === "signup" ? "יצירת חשבון" : "התחברות"}
              </button>
            </form>

            <button
              type="button"
              onClick={() => { setAuthMode(authMode === "signup" ? "login" : "signup"); setAuthError(""); }}
              className="w-full mt-1 text-sm text-center font-semibold"
              style={{ color: "var(--rose)" }}
            >
              {authMode === "signup" ? "כבר יש לך חשבון? להתחברות" : "אין לך חשבון? ליצירת חשבון"}
            </button>
          </div>
        ) : step === 1 ? (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--muted-foreground)" }}>קוד הזמנה</label>
              <input
                style={fieldStyle}
                placeholder="הכנס קוד הזמנה"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                autoComplete="off"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--muted-foreground)" }}>שם הסלון</label>
              <input
                style={fieldStyle}
                placeholder='לדוגמה: "רני ניילס"'
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--muted-foreground)" }}>שם באנגלית לכתובת האתר (לא חובה)</label>
              <input
                style={{ ...fieldStyle, direction: "ltr" }}
                placeholder="gilat-nails"
                value={englishName}
                onChange={(e) => setEnglishName(e.target.value)}
                dir="ltr"
                autoComplete="off"
              />
              <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                זו הכתובת שתופיע בקישור הסלון. אם תשאירי ריק — תיווצר אוטומטית מהשם בעברית.
              </p>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--muted-foreground)" }}>טלפון / וואטסאפ</label>
              <input
                style={fieldStyle}
                placeholder="05X-XXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                type="tel"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--muted-foreground)" }}>אימייל להתראות על תורים (לא חובה)</label>
              <input
                style={fieldStyle}
                placeholder="name@example.com"
                value={notifEmail}
                onChange={(e) => setNotifEmail(e.target.value)}
                type="email"
                dir="ltr"
              />
            </div>

            {error && <p className="text-sm text-center" style={{ color: "#e53e3e" }}>{error}</p>}

            <button
              onClick={() => {
                setError("");
                if (!inviteCode.trim()) { setError("הכנס קוד הזמנה"); return; }
                if (displayName.trim().length < 2) { setError("שם הסלון קצר מדי"); return; }
                if (phone.replace(/\D/g, "").length < 9) { setError("מספר טלפון לא תקין"); return; }
                setStep(2);
              }}
              className="w-full py-3.5 font-bold text-white"
              style={{ background: "var(--primary)", borderRadius: "var(--pill)" }}
            >
              המשך
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--muted-foreground)" }}>כתובת הסלון</label>
              <input
                style={fieldStyle}
                placeholder='לדוגמה: "רחוב הרצל 12, תל אביב"'
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs mb-1 block" style={{ color: "var(--muted-foreground)" }}>פתיחה</label>
                <input
                  type="time"
                  value={openTime}
                  onChange={(e) => setOpenTime(e.target.value)}
                  style={{ ...fieldStyle, padding: "12px 10px" }}
                  dir="ltr"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs mb-1 block" style={{ color: "var(--muted-foreground)" }}>סגירה</label>
                <input
                  type="time"
                  value={closeTime}
                  onChange={(e) => setCloseTime(e.target.value)}
                  style={{ ...fieldStyle, padding: "12px 10px" }}
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <label className="text-xs mb-2 block" style={{ color: "var(--muted-foreground)" }}>ימי פעילות</label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map(({ idx, label }) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleDay(idx)}
                    className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                    style={{
                      background: openDays.includes(idx) ? "var(--rose)" : "var(--accent)",
                      color: openDays.includes(idx) ? "#fff" : "var(--foreground)",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-center" style={{ color: "#e53e3e" }}>{error}</p>}

            <div className="flex gap-3 mt-2">
              <button
                onClick={() => { setError(""); setStep(1); }}
                className="flex-1 py-3.5 font-bold"
                style={{ borderRadius: "var(--pill)", border: "1px solid var(--border-color)", background: "transparent", color: "var(--foreground)" }}
              >
                חזור
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-3.5 font-bold text-white disabled:opacity-60"
                style={{ background: "var(--primary)", borderRadius: "var(--pill)" }}
              >
                {submitting ? "יוצר סלון..." : "סיים הרשמה"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
