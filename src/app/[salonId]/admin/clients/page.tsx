"use client";
import { useEffect, useState } from "react";
import { useSalon } from "@/contexts/SalonProvider";
import { getSalonClients, addClientNote, getClientNotes } from "@/lib/firestore/users";
import { getClientAppointments } from "@/lib/firestore/appointments";
import { useAuth } from "@/hooks/useAuth";
import { Timestamp } from "firebase/firestore";
import type { AppUser, Appointment, ClientNote } from "@/types";

export default function AdminClientsPage() {
  const { user } = useAuth();
  const { salonId } = useSalon();
  const [clients, setClients] = useState<AppUser[]>([]);
  const [selected, setSelected] = useState<AppUser | null>(null);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { getSalonClients(salonId).then(setClients); }, [salonId]);

  async function openClient(c: AppUser) {
    setSelected(c);
    const [a, n] = await Promise.all([
      getClientAppointments(salonId, c.id),
      getClientNotes(salonId, c.id),
    ]);
    setAppts(a);
    setNotes(n);
  }

  async function saveNote() {
    if (!note.trim() || !selected || !user) return;
    setSaving(true);
    const newNote = await addClientNote(salonId, selected.id, note.trim(), user.uid);
    setNotes((prev) => [{ ...newNote, createdAt: Timestamp.now() }, ...prev]);
    setNote("");
    setSaving(false);
  }

  const card: React.CSSProperties = { borderRadius: "var(--radius)", background: "var(--surface)", boxShadow: "var(--card-shadow)" };

  return (
    <div className="pb-20 md:pb-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-extrabold mb-4" style={{ color: "var(--foreground)" }}>לקוחות</h1>

      {selected ? (
        <div>
          <button
            onClick={() => { setSelected(null); setNotes([]); setAppts([]); }}
            className="mb-4 font-bold flex items-center gap-1.5 px-4 py-2.5 text-sm transition-all active:scale-95"
            style={{ color: "var(--rose)", background: "var(--rose-soft)", borderRadius: "var(--pill)", border: "1.5px solid var(--rose)" }}
          >
            <span style={{ fontSize: 18 }}>›</span> חזרה לרשימה
          </button>

          {/* Client info card with notes */}
          <div className="p-5 mb-4" style={card}>
            <p className="font-bold text-lg" style={{ color: "var(--foreground)" }}>{selected.name}</p>
            <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }} dir="ltr">{selected.phone}</p>
            {selected.email && <p className="text-sm" style={{ color: "var(--muted-foreground)" }} dir="ltr">{selected.email}</p>}

            {notes.length > 0 && (
              <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border-color)" }}>
                <p className="text-xs font-bold mb-2" style={{ color: "var(--muted-foreground)" }}>הערות</p>
                <div className="flex flex-col gap-1.5">
                  {notes.map((n) => (
                    <p key={n.id} className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
                      • {n.note}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          <h2 className="text-sm font-bold mb-2" style={{ color: "var(--muted-foreground)" }}>תורים</h2>
          <div className="flex flex-col gap-2 mb-6">
            {appts.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>אין תורים</p>
            ) : (
              appts.map((a) => (
                <div key={a.id} className="p-4 text-sm" style={card}>
                  <div className="flex justify-between">
                    <span className="font-semibold" style={{ color: "var(--foreground)" }}>{a.serviceName}</span>
                    <span style={{ color: "var(--muted-foreground)" }}>
                      {a.startTime.toDate().toLocaleDateString("he-IL")}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <h2 className="text-sm font-bold mb-2" style={{ color: "var(--muted-foreground)" }}>הוספת הערה</h2>
          <div className="flex gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveNote()}
              placeholder="הערה על הלקוחה..."
              className="flex-1 px-4 py-3"
              style={{ borderRadius: 14, border: "1px solid var(--border-color)", background: "var(--accent)", outline: "none", color: "var(--foreground)" }}
            />
            <button
              onClick={saveNote}
              disabled={saving || !note.trim()}
              className="px-5 py-3 font-bold text-white disabled:opacity-60"
              style={{ background: "var(--rose)", borderRadius: "var(--pill)" }}
            >
              {saving ? "..." : "שמירה"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {clients.length === 0 ? (
            <p className="text-center py-10 text-sm" style={{ color: "var(--muted-foreground)" }}>אין לקוחות רשומים</p>
          ) : (
            clients.map((c) => (
              <button
                key={c.id}
                onClick={() => openClient(c)}
                className="flex justify-between items-center p-4 text-right w-full transition-all active:scale-[0.99]"
                style={card}
              >
                <div>
                  <p className="font-bold text-sm" style={{ color: "var(--foreground)" }}>{c.name}</p>
                  <p className="text-xs" style={{ color: "var(--muted-foreground)" }} dir="ltr">{c.phone}</p>
                </div>
                <span style={{ color: "var(--rose)", fontSize: 18 }}>‹</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
