"use client";
import { useEffect, useState } from "react";
import { Timestamp } from "firebase/firestore";
import { useSalon } from "@/contexts/SalonProvider";
import {
  getAvailabilityRules, addAvailabilityRule, updateAvailabilityRule, deleteAvailabilityRule,
  getBlockedTimes, addBlockedTime, deleteBlockedTime,
} from "@/lib/firestore/settings";
import type { AvailabilityRule, BlockedTime } from "@/types";

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "13px 15px", borderRadius: 14,
  border: "1px solid var(--border-color)", background: "var(--accent)",
  fontSize: 15, color: "var(--foreground)", outline: "none",
};

export default function AdminAvailabilityPage() {
  const { salonId } = useSalon();
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [blocked, setBlocked] = useState<BlockedTime[]>([]);
  const [tab, setTab] = useState<"rules" | "blocked">("rules");

  // New rule form
  const [newRule, setNewRule] = useState({
    type: "recurring" as "recurring" | "one_time",
    dayOfWeek: 0,
    date: "",
    openTime: "09:00",
    closeTime: "19:00",
    isOpen: true,
    addAllDays: false,
  });
  // New block form
  const [newBlock, setNewBlock] = useState({
    date: "", startTime: "00:00", endTime: "23:59", isAllDay: true, reason: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    getAvailabilityRules(salonId).then(async (loaded) => {
      const expired = loaded.filter(
        (r) => r.type === "one_time" && r.date && r.date.toDate() < todayMidnight
      );
      await Promise.all(expired.map((r) => deleteAvailabilityRule(salonId, r.id)));
      setRules(loaded.filter((r) => !expired.some((e) => e.id === r.id)));
    });
    getBlockedTimes(salonId).then(setBlocked);
  }, []);

  async function addRule() {
    setSaving(true);
    // "Add all days" — create one recurring rule for each day of the week (0–6)
    if (newRule.type === "recurring" && newRule.addAllDays) {
      const newEntries: AvailabilityRule[] = [];
      for (let day = 0; day <= 6; day++) {
        const data: Omit<AvailabilityRule, "id"> = {
          type: "recurring",
          dayOfWeek: day,
          openTime: newRule.openTime,
          closeTime: newRule.closeTime,
          isOpen: newRule.isOpen,
        };
        const id = await addAvailabilityRule(salonId, data);
        newEntries.push({ id, ...data });
      }
      setRules((prev) => [...prev, ...newEntries]);
      setSaving(false);
      return;
    }
    // Regular single-rule add
    const data: Omit<AvailabilityRule, "id"> = {
      type: newRule.type,
      openTime: newRule.openTime,
      closeTime: newRule.closeTime,
      isOpen: newRule.isOpen,
      ...(newRule.type === "recurring" ? { dayOfWeek: newRule.dayOfWeek } : {}),
      ...(newRule.type === "one_time" && newRule.date
        ? { date: Timestamp.fromDate(new Date(newRule.date)) }
        : {}),
    };
    const id = await addAvailabilityRule(salonId, data);
    setRules((prev) => [...prev, { id, ...data }]);
    setSaving(false);
  }

  async function removeRule(id: string) {
    await deleteAvailabilityRule(salonId, id);
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  async function addBlock() {
    if (!newBlock.date) return;
    setSaving(true);
    const data: Omit<BlockedTime, "id"> = {
      date: Timestamp.fromDate(new Date(newBlock.date)),
      startTime: newBlock.startTime,
      endTime: newBlock.endTime,
      isAllDay: newBlock.isAllDay,
      reason: newBlock.reason,
    };
    const id = await addBlockedTime(salonId, data);
    setBlocked((prev) => [...prev, { id, ...data }]);
    setSaving(false);
  }

  async function removeBlock(id: string) {
    await deleteBlockedTime(salonId, id);
    setBlocked((prev) => prev.filter((b) => b.id !== id));
  }

  const formCard: React.CSSProperties = { borderRadius: "var(--radius)", border: "2px solid var(--rose)", background: "var(--surface)", boxShadow: "var(--card-shadow)" };
  const listCard: React.CSSProperties = { borderRadius: "var(--radius)", background: "var(--surface)", boxShadow: "var(--card-shadow)" };

  return (
    <div className="pb-20 md:pb-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-extrabold mb-4" style={{ color: "var(--foreground)" }}>זמינות וחסימות</h1>

      <div className="flex gap-2 mb-6">
        {(["rules", "blocked"] as const).map((t) => {
          const active = tab === t;
          return (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-2 text-sm font-bold transition-all"
              style={active
                ? { background: "var(--rose)", color: "white", borderRadius: "var(--pill)" }
                : { background: "var(--surface)", color: "var(--muted-foreground)", borderRadius: "var(--pill)", border: "1px solid var(--border-color)" }}>
              {t === "rules" ? "שעות פעילות" : "חסימות"}
            </button>
          );
        })}
      </div>

      {tab === "rules" && (
        <>
          {/* Add rule */}
          <div className="p-5 mb-4" style={formCard}>
            <h2 className="text-base font-bold mb-3" style={{ color: "var(--foreground)" }}>הוספת כלל זמינות</h2>
            <div className="flex flex-col gap-3">
              <select value={newRule.type} onChange={(e) => setNewRule((p) => ({ ...p, type: e.target.value as "recurring" | "one_time" }))}
                style={inputStyle}>
                <option value="recurring">חוזר שבועי</option>
                <option value="one_time">תאריך ספציפי</option>
              </select>
              {newRule.type === "recurring" ? (
                <>
                  <select
                    value={newRule.dayOfWeek}
                    onChange={(e) => setNewRule((p) => ({ ...p, dayOfWeek: Number(e.target.value) }))}
                    disabled={newRule.addAllDays}
                    className="disabled:opacity-40"
                    style={inputStyle}
                  >
                    {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newRule.addAllDays}
                      onChange={(e) => setNewRule((p) => ({ ...p, addAllDays: e.target.checked }))}
                      style={{ accentColor: "var(--rose)" }}
                    />
                    <span style={{ color: "var(--foreground)" }}>הוספה לכל ימות השבוע</span>
                  </label>
                </>
              ) : (
                <input type="date" value={newRule.date} onChange={(e) => setNewRule((p) => ({ ...p, date: e.target.value }))}
                  style={inputStyle} />
              )}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs mb-1 block" style={{ color: "var(--muted-foreground)" }}>פתיחה</label>
                  <input type="time" value={newRule.openTime} onChange={(e) => setNewRule((p) => ({ ...p, openTime: e.target.value }))}
                    style={inputStyle} />
                </div>
                <div className="flex-1">
                  <label className="text-xs mb-1 block" style={{ color: "var(--muted-foreground)" }}>סגירה</label>
                  <input type="time" value={newRule.closeTime} onChange={(e) => setNewRule((p) => ({ ...p, closeTime: e.target.value }))}
                    style={inputStyle} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={newRule.isOpen} onChange={(e) => setNewRule((p) => ({ ...p, isOpen: e.target.checked }))} style={{ accentColor: "var(--rose)" }} />
                <span style={{ color: "var(--foreground)" }}>פתוח</span>
              </label>
              <button onClick={addRule} disabled={saving}
                className="py-3.5 font-bold text-white disabled:opacity-60"
                style={{ background: "var(--rose)", borderRadius: "var(--pill)" }}>
                {saving ? "שומר..." : "הוספת כלל"}
              </button>
            </div>
          </div>

          {/* Rules list */}
          <div className="flex flex-col gap-2">
            {rules.map((r) => (
              <div key={r.id} className="flex justify-between items-center p-4" style={listCard}>
                <div>
                  <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>
                    {r.type === "recurring" ? DAYS[r.dayOfWeek ?? 0] : r.date?.toDate().toLocaleDateString("he-IL")}
                  </p>
                  <p className="text-xs" style={{ color: "var(--muted-foreground)" }} dir="ltr">
                    {r.isOpen ? `${r.openTime} – ${r.closeTime}` : "סגור"}
                  </p>
                </div>
                <button onClick={() => removeRule(r.id)} className="text-xs px-3 py-1.5 rounded-full font-semibold" style={{ color: "var(--muted-foreground)", border: "1px solid var(--border-color)" }}>מחיקה</button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "blocked" && (
        <>
          {/* Add block */}
          <div className="p-5 mb-4" style={formCard}>
            <h2 className="text-base font-bold mb-3" style={{ color: "var(--foreground)" }}>הוספת חסימה</h2>
            <div className="flex flex-col gap-3">
              <input type="date" value={newBlock.date} onChange={(e) => setNewBlock((p) => ({ ...p, date: e.target.value }))}
                style={inputStyle} />
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={newBlock.isAllDay} onChange={(e) => setNewBlock((p) => ({ ...p, isAllDay: e.target.checked }))} style={{ accentColor: "var(--rose)" }} />
                <span style={{ color: "var(--foreground)" }}>כל היום</span>
              </label>
              {!newBlock.isAllDay && (
                <div className="flex gap-3">
                  <input type="time" value={newBlock.startTime} onChange={(e) => setNewBlock((p) => ({ ...p, startTime: e.target.value }))}
                    style={inputStyle} />
                  <input type="time" value={newBlock.endTime} onChange={(e) => setNewBlock((p) => ({ ...p, endTime: e.target.value }))}
                    style={inputStyle} />
                </div>
              )}
              <input placeholder="סיבה (אופציונלי)" value={newBlock.reason} onChange={(e) => setNewBlock((p) => ({ ...p, reason: e.target.value }))}
                style={inputStyle} />
              <button onClick={addBlock} disabled={saving || !newBlock.date}
                className="py-3.5 font-bold text-white disabled:opacity-60"
                style={{ background: "var(--rose)", borderRadius: "var(--pill)" }}>
                {saving ? "שומר..." : "הוספת חסימה"}
              </button>
            </div>
          </div>

          {/* Blocked list */}
          <div className="flex flex-col gap-2">
            {blocked.map((b) => (
              <div key={b.id} className="flex justify-between items-center p-4" style={listCard}>
                <div>
                  <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>
                    {b.date.toDate().toLocaleDateString("he-IL")}
                  </p>
                  <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {b.isAllDay ? "כל היום" : `${b.startTime} – ${b.endTime}`}
                    {b.reason ? ` · ${b.reason}` : ""}
                  </p>
                </div>
                <button onClick={() => removeBlock(b.id)} className="text-xs px-3 py-1.5 rounded-full font-semibold" style={{ color: "var(--muted-foreground)", border: "1px solid var(--border-color)" }}>מחיקה</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
