import { create } from "zustand";
import type { Service, GuestInfo } from "@/types";

interface BookingState {
  selectedService: Service | null;
  selectedDate: Date | null;
  selectedStartTime: Date | null;
  selectedEndTime: Date | null;
  guestInfo: GuestInfo | null;
  step: 1 | 2 | 3 | 4;

  setService: (s: Service) => void;
  setDate: (d: Date) => void;
  setTimeSlot: (start: Date, end: Date) => void;
  setGuestInfo: (g: GuestInfo) => void;
  setStep: (s: 1 | 2 | 3 | 4) => void;
  prevStep: () => void;
  reset: () => void;
}

export const useBookingStore = create<BookingState>((set) => ({
  selectedService: null,
  selectedDate: null,
  selectedStartTime: null,
  selectedEndTime: null,
  guestInfo: null,
  step: 1,

  setService: (s) => set({ selectedService: s, step: 2 }),
  setDate: (d) => set({ selectedDate: d }),
  setTimeSlot: (start, end) => set({ selectedStartTime: start, selectedEndTime: end, step: 3 }),
  setGuestInfo: (g) => set({ guestInfo: g }),
  setStep: (s) => set({ step: s }),
  prevStep: () =>
    set((s) => {
      if (s.step === 4) return { step: 3 as const, guestInfo: null };
      if (s.step === 3) return { step: 2 as const, selectedStartTime: null, selectedEndTime: null };
      if (s.step === 2) return { step: 1 as const, selectedDate: null };
      return {};
    }),
  reset: () =>
    set({
      selectedService: null,
      selectedDate: null,
      selectedStartTime: null,
      selectedEndTime: null,
      guestInfo: null,
      step: 1,
    }),
}));
