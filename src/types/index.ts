import type { Timestamp } from "firebase/firestore";

// ── Multi-tenant salon doc (salons/{salonId}) ─────────────────────────────────
export interface Salon {
  slug: string;          // == Firestore doc ID, URL-safe slug (e.g. "dana-nails")
  displayName: string;   // Human-readable salon name shown in the UI
  ownerUid: string;      // Firebase Auth UID of the owner/technician
  status: "active" | "inactive";
  bookingUrl?: string;   // Convenience copy of the public link ({APP_URL}/{slug}); derived from slug, written at onboarding
  createdAt: Timestamp;
}

export type UserRole = "admin" | "client";

export type AppointmentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "change_requested"
  | "completed";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  authEmail?: string; // actual Firebase Auth email (may be placeholder for no-email users)
  notificationEmail?: string; // owner-only: where this salon's "new appointment" alerts are emailed (overrides authEmail)
  phone: string;
  role: UserRole;
  createdAt: Timestamp;
  phoneVerified: boolean;
  historyClearedAt?: Timestamp; // client cleared their own appointment-history view up to this moment
}

export interface Service {
  id: string;
  name: string;
  duration: number; // minutes
  description?: string;
  price?: number;
  active: boolean;
  order: number;
}

export interface ChangeRequest {
  requestedStartTime: Timestamp;
  requestedEndTime: Timestamp;
  requestedAt: Timestamp;
}

export interface Appointment {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  serviceId: string;
  serviceName: string;
  serviceDuration: number;
  servicePrice?: number; // price snapshot at booking time (₪) — immune to later service price edits; powers revenue reports
  startTime: Timestamp;
  endTime: Timestamp;
  status: AppointmentStatus;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  changeRequest?: ChangeRequest;
  isGuest?: boolean;
  guestAccessTokenHash?: string; // sha256 of the one-time guest recovery token (guests only). Plaintext is never stored.
  rescheduleCount?: number;      // how many times this appointment has been rescheduled (self-service)
  originalStartTime?: Timestamp;  // the first start time before any reschedule (audit of the move)
  // ── Reminder delivery state (set/updated by /api/cron/appointment-reminders) ──
  reminderSentAt?: Timestamp;    // set ONLY after ≥1 device confirmed delivery (success). Suppresses further reminders.
  reminderClaimedAt?: Timestamp; // transient concurrency claim taken before sending; cleared/expired on failure so the next run retries
  reminderAttempts?: number;     // delivery attempts so far (caps retries)
  reminderFailed?: boolean;       // terminal: every attempt failed up to the cap — surfaced to admin
  adminNotifiedAt?: Timestamp;   // set once /api/notify-admin has emailed/pushed for this booking (dedup)
}

export type AvailabilityType = "recurring" | "one_time";

export interface AvailabilityRule {
  id: string;
  type: AvailabilityType;
  dayOfWeek?: number; // 0=Sun ... 6=Sat
  date?: Timestamp; // for one_time
  openTime: string; // "09:00"
  closeTime: string; // "19:00"
  isOpen: boolean;
}

export interface BlockedTime {
  id: string;
  date: Timestamp;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  reason?: string;
}

export interface DayOpeningHours {
  open: string;
  close: string;
  isOpen: boolean;
}

export interface ClinicSettings {
  name: string;
  address: string;
  phone: string;
  whatsappNumber: string;
  instagramUrl: string;
  googleMapsUrl: string;
  homeImageUrl?: string;
  openingHours: {
    sun: DayOpeningHours;
    mon: DayOpeningHours;
    tue: DayOpeningHours;
    wed: DayOpeningHours;
    thu: DayOpeningHours;
    fri: DayOpeningHours;
    sat: DayOpeningHours;
  };
  galleryImages: string[];
}

export interface PaymentSettings {
  bitQrImageUrl: string;
  bitPhoneNumber: string;
  bitPayUrl?: string;
  payboxPhoneNumber: string;
}

export interface ClientNote {
  id: string;
  clientId: string;
  note: string;
  createdAt: Timestamp;
  updatedBy: string;
}

export interface GuestInfo {
  name: string;
  phone: string;
}

export interface TimeSlot {
  startTime: Date;
  endTime: Date;
  available: boolean;
}

export type HebrewDayOfWeek =
  | "ראשון"
  | "שני"
  | "שלישי"
  | "רביעי"
  | "חמישי"
  | "שישי"
  | "שבת";
