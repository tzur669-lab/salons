"use client";
import { useEffect, useRef, useState } from "react";
import {
  sendPasswordResetEmail,
  signInWithPhoneNumber,
  signInWithCustomToken,
  signOut,
  RecaptchaVerifier,
  ConfirmationResult,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { buildFullPhone, isValidLocalPhone } from "@/lib/phone";
import { contactManagerForRecovery } from "@/lib/contact-manager";

import { useSalon } from "@/contexts/SalonProvider";

interface Props {
  onClose: () => void;
}

type Step =
  | "choose"
  | "method-a"
  | "method-b-phone"
  | "method-b-otp"
  | "method-b-newpwd"
  | "method-b-pick";

const RECAPTCHA_ID = "forgot-recaptcha-widget";

/** Firebase phone-auth client error codes → Hebrew. */
function getHebrewError(code: string | undefined): string {
  switch (code) {
    case "auth/invalid-phone-number": return "מספר טלפון לא תקין";
    case "auth/too-many-requests": return "יותר מדי ניסיונות — נסה מאוחר יותר";
    case "auth/quota-exceeded": return "חריגה ממכסת SMS";
    case "auth/invalid-verification-code": return "קוד שגוי — נסה שוב";
    case "auth/code-expired": return "הקוד פג תוקף — שלח קוד חדש";
    case "auth/captcha-check-failed": return "אימות CAPTCHA נכשל — רענן ונסה שוב";
    default: return `שגיאה: ${code ?? "unknown"}`;
  }
}

/** Server (/api/reset-password-by-phone) error codes → Hebrew. */
function apiErrorToHebrew(code: string | undefined): string {
  switch (code) {
    case "phone_not_found": return "מספר הטלפון לא נמצא במערכת";
    case "rate_limited": return "יותר מדי ניסיונות — נסה שוב בעוד 15 דקות";
    case "stale_auth": return "פג תוקף האימות — התחל את התהליך מחדש";
    case "weak_password": return "הסיסמה חלשה מדי — מינימום 6 תווים";
    case "no_phone": return "לא ניתן לאמת את מספר הטלפון — נסה שוב";
    case "invalid_token": return "האימות נכשל — נסה שוב";
    case "admin_blocked": return "לחשבון זה ניתן לאפס סיסמה דרך המייל בלבד";
    default: return "שגיאה בשרת — נסה שוב מאוחר יותר";
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

export function ForgotPassword({ onClose }: Props) {
  const { salonId } = useSalon();
  const [step, setStep] = useState<Step>("choose");

  // Method A (email)
  const [resetEmail, setResetEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState("");

  // Method B (SMS)
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [smsLoading, setSmsLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [smsError, setSmsError] = useState("");
  const [otpError, setOtpError] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  // Multiple accounts share the proven phone → user picks which to reset.
  const [accounts, setAccounts] = useState<{ index: number; name: string }[]>([]);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  // Create/destroy RecaptchaVerifier when entering/leaving the SMS phone step
  useEffect(() => {
    if (step !== "method-b-phone") return;
    const verifier = new RecaptchaVerifier(auth, RECAPTCHA_ID, { size: "normal" });
    recaptchaRef.current = verifier;
    verifier.render().catch((err) => console.error("[ForgotPassword] reCAPTCHA render error:", err));
    return () => {
      verifier.clear();
      recaptchaRef.current = null;
    };
  }, [step]);

  // ── Method A ──────────────────────────────────────────────────────────────

  async function handleSendResetEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailError("");
    setEmailLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail, {
        url: window.location.origin + "/reset-password",
        handleCodeInApp: true,
      });
      setEmailSent(true);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      // Enumeration-safe: with email-enumeration protection ON, Firebase doesn't even
      // throw user-not-found; if it's OFF, we still don't leak it — show neutral success.
      if (code === "auth/user-not-found") {
        setEmailSent(true);
      } else if (code === "auth/invalid-email") {
        setEmailError("כתובת מייל לא תקינה");
      } else {
        setEmailError(`שגיאה: ${code ?? "unknown"}`);
      }
    } finally {
      setEmailLoading(false);
    }
  }

  // ── Method B — Phone step ─────────────────────────────────────────────────

  async function handleSendSMS(e: React.FormEvent) {
    e.preventDefault();
    setSmsError("");
    if (!isValidLocalPhone(phone)) {
      setSmsError("מספר טלפון לא תקין");
      return;
    }
    setSmsLoading(true);
    try {
      // No client-side Firestore lookup (it was rules-denied for logged-out users).
      // The server resolves the real account from the OTP-proven phone after confirm.
      const result = await signInWithPhoneNumber(auth, buildFullPhone(phone), recaptchaRef.current!);
      setConfirmation(result);
      setStep("method-b-otp");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      setSmsError(getHebrewError(code));
      // Recreate verifier so user can retry (the reCAPTCHA token is single-use)
      recaptchaRef.current?.clear();
      const newVerifier = new RecaptchaVerifier(auth, RECAPTCHA_ID, { size: "normal" });
      recaptchaRef.current = newVerifier;
      newVerifier.render().catch(console.error);
    } finally {
      setSmsLoading(false);
    }
  }

  // ── Method B — OTP step ───────────────────────────────────────────────────

  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault();
    setOtpError("");
    if (otp.length < 6) {
      setOtpError("הקוד חייב להיות 6 ספרות");
      return;
    }
    setOtpLoading(true);
    try {
      await confirmation!.confirm(otp);
      setStep("method-b-newpwd");
    } catch (err: unknown) {
      setOtpError(getHebrewError((err as { code?: string })?.code));
    } finally {
      setOtpLoading(false);
    }
  }

  // ── Method B — New password (server resolves + resets the REAL account) ─────

  /** POST the new password with the OTP-proven ID token; handle success/ambiguous/error. */
  async function submitReset(disambiguateIndex?: number) {
    setPwdError("");
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setPwdError("פג תוקף האימות — התחל את התהליך מחדש");
      return;
    }
    try {
      const idToken = await currentUser.getIdToken();
      const res = await fetch("/api/reset-password-by-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ newPassword, disambiguateIndex }),
      });
      const data = await res.json().catch(() => ({}));

      if (data.type === "success") {
        // Custom token for the REAL account — sign into it (replaces the ghost session).
        await signInWithCustomToken(auth, data.token);
        setPwdSuccess(true);
        return;
      }
      if (data.type === "ambiguous") {
        setAccounts(data.accounts ?? []);
        setStep("method-b-pick");
        return;
      }
      // Error: if the phone wasn't registered, the server deleted the throwaway
      // session — sign out locally so we don't leave a dead ghost logged in.
      if (data.error === "phone_not_found") {
        await signOut(auth).catch(() => {});
      }
      setPwdError(apiErrorToHebrew(data.error));
    } catch {
      setPwdError("שגיאה בשרת — נסה שוב מאוחר יותר");
    }
  }

  async function handleSetNewPassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError("");
    if (newPassword !== confirmPassword) {
      setPwdError("הסיסמאות אינן תואמות");
      return;
    }
    if (newPassword.length < 6) {
      setPwdError("הסיסמה חייבת להכיל לפחות 6 תווים");
      return;
    }
    setPwdLoading(true);
    await submitReset();
    setPwdLoading(false);
  }

  async function handlePickAccount(index: number) {
    setPwdLoading(true);
    await submitReset(index);
    setPwdLoading(false);
  }

  // Total-lockout escape hatch → WhatsApp to the manager with the attempted phone.
  async function handleContactManager() {
    await contactManagerForRecovery({ phone: phone || undefined }, salonId).catch(() => {});
  }

  // ── Shared styles ─────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "14px 16px", borderRadius: 16,
    border: "1px solid var(--border-color)", background: "var(--accent)",
    fontSize: 16, color: "var(--foreground)", outline: "none",
  };

  const btnPrimary: React.CSSProperties = {
    width: "100%", padding: "12px", borderRadius: 18,
    background: "var(--primary)", color: "white",
    fontWeight: 600, fontSize: 15, border: "none", cursor: "pointer",
  };

  const eyeBtnStyle: React.CSSProperties = {
    position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
    background: "none", border: "none", cursor: "pointer",
    color: "var(--muted-foreground)", padding: 4, display: "flex", alignItems: "center",
  };

  // ── Render ────────────────────────────────────────────────────────────────

  function renderContent() {
    // ── Step: choose ──
    if (step === "choose") {
      return (
        <div className="flex flex-col gap-3">
          <button onClick={() => setStep("method-a")} className="w-full py-3 rounded-2xl font-semibold" style={{ background: "var(--rose-soft)", color: "var(--foreground)", border: "none", cursor: "pointer" }}>
            אפס עם מייל
          </button>
          <button onClick={() => setStep("method-b-phone")} className="w-full py-3 rounded-2xl font-semibold" style={{ background: "var(--rose-soft)", color: "var(--foreground)", border: "none", cursor: "pointer" }}>
            אפס עם SMS
          </button>
        </div>
      );
    }

    // ── Step: method-a (email reset) ──
    if (step === "method-a") {
      if (emailSent) {
        return (
          <div className="text-center py-2">
            <p className="text-3xl mb-3">📧</p>
            <p className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>הבקשה התקבלה</p>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              אם כתובת המייל רשומה במערכת — נשלח אליה קישור לאיפוס סיסמה.
            </p>
            <p className="text-xs mt-3" style={{ color: "var(--muted-foreground)" }}>
              אם לא קיבלת — בדוק בתיקיית ספאם. המייל נשלח דרך מערכת Google והוא בטוח לחלוטין.
            </p>
          </div>
        );
      }
      return (
        <form onSubmit={handleSendResetEmail} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="כתובת אימייל רשומה"
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
            required
            dir="ltr"
            style={inputStyle}
          />
          {emailError && <p className="text-sm text-center" style={{ color: "#e53e3e" }}>{emailError}</p>}
          <button type="submit" disabled={emailLoading} style={{ ...btnPrimary, opacity: emailLoading ? 0.6 : 1 }}>
            {emailLoading ? "שולח..." : "שלח קישור לאיפוס סיסמה"}
          </button>
          <button type="button" onClick={() => setStep("choose")} className="text-sm text-center" style={{ color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer" }}>
            חזור
          </button>
        </form>
      );
    }

    // ── Step: method-b-phone ──
    if (step === "method-b-phone") {
      return (
        <form onSubmit={handleSendSMS} className="flex flex-col gap-4">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="050-0000000"
            dir="ltr"
            className="w-full px-4 py-3 rounded-2xl border text-center text-lg"
            style={{ borderColor: smsError ? "#e53e3e" : "var(--border-color)", background: "var(--accent)" }}
          />
          <p className="text-xs text-center px-2" style={{ color: "var(--muted-foreground)" }}>
            אם ה-SMS לא הגיע — בדוק בתיקיית ספאם.
            ההודעות נשלחות דרך מערכת Firebase של Google וזה בטוח לחלוטין.
          </p>
          <div className="flex justify-center">
            <div id={RECAPTCHA_ID} />
          </div>
          {smsError && <p className="text-sm text-center" style={{ color: "#e53e3e" }}>{smsError}</p>}
          <button type="submit" disabled={smsLoading} style={{ ...btnPrimary, opacity: smsLoading ? 0.6 : 1 }}>
            {smsLoading ? "שולח קוד..." : "שלח קוד אימות"}
          </button>
          <button type="button" onClick={() => setStep("choose")} className="text-sm text-center" style={{ color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer" }}>
            חזור
          </button>
        </form>
      );
    }

    // ── Step: method-b-otp ──
    if (step === "method-b-otp") {
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
            style={{ borderColor: otpError ? "#e53e3e" : "var(--border-color)", background: "var(--accent)" }}
          />
          <p className="text-xs text-center px-2" style={{ color: "var(--muted-foreground)" }}>
            לא קיבלת קוד? ייתכן שההודעה סוננה לתיקיית הספאם באפליקציית ההודעות.
            ההודעה נשלחת דרך מערכת האימות של Google והיא בטוחה לחלוטין.
          </p>
          {otpError && <p className="text-sm text-center" style={{ color: "#e53e3e" }}>{otpError}</p>}
          <button type="submit" disabled={otpLoading} style={{ ...btnPrimary, opacity: otpLoading ? 0.6 : 1 }}>
            {otpLoading ? "מאמת..." : "אמת קוד"}
          </button>
          <button type="button" onClick={() => { setStep("method-b-phone"); setOtp(""); setOtpError(""); }} className="text-sm text-center" style={{ color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer" }}>
            שלח קוד מחדש
          </button>
        </form>
      );
    }

    // ── Step: method-b-pick (multiple accounts share the phone) ──
    if (step === "method-b-pick") {
      return (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-center" style={{ color: "var(--muted-foreground)" }}>
            נמצאו כמה חשבונות עם מספר זה. בחר את החשבון שלך:
          </p>
          {accounts.map((acc) => (
            <button
              key={acc.index}
              onClick={() => handlePickAccount(acc.index)}
              disabled={pwdLoading}
              className="w-full py-3 rounded-2xl font-semibold disabled:opacity-60"
              style={{ background: "var(--rose-soft)", color: "var(--foreground)", border: "none", cursor: "pointer" }}
            >
              {acc.name || "חשבון ללא שם"}
            </button>
          ))}
          {pwdError && <p className="text-sm text-center" style={{ color: "#e53e3e" }}>{pwdError}</p>}
        </div>
      );
    }

    // ── Step: method-b-newpwd ──
    if (step === "method-b-newpwd") {
      if (pwdSuccess) {
        return (
          <div className="text-center py-2">
            <p className="text-3xl mb-3">✅</p>
            <p className="font-semibold mb-1" style={{ color: "var(--foreground)" }}>הסיסמה עודכנה בהצלחה!</p>
            <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>אתה מחובר כעת לחשבון שלך</p>
            <button onClick={onClose} style={{ ...btnPrimary, width: "auto", paddingInline: 32 }}>
              סגור
            </button>
          </div>
        );
      }
      return (
        <form onSubmit={handleSetNewPassword} className="flex flex-col gap-4">
          <div style={{ position: "relative" }}>
            <input
              type={showNewPwd ? "text" : "password"}
              placeholder="סיסמה חדשה"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              dir="ltr"
              style={{ ...inputStyle, paddingLeft: 48 }}
            />
            <button type="button" onClick={() => setShowNewPwd((v) => !v)} style={eyeBtnStyle} tabIndex={-1}>
              <EyeIcon open={showNewPwd} />
            </button>
          </div>
          <input
            type="password"
            placeholder="אישור סיסמה חדשה"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            dir="ltr"
            style={inputStyle}
          />
          {pwdError && <p className="text-sm text-center" style={{ color: "#e53e3e" }}>{pwdError}</p>}
          <button type="submit" disabled={pwdLoading} style={{ ...btnPrimary, opacity: pwdLoading ? 0.6 : 1 }}>
            {pwdLoading ? "שומר..." : "שמור סיסמה חדשה"}
          </button>
        </form>
      );
    }

    return null;
  }

  function getStepTitle() {
    switch (step) {
      case "choose": return "שכחתי סיסמה";
      case "method-a": return emailSent ? "הבקשה התקבלה" : "איפוס עם מייל";
      case "method-b-phone": return "אימות בSMS";
      case "method-b-otp": return "קוד אימות";
      case "method-b-pick": return "בחר חשבון";
      case "method-b-newpwd": return pwdSuccess ? "הצלחה!" : "סיסמה חדשה";
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div className="w-full max-w-sm p-8 rounded-3xl shadow-xl" style={{ background: "var(--surface)" }} dir="rtl">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🔑</div>
          <h2 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>{getStepTitle()}</h2>
          {step === "choose" && (
            <p className="text-sm mt-2" style={{ color: "var(--muted-foreground)" }}>
              בחר שיטת אימות לאיפוס הסיסמה
            </p>
          )}
        </div>

        {renderContent()}

        {/* Total-lockout fallback — contact the manager (hidden on the success screens) */}
        {!pwdSuccess && !emailSent && (
          <button
            onClick={handleContactManager}
            className="w-full mt-4 text-xs text-center"
            style={{ color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
          >
            לא מצליח לשחזר? פנה למנהלת
          </button>
        )}

        {step === "choose" && (
          <button
            onClick={onClose}
            className="w-full mt-3 text-sm text-center font-semibold"
            style={{ color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer" }}
          >
            ← חזרה להתחברות
          </button>
        )}
      </div>
    </div>
  );
}
