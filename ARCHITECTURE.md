# Roni Nails — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Vercel (Next.js 16)                      │
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────────┐  │
│  │  Public UI   │   │  Admin UI    │   │   Shared Layer     │  │
│  │  /book       │   │  /admin/*    │   │  AppShell, Navbar  │  │
│  │  /clinic     │   │  dashboard   │   │  PhoneInput        │  │
│  │  /my-appts   │   │  services    │   └────────────────────┘  │
│  │  /login      │   │  availability│                            │
│  └──────┬───────┘   │  clients     │                            │
│         │           │  payment     │                            │
│         │           └──────┬───────┘                            │
│         │                  │                                     │
│  ┌──────▼──────────────────▼───────┐                            │
│  │           State / Logic          │                            │
│  │  useAuth (hook)                  │                            │
│  │  useBookingStore (Zustand)       │                            │
│  │  booking-logic.ts (pure fn)      │                            │
│  │  whatsapp.ts + google-calendar.ts│                            │
│  │  hebrew-calendar.ts              │                            │
│  └──────────────┬──────────────────┘                            │
│                 │                                                 │
│  ┌──────────────▼──────────────────┐                            │
│  │         Firestore Layer          │                            │
│  │  lib/firestore/                  │                            │
│  │    users.ts  services.ts         │                            │
│  │    appointments.ts  settings.ts  │                            │
│  └──────────────┬──────────────────┘                            │
└─────────────────┼───────────────────────────────────────────────┘
                  │
       ┌──────────▼──────────┐
       │   Firebase (Google)  │
       │   Auth               │
       │   Firestore          │
       │   Storage            │
       └─────────────────────┘
```

---

## Modules & Responsibilities

### `src/app/` — Pages (Next.js App Router)

| Route | Who | Notes |
|-------|-----|-------|
| `/` | All | Landing page with CTA to /book |
| `/book` | All | 4-step booking wizard |
| `/login` | Unauthenticated | Google + Email sign-in |
| `/clinic` | All | Address, hours, gallery, WhatsApp link |
| `/my-appointments` | Logged-in clients | View + cancel own appointments |
| `/admin` | Admin only | Dashboard: today's schedule + pending approvals |
| `/admin/appointments` | Admin | Full appointment list with filters |
| `/admin/services` | Admin | CRUD for service catalog |
| `/admin/availability` | Admin | Recurring and one-time availability rules |
| `/admin/clients` | Admin | Client list + notes |
| `/admin/clinic` | Admin | Edit clinic info |
| `/admin/payment` | Admin | Bit/Paybox QR settings |
| `/profile` | Logged-in | Email confirm, set password, delete account |
| `/reset-password` | All | Firebase password-reset landing page |

`/admin/layout.tsx` — guards all `/admin/*` routes; redirects non-admins.

---

### `src/app/api/` — Server-only API routes (Firebase Admin SDK)

| Route | Method | Role |
|-------|--------|------|
| `/api/availability` | POST | PUBLIC: bookable slots for one day (`{dayKey, serviceDuration}`). Server-side reads + tz-correct `generateDaySlots`; returns only anonymous `{startTime, endTime, available}` |
| `/api/login-by-name` | POST | Name+password → custom token. Rate-limited (5/15 min), ambiguity-aware |
| `/api/notify-admin` | POST | New-booking email (Resend) + FCM push to admin. Body is `{appointmentId}` only; reads the pending doc as source of truth; HTML-escaped; idempotent (`adminNotifiedAt`); Israel-tz |
| `/api/notify-client-approval` | POST | Admin-only (`verifyAdminRequest`: env UID OR role): FCM push to a specific client on status change; prunes dead tokens |
| `/api/cancel-appointment` | POST | Client-only (ID-token auth): cancel own pending appointment; Admin-SDK move pending→rejected |
| `/api/cron/appointment-reminders` | GET/POST | CRON_SECRET auth: sends 1-hour-before push reminders to clients, marks `reminderSentAt`, prunes dead tokens. Called every 10 min by cron-job.org. Stamps a `cronStatus` heartbeat on each successful run |
| `/api/cron-status` | GET | Admin-only: reminder-cron heartbeat age + `stale` flag (powers the dashboard "reminders not running" banner) |
| `/api/register-push-token` | POST/DELETE | Save / remove a device token under `pushTokens/{uid}/tokens/`. uid from the verified ID token (Bearer), not the body |
| `/api/self-test-push` | POST | Send a test push to the caller's own devices (any logged-in user); precise reason codes |
| `/api/push-token-status` | GET | Device count + token freshness for the caller (diagnostics) |
| `/firebase-messaging-sw.js` | GET | Dynamic route serving the Web Push service worker with public config injected server-side |
| `/api/delete-account` | DELETE | Verify ID token, delete user + data (App Store requirement); admin protected |

These run only on the server and use `lib/firebase-admin.ts`. Never import the Admin SDK into a client component.

---

### `src/lib/` — Business Logic & Integrations

| File | Role |
|------|------|
| `firebase.ts` | Client Firebase init, export `auth`, `db`, `storage`, `ADMIN_UID` |
| `firebase-admin.ts` | **Server-only** Admin SDK init: `adminAuth`, `adminDb`, `adminMessaging` |
| `admin-auth.ts` | **Server-only** `verifyAdminRequest()` — single admin-authorization check for `/api/*` (env UID OR Firestore role); mirrors `firestore.rules` `isAdmin()` |
| `booking-logic.ts` | `generateDaySlots()` — pure, tz-correct slot generation; no Firebase at runtime. Called server-side by `/api/availability` |
| `timezone.ts` | Asia/Jerusalem helpers (DST-aware via Intl, no dep): wall-time↔instant, day keys, `formatIsraelTime` |
| `whatsapp.ts` | Builds `wa.me` URL for appointment approval messages |
| `google-calendar.ts` | Builds Google Calendar "add event" URL embedded in WhatsApp messages |
| `hebrew-calendar.ts` | Formats dates in Hebrew using `@hebcal/core` |
| `open-external.ts` | Native-aware link opener (system browser on native, `window.open` on web) |
| `push.ts` | **Native** FCM push registration (`@capacitor-firebase/messaging`) |
| `web-push.ts` | **Web** FCM push for installed PWAs (iPhone path, iOS 16.4+); gesture-first permission + token save |
| `notify-client.ts` | `notifyClientApproved()` — builds Hebrew push message and calls `/api/notify-client-approval` with `keepalive: true` |
| `firestore/push-tokens-admin.ts` | Admin-SDK token store (`pushTokens/{uid}/tokens/{hash}`): save/get/delete/status; used by all senders |
| `storage.ts` | Firebase Storage upload helper (clinic photos) |
| `firestore/users.ts` | CRUD for `users` collection |
| `firestore/services.ts` | CRUD + ordering for `services` collection |
| `firestore/appointments.ts` | Create, read, status updates — MOVES docs across the 4 collections |
| `firestore/settings.ts` | Read/write availability rules, blocked times, clinic/payment settings |

---

### `src/hooks/`

| Hook | Returns |
|------|---------|
| `useAuth` | `user`, `appUser`, `loading`, `isAdmin`, `needsPhone`, auth methods. Now a **context consumer** — `AuthProvider` (in `providers.tsx`) owns the single listener; `useAuth.tsx` also exports `reauthenticateWithGoogle` |

`isAdmin` is true if `appUser.role === "admin"` OR `user.uid === ADMIN_UID`.  
`needsPhone` is true when user is logged in but hasn't verified phone yet.

---

### `src/store/`

| Store | State |
|-------|-------|
| `useBookingStore` | `selectedService`, `selectedDate`, `selectedStartTime`, `selectedEndTime`, `guestInfo`, `step` (1–4) |

Step transitions are encoded in setters: `setService` → step 2, `setTimeSlot` → step 3.

---

### `src/components/`

```
shared/
  AppShell.tsx           — Page wrapper (max-width, padding, RTL direction)
  Navbar.tsx             — Bottom nav on mobile, top nav on desktop
  PhoneInput.tsx         — Israeli phone number input with validation
  SetPasswordForOAuth.tsx— Set-password flow for Google-only accounts (Google or SMS re-auth)
  ForgotPassword.tsx     — Password-reset request UI

native/
  NativeSetup.tsx        — Native side effects: status bar + Android back button (no-op on web)
  NotificationsBanner.tsx       — Native push opt-in (Android/iOS app)
  WebNotificationsBanner.tsx    — Web push opt-in; iOS shows an Add-to-Home-Screen guide until installed
  WebPushSetup.tsx              — Refresh web token on PWA launch (mounted in layout.tsx)
  NotificationDiagnostics.tsx   — Per-gate push diagnostics + self-test (native + web)

booking/
  ServiceCard.tsx       — Single service tile (step 1)
  TimeSlotPicker.tsx    — Grid of available slots (step 2)
  GuestForm.tsx         — Name + phone form for unauthenticated users (step 3)
  BookingConfirmation.tsx — Success screen (step 4)
```

---

## Firestore Collections

```
users/              {uid}  → AppUser
services/           {id}   → Service (ordered by `order` field)
appointments/       {id}   → Appointment (LEGACY flat collection, back-compat only)
appointmentsPending/  {id} → Appointment (pending + change_requested)
appointmentsApproved/ {id} → Appointment (upcoming approved)
appointmentsRejected/ {id} → Appointment (rejected + cancelled)
appointmentsCompleted/{id} → Appointment (past completed)
availabilityRules/  {id}   → AvailabilityRule (recurring | one_time)
blockedTimes/       {id}   → BlockedTime
clinicSettings/     "main" → ClinicSettings
paymentSettings/    "main" → PaymentSettings
clientNotes/        {id}   → ClientNote
pushTokens/{uid}/tokens/{sha256(token)} → { token, platform, updatedAt }  (server-written;
                            ONE doc per device so android+ios+web coexist. Legacy flat
                            pushTokens/{uid}.token still read for back-compat.)
loginRateLimit/     {key}  → { count, resetAt }    (server-only; rules deny all clients)
```

> Status changes physically MOVE a document between the four `appointments*` collections
> via a batch set+delete. The flat `appointments/` collection is kept only for back-compat.

---

## Coupling Map

| Coupled | Reason | Risk if changed |
|---------|--------|-----------------|
| `ADMIN_UID` env var ↔ `useAuth` + Firestore rules | Admin is identified by hardcoded UID | Change UID in env without updating Firestore `users` doc role → partial admin access |
| `book/page.tsx` → `/api/availability` → `booking-logic.ts` | Page posts `{dayKey,duration}`; the route feeds rules/blocked/appointments to the pure fn server-side | Page no longer reads Firestore for slots; changing the route's response shape or slot interval breaks slot display |
| `booking-logic.ts` + `/api/availability` ↔ `lib/timezone.ts` | Slot instants built from Israel wall time | Slot math must stay in Asia/Jerusalem; using `Date.setHours()` reintroduces the device/UTC tz bug |
| `appointments.status` enum ↔ `admin/page.tsx` STATUS_LABELS | UI color map hardcoded to status strings | Adding a new status without updating STATUS_LABELS causes unstyled badge |
| WhatsApp link ↔ `clinicSettings.address` | Address is embedded in the approval message | If `clinicSettings` doc doesn't exist, approval message has no address |
| `firestore.rules isAdmin()` ↔ `users/{uid}.role` | Rules do a live doc read | If user doc is missing, admin writes will be denied even with correct UID |
| `appointments.status` ↔ which collection holds the doc | Status change moves the doc | Reading the wrong collection after a status change returns nothing |
| `FIREBASE_PRIVATE_KEY` ↔ Admin SDK in `/api/*` | Server credential | Missing/misescaped key breaks name-login, notifications, account deletion |
| `capacitor.config.ts server.url` ↔ Vercel deploy URL | Native app loads remote site | If the URL changes, the native app must be rebuilt to point at the new host |

---

## Intentionally Isolated

- `booking-logic.ts` / `timezone.ts` — no Firebase at runtime (type-only imports), pure functions. Keep it that way; both run on the server in `/api/availability` and must stay isomorphic.
- `whatsapp.ts` / `google-calendar.ts` / `hebrew-calendar.ts` — no Firebase, no React. Pure URL builders.
- Firestore layer (`lib/firestore/*.ts`) — no React, no Zustand. Plain async functions.
- `firebase-admin.ts` + `src/app/api/*` — server-only. The Admin SDK bypasses Firestore rules and uses `FIREBASE_PRIVATE_KEY`; never import it into a client component.
- `push.ts`, `open-external.ts`, `NativeSetup.tsx` — native-only side effects; guarded by `Capacitor.isNativePlatform()` so they no-op on web.
- `web-push.ts`, `WebNotificationsBanner.tsx`, `WebPushSetup.tsx` — web-only; guarded by `isWebPushSupported()` (false on native) so they no-op in the Capacitor app. Needs `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.
