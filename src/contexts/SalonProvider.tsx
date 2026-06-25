"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { getSalon } from "@/lib/firestore/salons";
import { useAuth } from "@/hooks/useAuth";
import type { Salon } from "@/types";

interface SalonValue {
  salonId: string;
  salon: Salon | null;
  isOwner: boolean;
  loading: boolean;
}

const SalonContext = createContext<SalonValue | null>(null);

export function SalonProvider({
  salonId,
  children,
}: {
  salonId: string;
  children: ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [salon, setSalon] = useState<Salon | null>(null);
  const [salonLoading, setSalonLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setSalonLoading(true);
    getSalon(salonId)
      .then((s) => {
        if (cancelled) return;
        if (!s || s.status !== "active") {
          // Salon not found or inactive — redirect to landing.
          router.replace("/");
          return;
        }
        setSalon(s);
        setSalonLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          router.replace("/");
        }
      });
    return () => { cancelled = true; };
  }, [salonId, router]);

  const loading = authLoading || salonLoading;
  const isOwner = !loading && !!user && !!salon && user.uid === salon.ownerUid;

  return (
    <SalonContext.Provider value={{ salonId, salon, isOwner, loading }}>
      {children}
    </SalonContext.Provider>
  );
}

/** Use inside any page nested under src/app/[salonId]/. */
export function useSalon(): SalonValue {
  const ctx = useContext(SalonContext);
  if (!ctx) throw new Error("useSalon must be used within <SalonProvider>");
  return ctx;
}
