"use client";
import { useEffect, useRef, useState } from "react";
import {
  PhoneAuthProvider,
  RecaptchaVerifier,
  reauthenticateWithCredential,
  linkWithCredential,
  updatePassword,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { reauthenticateWithGoogle } from "@/hooks/useAuth";
import { buildFullPhone } from "@/lib/phone";

interface Props {
  userPhone: string | undefined;
  onSuccess: () => void;
  /**
   * "create" (default): an OAuth-only account adding its first password.
   * "reset": a password user who FORGOT their current password — same identity-proof
   * flow (SMS re-auth/link or Google), just different copy.
   */
  variant?: "create" | "reset";
}

type Step = "choose" | "sms-phone" | "sms-otp" | "new-password" | "success";

const RECAPTCHA_ID = "set-pwd-recaptcha-widget";

function getErrorMsg(code: string | undefined): string {
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "אימות נכשל — נסה שוב";
    case "auth/popup-closed-by-user":
      return "החלון נסגר לפני האימות — נסה שוב";
    case "auth/invalid-phone-number":
      return "מספר טלפון לא תקין";
    case "auth/too-many-requests":
      return "יותר מדי ניסיונות — נסה מאוחר יותר";
    case "auth/invalid-verification-code":
      return "קוד שגוי — נסה שוב";
    case "auth/code-expired":
      return "הקוד פג תוקף — שלח קוד חדש";
    case "auth/weak-password":
      return "הסיסמה חלשה מדי — מינימום 6 תווים";
    case "auth/captcha-check-failed":
      return "אימות CAPTCHA נכשל — רענן ונסה שוב";
    case "auth/user-mismatch":
      return "מספר הטלפון לא תואם לחשבון — נסה Google";
    case "auth/provider-already-linked":
      return "הטלפון כבר מקושר לחשבון";
    case "auth/credential-already-in-use":
      return "מספר הטלפון כבר משויך לחשבון אחר";
    default:
      return `שגיאה: ${code ?? "unknown"}`;
  }
}

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

