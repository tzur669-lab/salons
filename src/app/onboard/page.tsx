"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
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
  const { user, loading: authLoading } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [inviteCode, setInviteCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [openTime, setOpenTime] = useState("09:00");
  const [closeTime, setCloseTime] = useState("19:00");
  const [openDays, setOpenDays] = useState<number[]>(DEFAULT_OPEN_DAYS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function toggleDay(idx: number) {
    setOpenDays((prev) =>
      prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx]
    );
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
          phone: phone.trim(),
          address: address.trim(),
          openTime,
          closeTime,
          openDays,
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
          <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
            שלב {step} מתוך 2
          </p>
        </div>

        {!user ? (
          <div className="text-center py-4">
            <p className="text-3xl mb-3">🔒</p>
            <p className="font-semibold mb-2" style={{ color: "var(--foreground)" }}>נדרשת כניסה לחשבון</p>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              התחבר/י תחילה דרך קישור הסלון שלך, ואז חזור/י לעמוד זה להרשמה.
            </p>
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
