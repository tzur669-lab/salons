"use client";
import { useState } from "react";
import type { GuestInfo } from "@/types";

interface Props {
  onSubmit: (info: GuestInfo) => void;
  loading?: boolean;
}

export function GuestForm({ onSubmit, loading }: Props) {
  const [name, setName] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("guestName") ?? "";
  });
  const [phone, setPhone] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("guestPhone") ?? "";
  });
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanPhone = phone.replace(/\D/g, "");
    if (!name.trim()) { setError("יש להזין שם"); return; }
    if (cleanPhone.length < 9) { setError("מספר טלפון לא תקין"); return; }
    localStorage.setItem("guestName", name.trim());
    localStorage.setItem("guestPhone", cleanPhone);
    onSubmit({ name: name.trim(), phone: cleanPhone });
  }

  const field: React.CSSProperties = {
    width: "100%",
    padding: "15px 16px",
    borderRadius: 16,
    border: "1px solid var(--border-color)",
    background: "var(--surface)",
    fontSize: 16,
    color: "var(--foreground)",
    outline: "none",
  };

  return (
    <div
      className="p-6"
      style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--border-color)", background: "var(--surface)", boxShadow: "var(--card-shadow)" }}
    >
      <h3 className="text-lg font-bold mb-1" style={{ color: "var(--foreground)" }}>
        הפרטים שלך
      </h3>
      <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
        לא צריך חשבון — רק שם וטלפון
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          placeholder="שם"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={field}
        />
        <input
          type="tel"
          placeholder="טלפון"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          dir="ltr"
          style={field}
        />
        {error && <p className="text-sm" style={{ color: "#D2628A" }}>{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 font-bold text-white disabled:opacity-60"
          style={{ background: "var(--rose)", borderRadius: "var(--pill)" }}
        >
          {loading ? "שולח..." : "שליחה לרני"}
        </button>
      </form>
    </div>
  );
}
