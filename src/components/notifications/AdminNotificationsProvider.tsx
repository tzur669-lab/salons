"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSalon } from "@/contexts/SalonProvider";
import { subscribeToPendingAppointments } from "@/lib/firestore/appointments";
import { AdminToast } from "./AdminToast";

interface AdminNotificationsValue {
  pendingCount: number;
}

const AdminNotificationsContext = createContext<AdminNotificationsValue>({ pendingCount: 0 });

export function useAdminNotifications(): AdminNotificationsValue {
  return useContext(AdminNotificationsContext);
}

const SEEN_KEY = "admin-seen-pending-ids";
let seenIds: Set<string> | null = null;

function getSeen(): Set<string> {
  if (seenIds) return seenIds;
  try {
    const raw = typeof window !== "undefined" ? sessionStorage.getItem(SEEN_KEY) : null;
    seenIds = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    seenIds = new Set<string>();
  }
  return seenIds;
}

function persistSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(getSeen())));
  } catch { /* ignore */ }
}

interface Toast { key: number; apptId: string; name: string; }

const TOAST_TTL_MS = 6000;
const MAX_TOASTS = 3;

export function AdminNotificationsProvider({ children }: { children: React.ReactNode }) {
  const { salonId, isOwner, loading } = useSalon();
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const firstSnapshotRef = useRef(true);
  const toastKeyRef = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  function dismiss(key: number) {
    setToasts((prev) => prev.filter((t) => t.key !== key));
    const timer = timersRef.current.get(key);
    if (timer) { clearTimeout(timer); timersRef.current.delete(key); }
  }

  useEffect(() => {
    if (loading || !isOwner) { setPendingCount(0); return; }

    firstSnapshotRef.current = true;
    const timers = timersRef.current;

    const unsub = subscribeToPendingAppointments(salonId, (appts) => {
      setPendingCount(appts.length);
      const seen = getSeen();

      if (firstSnapshotRef.current) {
        appts.forEach((a) => seen.add(a.id));
        persistSeen();
        firstSnapshotRef.current = false;
        return;
      }

      const fresh = appts.filter((a) => !seen.has(a.id));
      if (fresh.length === 0) return;

      fresh.forEach((a) => seen.add(a.id));
      persistSeen();
      try { navigator.vibrate?.(200); } catch { /* ignore */ }

      setToasts((prev) => {
        const added = fresh.map((a) => ({
          key: ++toastKeyRef.current,
          apptId: a.id,
          name: a.clientName ?? "",
        }));
        added.forEach((t) => {
          const timer = setTimeout(() => dismiss(t.key), TOAST_TTL_MS);
          timers.set(t.key, timer);
        });
        return [...prev, ...added].slice(-MAX_TOASTS);
      });
    });

    return () => {
      unsub();
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, [isOwner, loading, salonId]);

  function openDashboard(key: number) {
    dismiss(key);
    router.push(`/${salonId}/admin`);
  }

  return (
    <AdminNotificationsContext.Provider value={{ pendingCount }}>
      {children}
      {toasts.length > 0 && (
        <div
          dir="rtl"
          className="fixed inset-x-0 z-[1000] flex flex-col gap-2 px-3 pointer-events-none"
          style={{ top: "calc(env(safe-area-inset-top) + 10px)" }}
        >
          <div className="w-full max-w-md mx-auto flex flex-col gap-2 pointer-events-auto">
            {toasts.map((t) => (
              <AdminToast
                key={t.key}
                name={t.name}
                onOpen={() => openDashboard(t.key)}
                onDismiss={() => dismiss(t.key)}
              />
            ))}
          </div>
        </div>
      )}
    </AdminNotificationsContext.Provider>
  );
}