export function SetPasswordForOAuth({ userPhone, onSuccess, variant = "create" }: Props) {
  const [step, setStep] = useState<Step>("choose");

  // Only offer Google re-auth when the account actually has a Google provider —
  // for a plain email+password user in "reset" mode it would only fail with
  // auth/user-mismatch.
  const hasGoogleProvider = auth.currentUser?.providerData.some(
    (p) => p.providerId === "google.com"
  ) ?? false;

  // SMS flow
  const [phone, setPhone] = useState(userPhone ?? "");
  const [otp, setOtp] = useState("");
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  // New password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // reCAPTCHA lifecycle — created when entering SMS phone step, destroyed on leave
  useEffect(() => {
    if (step !== "sms-phone") return;
    const v = new RecaptchaVerifier(auth, RECAPTCHA_ID, { size: "normal" });
    recaptchaRef.current = v;
    v.render().catch((err) => console.error("[SetPasswordForOAuth] reCAPTCHA render error:", err));
    return () => {
      v.clear();
      recaptchaRef.current = null;
    };
  }, [step]);

  const fieldStyle: React.CSSProperties = {
    width: "100%", padding: "14px 16px", borderRadius: 16,
    border: "1px solid var(--border-color)", background: "var(--accent)",
    fontSize: 16, color: "var(--foreground)", outline: "none",
  };

  const eyeBtnStyle: React.CSSProperties = {
    position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
    background: "none", border: "none", cursor: "pointer",
    color: "var(--muted-foreground)", padding: 4, display: "flex", alignItems: "center",
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleGoogleReauth() {
    setError("");
    setLoading(true);
    const currentUser = auth.currentUser;
    if (!currentUser) { setLoading(false); return; }
    try {
      await reauthenticateWithGoogle(currentUser);
      setStep("new-password");
    } catch (err: unknown) {
      setError(getErrorMsg((err as { code?: string })?.code));
    } finally {
      setLoading(false);
    }
  }

  async function handleSendSMS(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length < 9) { setError("מספר טלפון לא תקין"); return; }
    setLoading(true);
    const currentUser = auth.currentUser;
    if (!currentUser) { setLoading(false); return; }
    try {
      // Only SEND the OTP here — do NOT try to link the phone yet. linkWithPhoneNumber()
      // throws auth/provider-already-linked immediately when the phone is already on the
      // account (the common case), which blocked the whole flow. verifyPhoneNumber() just
      // sends the code and hands back a verificationId; we decide reauth-vs-link at confirm.
      const id = await new PhoneAuthProvider(auth).verifyPhoneNumber(
        buildFullPhone(phone),
        recaptchaRef.current!
      );
      setVerificationId(id);
      setStep("sms-otp");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      setError(getErrorMsg(code));
      // The reCAPTCHA token is single-use — rebuild the widget so the user can retry.
      recaptchaRef.current?.clear();
      const v = new RecaptchaVerifier(auth, RECAPTCHA_ID, { size: "normal" });
      recaptchaRef.current = v;
      v.render().catch(() => {
        setError("שגיאה בטעינת מערכת האבטחה — אנא סגור ופתח מחדש");
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (otp.length < 6) { setError("הקוד חייב להיות 6 ספרות"); return; }
    if (!verificationId) { setError("הקוד פג תוקף — שלח קוד חדש"); return; }
    setLoading(true);
    const currentUser = auth.currentUser;
    if (!currentUser) { setLoading(false); return; }
    try {
      const credential = PhoneAuthProvider.credential(verificationId, otp);

      // The user only needs to prove they control the phone (to satisfy the recent-login
      // requirement of updatePassword). Reauthenticate first — this succeeds when the
      // phone is already linked to the account (the case that used to error out).
      try {
        await reauthenticateWithCredential(currentUser, credential);
      } catch (reauthErr: unknown) {
        const reauthCode = (reauthErr as { code?: string })?.code;
        if (reauthCode === "auth/user-mismatch") {
          // Phone isn't linked to THIS account yet → link it now (valid OTP just proven).
          await linkWithCredential(currentUser, credential);
        } else {
          throw reauthErr;
        }
      }
      setStep("new-password");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/credential-already-in-use") {
        // Phone belongs to a completely different Firebase account. The login-screen
        // "שכחתי סיסמה" → SMS flow can reclaim it (it deletes the ghost holding the number).
        setError("מספר הטלפון משויך לחשבון אחר — התנתק ואפס סיסמה דרך 'שכחתי סיסמה' במסך ההתחברות");
      } else {
        // Wrong/expired code etc. — keep the user on this step so they can re-enter or
        // resend (the verifier is rebuilt when they return to the phone step).
        setError(getErrorMsg(code));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) { setError("הסיסמאות אינן תואמות"); return; }
    if (newPassword.length < 6) { setError("הסיסמה חייבת להכיל לפחות 6 תווים"); return; }
    setLoading(true);
    const currentUser = auth.currentUser;
    if (!currentUser) { setLoading(false); return; }
    try {
      await updatePassword(currentUser, newPassword);
      setStep("success");
    } catch (err: unknown) {
      setError(getErrorMsg((err as { code?: string })?.code));
    } finally {
      setLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (step === "choose") {
    return (
      <div className="flex flex-col gap-4 py-2">
        <p className="text-sm text-center" style={{ color: "var(--muted-foreground)" }}>
          {variant === "reset"
            ? "שכחת את הסיסמה הנוכחית? אמת את זהותך כדי לבחור סיסמה חדשה:"
            : "לא הוגדרה סיסמה לחשבון זה. אמת את זהותך כדי ליצור סיסמה:"}
        </p>

        {error && <p className="text-sm text-center" style={{ color: "#e53e3e" }}>{error}</p>}

        {hasGoogleProvider && (
          <button
            onClick={handleGoogleReauth}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-2xl font-semibold disabled:opacity-60"
            style={{ border: "1px solid var(--border-color)", color: "var(--foreground)", background: "var(--surface)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>
              <path fill="#34A853" d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"/>
              <path fill="#FBBC05" d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 0 0 0 10.76l3.98-3.09z"/>
              <path fill="#EA4335" d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.69 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/>
            </svg>
            {loading ? "מאמת..." : "אמת עם Google"}
          </button>
        )}

        <button
          onClick={() => setStep("sms-phone")}
          disabled={loading}
          className="w-full py-3 rounded-2xl font-semibold disabled:opacity-60"
          style={{ background: "var(--rose-soft)", color: "var(--foreground)", border: "none", cursor: "pointer" }}
        >
          אמת עם SMS
        </button>
      </div>
    );
  }

  if (step === "sms-phone") {
    return (
      <form onSubmit={handleSendSMS} className="flex flex-col gap-4">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="050-0000000"
          dir="ltr"
          className="w-full px-4 py-3 rounded-2xl border text-center text-lg"
          style={{ borderColor: error ? "#e53e3e" : "var(--border-color)", background: "var(--accent)" }}
        />
        <p className="text-xs text-center px-2" style={{ color: "var(--muted-foreground)" }}>
          ייתכן שה-SMS יגיע לספאם — שירות Firebase של Google, בטוח לחלוטין.
        </p>
        <div className="flex justify-center">
          <div id={RECAPTCHA_ID} />
        </div>
        {error && <p className="text-sm text-center" style={{ color: "#e53e3e" }}>{error}</p>}
        <button type="submit" disabled={loading}
          className="w-full py-3 rounded-2xl font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--primary)" }}>
          {loading ? "שולח קוד..." : "שלח קוד אימות"}
        </button>
        <button type="button" onClick={() => { setStep("choose"); setError(""); }}
          className="text-sm text-center" style={{ color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer" }}>
          חזור
        </button>
      </form>
    );
  }

  if (step === "sms-otp") {
    return (
      <form onSubmit={handleVerifyOTP} className="flex flex-col gap-4">
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
          placeholder="------"
          dir="ltr"
          className="w-full px-4 py-3 rounded-2xl border text-center text-2xl tracking-widest font-bold"
          style={{ borderColor: error ? "#e53e3e" : "var(--border-color)", background: "var(--accent)" }}
        />
        <p className="text-xs text-center px-2" style={{ color: "var(--muted-foreground)" }}>
          לא קיבלת קוד? ייתכן שההודעה סוננה לתיקיית הספאם באפליקציית ההודעות.
          ההודעה נשלחת דרך מערכת האימות של Google והיא בטוחה לחלוטין.
        </p>
        {error && <p className="text-sm text-center" style={{ color: "#e53e3e" }}>{error}</p>}
        <button type="submit" disabled={loading}
          className="w-full py-3 rounded-2xl font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--primary)" }}>
          {loading ? "מאמת..." : "אמת קוד"}
        </button>
        <button type="button" onClick={() => { setStep("sms-phone"); setOtp(""); setError(""); }}
          className="text-sm text-center" style={{ color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer" }}>
          שלח קוד מחדש
        </button>
      </form>
    );
  }

  if (step === "new-password") {
    return (
      <form onSubmit={handleSetPassword} className="flex flex-col gap-4">
        <p className="text-sm text-center font-semibold" style={{ color: "var(--foreground)" }}>
          בחר סיסמה חדשה
        </p>
        <div style={{ position: "relative" }}>
          <input
            type={showPwd ? "text" : "password"}
            placeholder="סיסמה חדשה"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            dir="ltr"
            style={{ ...fieldStyle, paddingLeft: 48 }}
          />
          <button type="button" onClick={() => setShowPwd((v) => !v)} style={eyeBtnStyle} tabIndex={-1}>
            <EyeIcon open={showPwd} />
          </button>
        </div>
        <input
          type="password"
          placeholder="אישור סיסמה"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          dir="ltr"
          style={fieldStyle}
        />
        {error && <p className="text-sm text-center" style={{ color: "#e53e3e" }}>{error}</p>}
        <button type="submit" disabled={loading}
          className="w-full py-3 rounded-2xl font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--primary)" }}>
          {loading ? "שומר..." : "שמור סיסמה"}
        </button>
      </form>
    );
  }

  if (step === "success") {
    return (
      <div className="text-center py-4">
        <p className="text-3xl mb-3">✅</p>
        <p className="font-semibold mb-2" style={{ color: "var(--foreground)" }}>
          {variant === "reset" ? "הסיסמה עודכנה בהצלחה!" : "הסיסמה נוצרה בהצלחה!"}
        </p>
        {variant === "create" && (
          <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
            מעכשיו תוכל להיכנס גם עם מייל וסיסמה
          </p>
        )}
        <button
          onClick={onSuccess}
          className="px-6 py-3 rounded-2xl font-semibold text-white"
          style={{ background: "var(--primary)" }}
        >
          סגור
        </button>
      </div>
    );
  }

  return null;
}
