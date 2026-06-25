"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateEmail,
  updatePassword,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  EmailAuthProvider,
} from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useAuth, reauthenticateWithGoogle } from "@/hooks/useAuth";
import { useSalon } from "@/contexts/SalonProvider";
import { AppShell } from "@/components/shared/AppShell";
import { SetPasswordForOAuth } from "@/components/shared/SetPasswordForOAuth";
import { contactManagerForRecovery } from "@/lib/contact-manager";

function DeleteAccountSection({ salonId }: { salonId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setLoading(true);
    setError("");
    try {
      const user = auth.currentUser;
      if (!user) return;

      const idToken = await user.getIdToken();
      const res = await fetch("/api/delete-account", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (!res.ok) throw new Error("Deletion failed");

      await auth.signOut();
      window.location.href = `/${salonId}`;
    } catch {
      setError("שגיאה במחיקת החשבון. נסי שוב או פני לתמיכה.");
    } finally {
      setLoading(false);
    }
  }

  if (!confirming) {
    return (
      <div className="mt-8 text-center">
        <button
          onClick={() => setConfirming(true)}
          className="text-sm underline"
          style={{ color: "#c2596b", background: "none", border: "none", cursor: "pointer" }}
        >
          מחיקת חשבון
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8 p-5 rounded-3xl" style={{ border: "1px solid #f8e9ec", background: "#fff5f7" }}>
      <p className="text-sm font-bold mb-1" style={{ color: "var(--foreground)" }}>
        האם את בטוחה?
      </p>
      <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>
        פעולה זו תמחק לצמיתות את החשבון ואת כל הנתונים שלך. לא ניתן לבטל.
      </p>
      {error && <p className="text-xs mb-3 text-center" style={{ color: "#e53e3e" }}>{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleDelete}
          disabled={loading}
          className="flex-1 py-2.5 rounded-2xl text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: "#c2596b", border: "none", cursor: "pointer" }}
        >
          {loading ? "מוחקת..." : "כן, מחקי את החשבון"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="flex-1 py-2.5 rounded-2xl text-sm font-semibold"
          style={{ border: "1px solid var(--border-color)", background: "var(--surface)", cursor: "pointer" }}
        >
          ביטול
        </button>
      </div>
    </div>
  );
}

function getErrorMsg(code: string | undefined): string {
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "הסיסמה הנוכחית שגויה";
    case "auth/email-already-in-use":
      return "כתובת המייל כבר בשימוש";
    case "auth/invalid-email":
      return "כתובת מייל לא תקינה";
    case "auth/weak-password":
      return "הסיסמה חלשה מדי — מינימום 6 תווים";
    case "auth/requires-recent-login":
      return "נדרשת התחברות מחדש — התנתק והתחבר שוב";
    case "auth/popup-closed-by-user":
      return "החלון נסגר לפני האימות — נסה שוב";
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

export default function ProfilePage() {
  const { user, appUser, loading } = useAuth();
  const { salonId } = useSalon();
  const router = useRouter();

  const [tab, setTab] = useState<"email" | "password">("email");

  // Random name attribute generated once per mount — defeats browser autofill heuristics
  const [emailInputName] = useState(() => `email-${Math.random().toString(36).slice(2)}`);

  // Email form
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [showEmailPwd, setShowEmailPwd] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState(false);

  // Confirmation modal (snapshots captured at open-time, not read from mutable inputs)
  const [showEmailConfirm, setShowEmailConfirm] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingPassword, setPendingPassword] = useState("");

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // "Forgot current password?" recovery escape hatch (password users)
  const [forgotCurrent, setForgotCurrent] = useState(false);
  const [resetEmailLoading, setResetEmailLoading] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push(`/${salonId}/login`);
  }, [user, loading, router]);

  if (loading || !user || !appUser) return null;

  const isPasswordUser = user.providerData.some((p) => p.providerId === "password");
  const displayEmail = appUser.email || (user.email && !user.email.includes("@placeholder.com") ? user.email : "");

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

  // Step 1: validate + snapshot → open confirm modal
  function handleOpenEmailConfirm(e: React.FormEvent) {
    e.preventDefault();
    setEmailError("");
    if (!newEmail.trim()) return;
    if (isPasswordUser && !emailPassword) {
      setEmailError("נדרשת סיסמה נוכחית לאישור");
      return;
    }
    // Snapshot values at open-time so they can't mutate while modal is visible
    setPendingEmail(newEmail.trim());
    setPendingPassword(emailPassword);
    setShowEmailConfirm(true);
  }

  // Step 2: user confirmed in modal → actually update
  async function confirmEmailUpdate() {
    setEmailLoading(true);
    setEmailError("");
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    try {
      if (isPasswordUser) {
        const credential = EmailAuthProvider.credential(currentUser.email!, pendingPassword);
        await reauthenticateWithCredential(currentUser, credential);
      } else {
        // OAuth user (Google etc.) — native-safe Google reauthentication, no password
        await reauthenticateWithGoogle(currentUser);
      }
      await updateEmail(currentUser, pendingEmail);
      await updateDoc(doc(db, "users", currentUser.uid), { email: pendingEmail });
      setShowEmailConfirm(false);
      setEmailSuccess(true);
      setNewEmail("");
      setEmailPassword("");
    } catch (err: unknown) {
      setShowEmailConfirm(false);
      setEmailError(getErrorMsg((err as { code?: string })?.code));
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);
    if (newPassword !== confirmPassword) {
      setPasswordError("הסיסמאות אינן תואמות");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("הסיסמה חייבת להכיל לפחות 6 תווים");
      return;
    }
    setPasswordLoading(true);
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    try {
      const credential = EmailAuthProvider.credential(currentUser.email!, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      setPasswordError(getErrorMsg((err as { code?: string })?.code));
    } finally {
      setPasswordLoading(false);
    }
  }

  // Forgot-current-password: send a Firebase reset link to the account's real email.
  async function handleSendResetEmail() {
    const email = user?.email;
    if (!email || email.includes("@placeholder.com")) return;
    setResetEmailLoading(true);
    try {
      await sendPasswordResetEmail(auth, email, {
        url: window.location.origin + `/${salonId}/reset-password`,
        handleCodeInApp: true,
      });
    } catch {
      // Enumeration-safe: surface the same neutral message regardless.
    } finally {
      setResetEmailSent(true);
      setResetEmailLoading(false);
    }
  }

  const hasRealEmail = !!user.email && !user.email.includes("@placeholder.com");

  return (
    <AppShell>
    <div className="pt-8">
      <div className="max-w-md mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold" style={{ color: "var(--foreground)" }}>
            פרטי חשבון
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
            שלום, {appUser.name}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(["email", "password"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-5 py-2 rounded-full text-sm font-semibold transition-all"
              style={
                tab === t
                  ? { background: "var(--rose)", color: "white" }
                  : { background: "var(--rose-soft)", color: "var(--foreground)" }
              }
            >
              {t === "email" ? "אימייל" : "סיסמה"}
            </button>
          ))}
        </div>

        <div className="p-6 rounded-3xl" style={{ background: "var(--surface)", boxShadow: "var(--shadow)" }}>
          {tab === "email" ? (
            <form onSubmit={handleOpenEmailConfirm} className="flex flex-col gap-4">
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: "var(--muted-foreground)" }}>
                  אימייל נוכחי
                </p>
                <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                  {displayEmail || "לא הוגדר אימייל"}
                </p>
              </div>

              {/* Fix: randomized name + autoComplete="new-password" defeats browser autofill */}
              <input
                type="email"
                name={emailInputName}
                autoComplete="new-password"
                placeholder="כתובת אימייל חדשה"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                disabled={showEmailConfirm}
                dir="ltr"
                style={fieldStyle}
              />

              {isPasswordUser && (
                <div style={{ position: "relative" }}>
                  <input
                    type={showEmailPwd ? "text" : "password"}
                    placeholder="סיסמה נוכחית לאישור"
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                    required
                    disabled={showEmailConfirm}
                    dir="ltr"
                    style={{ ...fieldStyle, paddingLeft: 48 }}
                  />
                  <button type="button" onClick={() => setShowEmailPwd((v) => !v)} style={eyeBtnStyle} tabIndex={-1} disabled={showEmailConfirm}>
                    <EyeIcon open={showEmailPwd} />
                  </button>
                </div>
              )}

              {emailError && (
                <p className="text-sm text-center" style={{ color: "#e53e3e" }}>{emailError}</p>
              )}
              {emailSuccess && (
                <p className="text-sm text-center" style={{ color: "#38a169" }}>האימייל עודכן בהצלחה ✓</p>
              )}

              <button
                type="submit"
                disabled={emailLoading || showEmailConfirm}
                className="w-full py-3 rounded-2xl font-semibold text-white disabled:opacity-60"
                style={{ background: "var(--primary)" }}
              >
                {emailLoading ? "מעדכן..." : "עדכן אימייל"}
              </button>
            </form>
          ) : !isPasswordUser ? (
            <SetPasswordForOAuth
              userPhone={appUser.phone || undefined}
              onSuccess={() => window.location.reload()}
            />
          ) : forgotCurrent ? (
            <div className="flex flex-col gap-4">
              <SetPasswordForOAuth
                variant="reset"
                userPhone={appUser.phone || undefined}
                onSuccess={() => window.location.reload()}
              />

              {hasRealEmail && (
                <div className="pt-4" style={{ borderTop: "1px solid var(--border-color)" }}>
                  <p className="text-xs text-center mb-2" style={{ color: "var(--muted-foreground)" }}>
                    או קבל קישור איפוס למייל
                  </p>
                  {resetEmailSent ? (
                    <div className="text-center">
                      <p className="text-sm" style={{ color: "#38a169" }}>
                        אם המייל רשום — נשלח אליו קישור לאיפוס. לאחר האיפוס התחבר עם הסיסמה החדשה.
                      </p>
                      <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                        לא קיבלת? בדוק בתיקיית ספאם — המייל נשלח דרך מערכת Google והוא בטוח לחלוטין.
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSendResetEmail}
                      disabled={resetEmailLoading}
                      className="w-full py-3 rounded-2xl font-semibold disabled:opacity-60"
                      style={{ background: "var(--rose-soft)", color: "var(--foreground)", border: "none", cursor: "pointer" }}
                    >
                      {resetEmailLoading ? "שולח..." : "שלח קישור איפוס למייל"}
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() =>
                  contactManagerForRecovery({ name: appUser.name, phone: appUser.phone || undefined }, salonId).catch(() => {})
                }
                className="text-xs text-center"
                style={{ color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
              >
                לא מצליח לשחזר? פנה למנהלת
              </button>

              <button
                type="button"
                onClick={() => { setForgotCurrent(false); setResetEmailSent(false); }}
                className="text-sm text-center"
                style={{ color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer" }}
              >
                חזור לשינוי סיסמה רגיל
              </button>
            </div>
          ) : (
            <form onSubmit={handleUpdatePassword} className="flex flex-col gap-4">
              <div style={{ position: "relative" }}>
                <input
                  type={showCurrentPwd ? "text" : "password"}
                  placeholder="סיסמה נוכחית"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  dir="ltr"
                  style={{ ...fieldStyle, paddingLeft: 48 }}
                />
                <button type="button" onClick={() => setShowCurrentPwd((v) => !v)} style={eyeBtnStyle} tabIndex={-1}>
                  <EyeIcon open={showCurrentPwd} />
                </button>
              </div>

              <div style={{ position: "relative" }}>
                <input
                  type={showNewPwd ? "text" : "password"}
                  placeholder="סיסמה חדשה"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  dir="ltr"
                  style={{ ...fieldStyle, paddingLeft: 48 }}
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
                style={fieldStyle}
              />

              {passwordError && (
                <p className="text-sm text-center" style={{ color: "#e53e3e" }}>{passwordError}</p>
              )}
              {passwordSuccess && (
                <p className="text-sm text-center" style={{ color: "#38a169" }}>הסיסמה עודכנה בהצלחה ✓</p>
              )}

              <button
                type="submit"
                disabled={passwordLoading}
                className="w-full py-3 rounded-2xl font-semibold text-white disabled:opacity-60"
                style={{ background: "var(--primary)" }}
              >
                {passwordLoading ? "מעדכן..." : "עדכן סיסמה"}
              </button>

              <button
                type="button"
                onClick={() => setForgotCurrent(true)}
                className="text-sm text-center"
                style={{ color: "var(--rose)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                שכחתי את הסיסמה הנוכחית?
              </button>
            </form>
          )}
        </div>

        <DeleteAccountSection salonId={salonId} />
      </div>

      {/* Email confirmation modal */}
      {showEmailConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="w-full max-w-sm p-7 rounded-3xl shadow-xl" style={{ background: "var(--surface)" }}>
            <p className="text-lg font-bold text-center mb-2" style={{ color: "var(--foreground)" }}>
              האם זו כתובת המייל הנכונה?
            </p>
            <p
              className="text-center text-sm font-semibold py-3 px-4 rounded-2xl my-4 break-all"
              dir="ltr"
              style={{ background: "var(--accent)", color: "var(--foreground)" }}
            >
              {pendingEmail}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEmailConfirm(false)}
                className="flex-1 py-3 rounded-2xl font-semibold"
                style={{ border: "1px solid var(--border-color)", color: "var(--muted-foreground)" }}
              >
                ביטול
              </button>
              <button
                onClick={confirmEmailUpdate}
                disabled={emailLoading}
                className="flex-1 py-3 rounded-2xl font-semibold text-white disabled:opacity-60"
                style={{ background: "var(--primary)" }}
              >
                {emailLoading ? "מעדכן..." : "כן, עדכן"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </AppShell>
  );
}
