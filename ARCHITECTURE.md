# Salons — Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Vercel (Next.js 16)                           │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    /[salonId]/* — Per-salon pages               │  │
│  │                                                                   │  │
│  │  [salonId]/layout.tsx  ←  SalonProvider(salonId)                │  │
│  │                            └─ AdminNotificationsProvider         │  │
│  │                                                                   │  │
│  │  Public:          /[salonId]/       (salon home)                 │  │
│  │                   /[salonId]/book   (booking wizard)             │  │
│  │                   /[salonId]/clinic (info + payment)             │  │
│  │                   /[salonId]/login  (auth)                       │  │
│  │                   /[salonId]/my-appointments                     │  │
│  │                   /[salonId]/guest  (token-based lookup)         │  │
│  │                   /[salonId]/profile                             │  │
│  │                   /[salonId]/reset-password                      │  │
│  │                                                                   │  │
│  │  Owner-only:      /[salonId]/admin/* (guarded by isOwner)        │  │
│  │                   ├─ dashboard, appointments, services           │  │
│  │                   ├─ availability, blocks, calendar              │  │
│  │                   ├─ clients, reports, clinic, payment           │  │
│  │                   └─ [salonId]/admin/layout.tsx (isOwner guard)  │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌──────────────────┐   ┌──────────────────────────────────────────┐  │
│  │   Root pages     │   │           Context / State                │  │
│  │   / (landing)    │   │  SalonProvider — salon doc, isOwner      │  │
│  │   /onboard       │   │  AuthProvider  — Firebase Auth state     │  │
│  └──────────────────┘   │  AdminNotificationsProvider — pending ↑  │  │
│                          │  useBookingStore (Zustand) — wizard      │  │
│                          └──────────────────────────────────────────┘  │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    /api/* — Server routes (Admin SDK)            │  │
│  │  /api/onboard              /api/availability                     │  │
│  │  /api/appointments         /api/notify-admin                     │  │
│  │  /api/notify-client-approval  /api/cancel-appointment            │  │
│  │  /api/reschedule-request   /api/guest/*                          │  │
│  │  /api/cron/appointment-reminders (collectionGroup cross-salon)   │  │
│  │  /api/admin/* (owner-gated)  /api/login-by-name                 │  │
│  │  /api/register-push-token  /api/delete-account  etc.            │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                  │
       ┌──────────▼──────────┐
       │   Firebase (salons-19a2e)   │
       │   Auth  (shared, global)    │
       │   Firestore (multi-tenant)  │
       │   Storage (per-salon paths) │
       └─────────────────────────────┘
```

---

## Multi-Tenant Data Model

```
Firestore root
│
├─ salons/{salonId}                    ← TENANT ANCHOR
│    { slug, displayName, ownerUid, status: "active"|"inactive", createdAt }
│    │
│    ├─ clinicSettings/main            ← ClinicSettings
│    ├─ paymentSettings/main           ← PaymentSettings
│    ├─ services/{id}                  ← Service catalog
│    ├─ availabilityRules/{id}         ← Recurring + one-time hours
│    ├─ blockedTimes/{id}              ← Explicit closed periods
│    ├─ appointmentsPending/{id}       ← pending + change_requested
│    ├─ appointmentsApproved/{id}      ← upcoming approved  ← cron reads via collectionGroup
│    ├─ appointmentsRejected/{id}      ← rejected + cancelled
│    ├─ appointmentsCompleted/{id}     ← past completed
│    ├─ clientNotes/{id}               ← Owner-only per-client notes
│    └─ slotLocks/{dayKey}             ← Per-day booking mutex (server-only, deny-all)
│
├─ users/{uid}                         ← GLOBAL — one account, many salons
├─ pushTokens/{uid}/tokens/{hash}      ← FCM device tokens (per user, per device)
├─ loginRateLimit/{key}                ← Server-only; rules deny all clients
├─ cronStatus/{id}                     ← Reminder cron heartbeat (global)
└─ inviteCodes/{code}                  ← Server-only; rules deny all clients
```

**Isolation guarantee:** Firestore rules gate all tenant reads/writes on `isSalonOwner(salonId)` which reads the `ownerUid` from the path-matching `salons/{salonId}` document. A forgotten `where("salonId"==…)` can never leak data — isolation is structural, not filtered.

---

## `src/app/` — Pages

### Root (global)
| Route | Who | Notes |
|-------|-----|-------|
| `/` | All | Static landing ("enter your salon link", link to /onboard) |
| `/onboard` | Logged-in technician | 2-step wizard: invite code + salon details → creates salon |

### Per-salon (`[salonId]/layout.tsx` wraps all)
| Route | Who | Notes |
|-------|-----|-------|
| `/[salonId]/` | All | Salon home; CTAs to book/login |
| `/[salonId]/book` | All | 4-step booking wizard |
| `/[salonId]/login` | Unauthenticated | Google + Email + Name sign-in |
| `/[salonId]/clinic` | All | Address, hours, gallery, payment methods |
| `/[salonId]/my-appointments` | Logged-in clients | View, cancel, reschedule own appointments |
| `/[salonId]/guest` | Anyone with token | Guest appointment lookup + cancel |
| `/[salonId]/profile` | Logged-in | Email confirm, set password, delete account |
| `/[salonId]/reset-password` | All | Firebase password-reset landing |
| `/[salonId]/notification-check` | Logged-in | Push notification diagnostics |
| `/[salonId]/download` | All | PWA install guide |
| `/[salonId]/admin/*` | **Owner only** (isOwner guard in admin/layout.tsx) | |
| `/[salonId]/admin` | Owner | Dashboard: today's schedule + pending approvals |
| `/[salonId]/admin/appointments` | Owner | Full appointment list + approve/reject/cancel |
| `/[salonId]/admin/services` | Owner | CRUD service catalog |
| `/[salonId]/admin/availability` | Owner | Recurring + one-time availability rules |
| `/[salonId]/admin/blocks` | Owner | View/clear rate-limited clients |
| `/[salonId]/admin/calendar` | Owner | Day/week agenda view |
| `/[salonId]/admin/clients` | Owner | Client list + notes |
| `/[salonId]/admin/clinic` | Owner | Edit clinic info + upload home photo |
| `/[salonId]/admin/payment` | Owner | Bit/Paybox QR settings |
| `/[salonId]/admin/reports` | Owner | Revenue + booking analytics, CSV export |

---

## `src/app/api/` — Server Routes

| Route | Method | Auth | Role |
|-------|--------|------|------|
| `/api/onboard` | POST | Bearer token | Create new salon (validate invite code) |
| `/api/availability` | POST | Public | Bookable slots for one day (`{salonId, dayKey, serviceDuration}`) |
| `/api/appointments` | POST | Public/Bearer | Create appointment in `salons/{salonId}/appointmentsPending` |
| `/api/notify-admin` | POST | Public | Email + push to salon owner on new booking |
| `/api/notify-client-approval` | POST | `verifySalonOwner` | Push client on approval/rejection/cancellation |
| `/api/cancel-appointment` | POST | Bearer (client) | Cancel own pending appointment |
| `/api/reschedule-request` | POST | Bearer (client) | Reschedule via booking-lock transaction |
| `/api/guest/appointment` | POST | Public (token) | Look up appointment by guest token (salon-scoped) |
| `/api/guest/cancel` | POST | Public (token) | Cancel guest appointment (salon-scoped) |
| `/api/cron/appointment-reminders` | GET/POST | CRON_SECRET | Cross-salon collectionGroup sweep; per-salon reminders |
| `/api/cron-status` | GET | `verifySalonOwner` | Reminder cron heartbeat for dashboard |
| `/api/notify-update` | POST | `verifySalonOwner` | Broadcast push to all salon clients |
| `/api/admin/rate-limits` | GET/DELETE | `verifySalonOwner` | List/clear loginRateLimit counters |
| `/api/admin-test-push` | POST | `verifySalonOwner` | Test push to owner's own device |
| `/api/self-test-push` | POST | Bearer (any) | Test push to caller's own devices |
| `/api/push-token-status` | GET | Bearer (any) | Token count + freshness |
| `/api/login-by-name` | POST | Public | Name+password → custom token (rate-limited) |
| `/api/register-push-token` | POST/DELETE | Bearer (any) | Save/remove FCM device token |
| `/api/delete-account` | DELETE | Bearer (owner) | Delete user + anonymize appointments |
| `/api/reset-password-by-phone` | POST | Bearer (any) | SMS OTP → reset password server-side |
| `/api/bootstrap-admin` | POST | — | **RETIRED** → 410 Gone |

---

## `src/lib/` — Business Logic

| File | Role |
|------|------|
| `salon-path.ts` | Client path helpers: `salonCol(salonId, name)`, `salonSubDoc(salonId, col, id)` |
| `server/salon-path-admin.ts` | Admin SDK helpers: `adminSalonCol(db, salonId, name)` |
| `firebase.ts` | Client Firebase init — no `ADMIN_UID` (retired) |
| `firebase-admin.ts` | **Server-only** Admin SDK: `adminAuth`, `adminDb`, `adminMessaging` |
| `admin-auth.ts` | `verifySalonOwner(authHeader, salonId)` + `adminErrorStatus()` |
| `booking-logic.ts` | `generateDaySlots()` — pure, tz-correct, no Firebase at runtime |
| `timezone.ts` | Asia/Jerusalem helpers (DST-aware via Intl, no dep) |
| `storage.ts` | `uploadClinicPhoto(salonId, file)` → `salons/{salonId}/clinic/...` |
| `server/booking-lock.ts` | `readLockAndCheckOverlap(db, tx, salonId, dayKey, ...)` |
| `server/guest-token.ts` | `findAppointmentByGuestToken(salonId, token)` — salon-scoped |
| `server/rate-limit.ts` | Fixed-window rate limiter (shared by login + SMS reset) |
| `firestore/salons.ts` | `getSalon()`, `getSalonByOwner()`, `subscribeToSalon()` |
| `firestore/users.ts` | CRUD for `users/` (global) |
| `firestore/services.ts` | CRUD for `salons/{salonId}/services/` |
| `firestore/appointments.ts` | Create/read/status moves across 4 status collections (per-salon) |
| `firestore/settings.ts` | Read/write availability, blocked times, clinic/payment settings (per-salon) |
| `firestore/push-tokens-admin.ts` | Admin SDK token store: `pushTokens/{uid}/tokens/{hash}` |
| `whatsapp.ts` | Builds WhatsApp approval/rejection/cancellation links |
| `google-calendar.ts` | Builds Google Calendar "add event" URL |
| `notify-client.ts` | Hebrew push messages → `POST /api/notify-client-approval` (`keepalive: true`) |
| `contact-manager.ts` | `contactManagerForRecovery(ctx, salonId)` — WhatsApp lockout escape hatch |
| `push.ts` | Native FCM push registration (`@capacitor-firebase/messaging`) |
| `web-push.ts` | Web FCM for installed PWAs (iOS 16.4+, gesture-first permission) |
| `open-external.ts` | `openWhatsApp()` — `whatsapp://` scheme, iOS-safe |
| `phone.ts` | `buildFullPhone`, `e164ToLocal`, `isValidLocalPhone` (pure, unit-tested) |
| `platform.ts` | `isIOS()` (shared) |

---

## `src/contexts/` + `src/hooks/`

| File | Returns |
|------|---------|
| `SalonProvider.tsx` | `{ salonId, salon, isOwner, loading }` — per-salon context. `isOwner = user.uid === salon.ownerUid`. Redirects to "/" if salon not found/inactive. |
| `useAuth.tsx` | `{ user, appUser, loading, isAdmin (always false), needsPhone, signIn*, logout, ... }` — global auth context. No admin concept. |

---

## `src/components/`

```
shared/
  AppShell.tsx               — Page wrapper (max-width, padding, RTL)
  Navbar.tsx                 — Salon-scoped nav (links built with /{salonId}/...); isOwner → admin item
  WhatsAppFab.tsx            — Floating WhatsApp button (reads clinicSettings(salonId))
  PhoneInput.tsx             — Israeli phone input with Firebase OTP
  ForgotPassword.tsx         — Password reset modal (uses useSalon() for salonId)
  SetPasswordForOAuth.tsx    — Set-password for Google-only accounts
  BackButton.tsx             — Back navigation

notifications/
  AdminNotificationsProvider.tsx — Subscribes to salons/{salonId}/appointmentsPending (when isOwner)
  AdminToast.tsx             — Toast popup for new pending appointments

native/
  NativeSetup.tsx            — Status bar + Android back button (no-op on web)
  WebPushSetup.tsx           — Refresh web FCM token on PWA launch
  WebPushPermissionPrompt.tsx — First-launch soft-ask for iOS PWA notification permission
  WebNotificationsBanner.tsx — Web push opt-in banner (Add-to-Home-Screen guide on iOS)
  NotificationsBanner.tsx    — Native push opt-in (Android/iOS app)
  PushPermissionPrompt.tsx   — Native soft-ask + battery optimization
  NotificationDiagnostics.tsx — Push diagnostics + self-test
  AdminPushTest.tsx          — Owner: test push to own device
  AdminUpdateBroadcast.tsx   — Owner: broadcast push to all clients
  AdminNotificationsBanner.tsx — Dashboard reminder-cron staleness banner

booking/
  ServiceCard.tsx            — Single service tile (step 1)
  TimeSlotPicker.tsx         — Grid of available slots (step 2)
  GuestForm.tsx              — Name + phone for unauthenticated users (step 3)
  BookingConfirmation.tsx    — Success screen (step 4)
  RescheduleModal.tsx        — Self-service reschedule (takes salonId prop)
```

---

## Security Model

```
                        ┌──────────────────┐
                        │  Firestore Rules  │
                        └────────┬─────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                   │
    ┌─────────▼──────┐  ┌───────▼───────┐  ┌───────▼────────┐
    │  Global rules  │  │  Salon rules  │  │  Server-only   │
    │  users/ (self) │  │  match        │  │  inviteCodes   │
    │  pushTokens/   │  │  /salons/{id} │  │  loginRateLimit│
    │  (own uid)     │  │  isSalonOwner │  │  slotLocks     │
    └────────────────┘  └───────────────┘  └────────────────┘

API Authorization:
  Public endpoints:       No auth required (availability, guest lookup)
  Client endpoints:       Bearer ID token (cancel, reschedule, push tokens)
  Owner endpoints:        verifySalonOwner(authHeader, salonId)
                          = verifyIdToken(token).uid === salons/{salonId}.ownerUid
```

---

## Coupling Map

| Coupled | Reason | Risk if changed |
|---------|--------|-----------------|
| `salon.ownerUid` ↔ `verifySalonOwner` ↔ `isSalonOwner()` | Three-way source of truth for ownership | All three must agree; changing one without the others breaks admin access |
| `salonId` URL segment ↔ Firestore doc ID | Slug IS the Firestore doc ID IS the URL | Cannot rename a salon after creation without migrating data + breaking links |
| `[salonId]/layout.tsx` params as `Promise<...>` | Next.js 16 requirement for async server layouts | Reverting to sync params causes TypeScript error in `validator.ts` |
| `SalonProvider` wraps `AdminNotificationsProvider` | The notifications provider uses `useSalon()` | Moving notifications outside SalonProvider breaks the context |
| `collectionGroup("appointmentsApproved")` ↔ composite indexes | Firestore requires the indexes for multi-field queries | Missing indexes cause runtime `FAILED_PRECONDITION` errors in the cron |
| `salonId` in every API route body ↔ server-side salon validation | Structural tenant isolation | Adding a route without salonId validation leaks cross-tenant data |
| `salon.ownerUid` → `users/{ownerUid}.notificationEmail ?? authEmail` | notify-admin resolves the alert recipient dynamically (SendGrid) | If both are unset/placeholder, the owner gets no booking email (no global fallback by design) |
| `storage.rules` `firestore.get(...)` ↔ `salons/{salonId}.ownerUid` | Storage rules cross-reference Firestore | If the salon doc is deleted, uploads will be denied |
| `booking-logic.ts` + `/api/availability` ↔ `lib/timezone.ts` | Slot instants built from Israel wall time | Must stay in Asia/Jerusalem; using `Date.setHours()` reintroduces device/UTC tz bug |

---

## Intentionally Isolated

- `booking-logic.ts` / `timezone.ts` — no Firebase at runtime (type-only imports), pure. Both run server-side in `/api/availability`.
- `whatsapp.ts` / `google-calendar.ts` / `hebrew-calendar.ts` — no Firebase, no React. Pure URL builders.
- `salon-path.ts` / `server/salon-path-admin.ts` — no business logic, pure path helpers.
- Firestore layer (`lib/firestore/*.ts`) — no React, no Zustand. Plain async functions.
- `firebase-admin.ts` + `src/app/api/*` — server-only. Admin SDK bypasses rules. Never import client-side.
- `push.ts` / `open-external.ts` / `NativeSetup.tsx` — native-only side effects; guarded by `Capacitor.isNativePlatform()`.
- `web-push.ts` / `WebNotificationsBanner.tsx` / `WebPushSetup.tsx` — web-only; guarded by `isWebPushSupported()` (false on native).
