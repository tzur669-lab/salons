"use client";
import { useState } from "react";
import { updateUserPhone } from "@/lib/firestore/users";

interface Props {
  uid: string;
  onDone: () => void;
}

export function PhoneInput({ uid, onDone }: Props) {
  const [step, setStep] = useState<"phone" | "confirm">("phone");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length < 9) {
      setError("מספר טלפון לא תקין");
      return;
    }
    setStep("confirm");
  }

  async function handleConfirm() {
    setError("");
    setLoading(true);
    try {
      const cleaned = phone.replace(/\D/g, "");
      await updateUserPhone(uid, cleaned, true); // saves phone + phoneVerified: true
      onDone();
    } catch (err) {
      console.error("[PhoneInput] save error:", err);
      setError("אירעה שגיאה בשמירה. נסי שוב.");
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.4)" }}
    >
      <div
        className="w-full max-w-sm p-8 rounded-3xl shadow-xl"
        style={{ background: "var(--surface)" }}
      >
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>
            {step === "phone" ? "מספר טלפון" : "אישור מספר"}
          </h2>
          <p className="text-sm mt-2" style={{ color: "var(--muted-foreground)" }}>
            {step === "phone"
              ? "נדרש פעם אחת בלבד לאישור תורים"
              : "האם זה מספר הטלפון שלך?"}
          </p>
        </div>

        {step === "phone" ? (
          <form onSubmit={handleContinue} className="flex flex-col gap-4">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="050-0000000"
              dir="ltr"
              autoFocus
              className="w-full px-4 py-3 rounded-2xl border text-center text-lg"
              style={{
                borderColor: error ? "#e53e3e" : "var(--border-color)",
                background: "var(--accent)",
              }}
            />
            {error && (
              <p className="text-sm text-center" style={{ color: "#e53e3e" }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              className="w-full py-3 rounded-2xl font-semibold text-white transition-opacity"
              style={{ background: "var(--primary)" }}
            >
              המשך
            </button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <p
              className="text-center text-xl font-bold py-4 px-4 rounded-2xl"
              dir="ltr"
              style={{ background: "var(--accent)", color: "var(--foreground)" }}
            >
              {phone}
            </p>
            {error && (
              <p className="text-sm text-center" style={{ color: "#e53e3e" }}>
                {error}
              </p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setStep("phone"); setError(""); }}
                disabled={loading}
                className="flex-1 py-3 rounded-2xl font-semibold disabled:opacity-60"
                style={{ border: "1px solid var(--border-color)", color: "var(--muted-foreground)" }}
              >
                עריכה
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 py-3 rounded-2xl font-semibold text-white transition-opacity disabled:opacity-60"
                style={{ background: "var(--primary)" }}
              >
                {loading ? "שומר..." : "אישור"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
