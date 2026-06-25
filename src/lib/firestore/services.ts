import {
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { salonCol, salonSubDoc } from "@/lib/salon-path";
import type { Service } from "@/types";

export async function getServices(salonId: string, activeOnly = false): Promise<Service[]> {
  const col = salonCol(salonId, "services");
  const q = activeOnly
    ? query(col, where("active", "==", true))
    : query(col);
  const snap = await getDocs(q);
  const services = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Service);
  return services.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function addService(
  salonId: string,
  data: Omit<Service, "id">
): Promise<string> {
  const ref = await addDoc(salonCol(salonId, "services"), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateService(
  salonId: string,
  id: string,
  data: Partial<Omit<Service, "id">>
): Promise<void> {
  await updateDoc(salonSubDoc(salonId, "services", id), data);
}

export async function deleteService(salonId: string, id: string): Promise<void> {
  await deleteDoc(salonSubDoc(salonId, "services", id));
}
