import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { salonCol, salonSubDoc } from "@/lib/salon-path";
import type {
  ClinicSettings,
  PaymentSettings,
  AvailabilityRule,
  BlockedTime,
} from "@/types";

// ── Clinic Settings ──────────────────────────────────────────────
export async function getClinicSettings(salonId: string): Promise<ClinicSettings | null> {
  const snap = await getDoc(salonSubDoc(salonId, "clinicSettings", "main"));
  if (!snap.exists()) return null;
  return snap.data() as ClinicSettings;
}

export async function saveClinicSettings(salonId: string, data: ClinicSettings): Promise<void> {
  await setDoc(salonSubDoc(salonId, "clinicSettings", "main"), data);
}

// ── Payment Settings ─────────────────────────────────────────────
export async function getPaymentSettings(salonId: string): Promise<PaymentSettings | null> {
  const snap = await getDoc(salonSubDoc(salonId, "paymentSettings", "main"));
  if (!snap.exists()) return null;
  return snap.data() as PaymentSettings;
}

export async function savePaymentSettings(salonId: string, data: PaymentSettings): Promise<void> {
  await setDoc(salonSubDoc(salonId, "paymentSettings", "main"), data);
}

// ── Availability Rules ────────────────────────────────────────────
export async function getAvailabilityRules(salonId: string): Promise<AvailabilityRule[]> {
  const snap = await getDocs(salonCol(salonId, "availabilityRules"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AvailabilityRule);
}

export async function addAvailabilityRule(
  salonId: string,
  data: Omit<AvailabilityRule, "id">
): Promise<string> {
  const ref = await addDoc(salonCol(salonId, "availabilityRules"), data);
  return ref.id;
}

export async function updateAvailabilityRule(
  salonId: string,
  id: string,
  data: Partial<Omit<AvailabilityRule, "id">>
): Promise<void> {
  await updateDoc(salonSubDoc(salonId, "availabilityRules", id), data);
}

export async function deleteAvailabilityRule(salonId: string, id: string): Promise<void> {
  await deleteDoc(salonSubDoc(salonId, "availabilityRules", id));
}

// ── Blocked Times ─────────────────────────────────────────────────
export async function getBlockedTimes(salonId: string): Promise<BlockedTime[]> {
  const q = query(salonCol(salonId, "blockedTimes"), orderBy("date"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BlockedTime);
}

export async function addBlockedTime(
  salonId: string,
  data: Omit<BlockedTime, "id">
): Promise<string> {
  const ref = await addDoc(salonCol(salonId, "blockedTimes"), data);
  return ref.id;
}

export async function deleteBlockedTime(salonId: string, id: string): Promise<void> {
  await deleteDoc(salonSubDoc(salonId, "blockedTimes", id));
}

export async function getBlockedTimesForDate(salonId: string, date: Date): Promise<BlockedTime[]> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  const snap = await getDocs(salonCol(salonId, "blockedTimes"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as BlockedTime)
    .filter((bt) => {
      const d = bt.date.toDate();
      return d >= start && d <= end;
    });
}
