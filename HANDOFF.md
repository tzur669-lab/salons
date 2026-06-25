# Salons — Handoff (Start Here)

**GitHub:** https://github.com/tzura669-lab/salons  
**Deployed:** Vercel (auto-deploy on push to main) — https://salonss.vercel.app  
**Firebase project:** `salons-19a2e`  
**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Firebase (Auth + Firestore + Storage + Messaging) · Firebase Admin SDK (API routes) · Resend (email) · Capacitor 8 (native, deferred for MVP)

---

> 🛑 **GOLDEN RULE — UPDATE THIS FILE BEFORE EVERY `git push`.**
> Never push to GitHub without first updating `HANDOFF.md`: add a new dated **Changelog** entry
> (session N+1) describing what changed and why, and update any affected section above.
> The handoff is the single source of truth for the next session. **No exceptions.**

---

## What This Is

**Salons** is a multi-tenant booking platform for neighborhood nail technicians. Each salon has a unique URL segment (`/[salonId]`), its own data in Firestore (`salons/{salonId}/...`), and one owner (the technician). Clients book at `/[salonId]/book`; owners manage at `/[salonId]/admin`. A technician self-registers via `/onboard` with a shared invite code.

This codebase was forked from **Roni Nails** (single-tenant, `github.com/tzura669-lab/roni-nails`) and converted. The original Roni Nails project is **100% untouched** and continues to run independently.

---

## Core Architecture

```
Client (Web browser / PWA)
  └─ Next.js App Router (src/app/)
       ├─ /                      → Static landing page ("enter your salon link")
       ├─ /onboard               → Self-serve salon registration wizard
       ├─ /[salonId]/            → Per-salon public & client pages
       │    ├─ page.tsx          → Salon home
       │    ├─ book/             → Booking wizard
       │    ├─ clinic/           → Salon info (address, hours, payment)
       │    ├─ login/            → Auth (login/register)
       │    ├─ my-appointments/  → Client's appointments
       │    ├─ profile/          → Account settings
       │    ├─ guest/            → Guest appointment lookup (token-based)
       │    ├─ reset-password/   → Password reset
       │    └─ admin/*           → Owner-only management pages (guarded by isOwner)
       └─ /api/*                 → Flat server routes; each accepts salonId in body/query

Context
  ├─ SalonProvider (src/contexts/SalonProvider.tsx)
  │    Loads salons/{salonId} from Firestore; exposes { salonId, salon, isOwner, loading }
  │    isOwner = user.uid === salon.ownerUid   ← REPLACES global isAdmin
  │    Mounted in [salonId]/layout.tsx (wraps all salon pages)
  │    Redirects to "/" if salon not found or inactive
  ├─ AuthProvider/useAuth — one global Firebase Auth listener (providers.tsx)
  ├─ AdminNotificationsProvider — mounted inside SalonProvider in [salonId]/layout.tsx
  │    Active only when isOwner && !loading; subscribes to salons/{salonId}/appointmentsPending
  └─ useBookingStore — Zustand: 4-step booking wizard state

Server (Next.js API routes — Firebase Admin SDK, never run client-side)
  ├─ /api/onboard                — Validate invite code → create salons/{salonId} + subcollections
  ├─ /api/availability           — PUBLIC: bookable slots for one day, requires {salonId, dayKey, serviceDuration}
  ├─ /api/appointments           — Create appointment under salons/{salonId}/appointmentsPending
  ├─ /api/notify-admin           — Email owner (reads ownerUid → users/{ownerUid}.authEmail) + FCM push
  ├─ /api/notify-client-approval — Owner-gated (verifySalonOwner): push client on approval
  ├─ /api/cancel-appointment     — Client cancels own pending appointment (ID-token auth)
  ├─ /api/reschedule-request     — Client reschedules (Bearer auth + booking-lock txn)
  ├─ /api/guest/appointment      — Look up appointment by guest token within salon
  ├─ /api/guest/cancel           — Cancel guest appointment within salon
  ├─ /api/cron/appointment-reminders — Cross-salon collectionGroup sweep; per-salon owner push
  ├─ /api/cron-status            — Owner-gated: reminder cron heartbeat
  ├─ /api/notify-update          — Owner-gated: broadcast push to all salon clients
  ├─ /api/admin/rate-limits      — Owner-gated: list/clear loginRateLimit counters
  ├─ /api/admin-test-push        — Owner-gated: test push to owner's own device
  ├─ /api/self-test-push         — Any user: test push to own devices
  ├─ /api/bootstrap-admin        — RETIRED: returns 410 Gone (use /api/onboard)
  └─ /api/login-by-name, /api/delete-account, /api/register-push-token, etc. — global/per-user

Data Layer (Firestore)
  salons/{salonId}/              ← ROOT tenant anchor doc { slug, displayName, ownerUid, status, createdAt }
    clinicSettings/main          ← ClinicSettings (name, address, hours, gallery, links)
    paymentSettings/main         ← PaymentSettings (Bit/Paybox phone, QR)
    services/{id}                ← Service catalog
    availabilityRules/{id}       ← Recurring + one-time open hours
    blockedTimes/{id}            ← Explicit closed periods
    appointmentsPending/{id}     ← pending + change_requested
    appointmentsApproved/{id}    ← upcoming approved
    appointmentsRejected/{id}    ← rejected + cancelled
    appointmentsCompleted/{id}   ← past completed
    clientNotes/{id}             ← Owner-only notes per client
    slotLocks/{dayKey}           ← Per-day booking mutex (server-only, deny-all rules)

  GLOBAL (not per-salon):
    users/{uid}                  ← AppUser (one shared account across salons)
    pushTokens/{uid}/tokens/{hash} ← FCM device tokens
    loginRateLimit/{key}         ← Name-login rate limits (server-only)
    cronStatus/{id}              ← Reminder cron heartbeat (global)
    inviteCodes/{code}           ← Onboarding invite codes (server-only, deny-all)
```

**Why nested subcollections:** Firestore rules scope by path (`isSalonOwner(salonId)`), so tenant isolation is structural. A forgotten `where("salonId"==…)` can never leak another salon's data.

---

## Non-Obvious Rules — Do Not Break

| Rule | Where | Why |
|------|--------|-----|
| **Update `HANDOFF.md` before every `git push`** | this file | The handoff is the next session's source of truth. Every push must be preceded by a new Changelog entry + any affected-section updates. No exceptions. |
| `isOwner = user.uid === salon.ownerUid` — NEVER global admin | `SalonProvider`, `admin/layout.tsx`, all API routes | Admin-ness is per-salon. Global `ADMIN_UID` / `role:"admin"` are retired. Each salon has exactly one owner set at onboarding. |
| All API routes use `verifySalonOwner(authHeader, salonId)` | `src/lib/admin-auth.ts` | Verifies the ID token AND checks `salons/{salonId}.ownerUid == uid`. Cannot be replaced with a simple token check. |
| `salonId` is always validated server-side | every API route | Routes check that `salons/{salonId}` exists and has `status: "active"` before doing any work. |
| `register-push-token` derives uid from the **ID token**, never the body | `api/register-push-token`, `push.ts`, `web-push.ts`, `useAuth.logout` | Security: anyone could register a device under another uid. uid always comes from the verified Bearer token. |
| Client cancellation goes through `/api/cancel-appointment` | `my-appointments/page.tsx` | Moving docs pending→rejected is admin-only in the rules; the API route does it via Admin SDK. |
| `notify-admin` trusts only `{salonId, appointmentId}` | `api/notify-admin` | Unauthenticated (guests book); reads the real pending doc as source of truth; HTML-escaped; idempotent via `adminNotifiedAt`. Email goes to the OWNER (reads `salons/{salonId}.ownerUid` → `users/{ownerUid}.authEmail`), never a global ADMIN_EMAIL. |
| Root layout is NOT `force-dynamic` | `app/layout.tsx` | All pages prerender `○ Static` (CDN-served). Do not add `export const dynamic`. |
| Slot availability is computed SERVER-side | `api/availability` | Clients must NOT read appointment collections directly. Privacy + read-cost. |
| Appointment-list rules require auth | `firestore.rules` | `list: if request.auth != null` on all appointment collections. |
| `useAuth()` must be inside `<AuthProvider>` | `hooks/useAuth.tsx`, `providers.tsx` | Context consumer — throws if used outside provider. Layout-level components above `<Providers>` must NOT call `useAuth`. |
| `useSalon()` must be inside `<SalonProvider>` | `contexts/SalonProvider.tsx`, `[salonId]/layout.tsx` | Context consumer — all components under `[salonId]/` can use it; components at root level cannot. |
| `AdminNotificationsProvider` is INSIDE `SalonProvider` | `[salonId]/layout.tsx` | It uses `useSalon()` — must be mounted after `SalonProvider`. Was previously at root (before multi-tenant). |
| Double-booking prevented by per-DAY mutex transaction | `lib/server/booking-lock.ts` | `salons/{salonId}/slotLocks/{dayKey}` is read+written inside the create/reschedule transaction. The overlap check runs INSIDE the transaction. Locks are permanent reused mutexes. |
| Reminder cron uses `collectionGroup("appointmentsApproved")` | `api/cron/appointment-reminders` | Queries across all salons. `salonId` extracted from `doc.ref.parent.parent?.id`. Requires composite indexes in `firestore.indexes.json`. |
| `salonId` slug is URL-safe and unique | `api/onboard` | Generated from `displayName` via `slugify()`, collision-checked before write. Max 30 chars. Cannot be changed after creation (it IS the Firestore doc ID and URL segment). |
| Invite codes are server-only (deny-all in rules) | `firestore.rules`, `api/onboard` | Only Admin SDK can read/write `inviteCodes/`. The onboard route validates and atomically decrements `uses`. |
| Storage paths are per-salon | `lib/storage.ts`, `storage.rules` | All uploads go to `salons/{salonId}/...`. The Storage rules verify `salons/{salonId}.ownerUid == request.auth.uid` using `firestore.get(...)`. |
| All calendar math is Asia/Jerusalem | `lib/timezone.ts` | One source of truth: `israelWallTimeToInstant`, `israelDayKey`, etc. DST-aware via Intl, no dependency. |
| Reminder `reminderSentAt` = *delivered*, never *attempted* | `api/cron/appointment-reminders` | Claim→send→confirm. `reminderSentAt` only set after ≥1 device delivery. Failures clear the claim and retry next run. |
| Guest recovery is token-authorized, hash-stored | `api/appointments`, `lib/server/guest-token.ts`, `api/guest/*` | Token is scoped to one appointment + one salon. Never a session. Hash stored, plaintext returned once. |
| `servicePrice` is snapshotted at booking | `api/appointments` | Revenue reports read the price stored on the appointment, not the live `services` price. |
| Firebase Admin SDK only in `/api/*` and `lib/firebase-admin.ts` | server-only | Never import into a client component. Uses `FIREBASE_PRIVATE_KEY`. |
| WhatsApp uses `openWhatsApp()` (`whatsapp://` scheme), not `wa.me` | `lib/open-external.ts` | The `wa.me` redirect failed on iOS and corrupted the 🤍 emoji. Also: iOS standalone PWA must navigate via `window.location.href`, NOT `window.open`. |
| `authDomain` forced to the Salons Vercel domain | `firebase.ts`, `next.config.ts` | iOS standalone PWA: a `firebaseapp.com` authDomain makes `signInWithRedirect` cross-origin → iOS/ITP blocks it. `/__/auth/*` is reverse-proxied to `salons-19a2e.firebaseapp.com`. |

---

## Data Flow: Booking a Slot

```
User arrives at /{salonId}/book
  → SalonProvider loads salons/{salonId} (salon name, owner info)
User selects service
  → Zustand step 1 → 2
User selects date
  → POST /api/availability { salonId, dayKey, serviceDuration }
  → server validates salon exists + active
  → reads salons/{salonId}/availabilityRules + blockedTimes + day's appointments
  → generateDaySlots() → returns anonymous { startTime, endTime, available }[]
User picks slot → Zustand step 2 → 3
User confirms (or fills GuestForm)
  → createAppointment() → salons/{salonId}/appointmentsPending
  → POST /api/notify-admin { salonId, appointmentId }
    → reads salon.ownerUid → users/{ownerUid}.authEmail → Resend email
    → FCM push to owner's devices
    → approval URL: /{salonId}/admin/appointments
Owner approves
  → updateAppointmentStatus(salonId, id, "approved") → salons/{salonId}/appointmentsApproved
  → POST /api/notify-client-approval { salonId, appointmentId, clientId }
  → openExternal(buildWhatsAppApprovalLink())
```

---

## Authentication Flows

| Method | How | Notes |
|--------|-----|-------|
| Google (web) | `signInWithPopup`, redirect fallback | Auto-creates `users` doc on first sign-in; `role: "client"` always |
| Email + password | `signInWithEmailAndPassword` / `createUserWithEmailAndPassword` | Email optional → placeholder `noemail_<ts>@placeholder.com` |
| Name + password | `/api/login-by-name` → custom token | Rate-limited, ambiguity-aware |
| Forgot password (email) | `ForgotPassword.tsx` → `/{salonId}/reset-password` | Standard Firebase email reset |
| Forgot password (SMS) | `ForgotPassword.tsx` → `/api/reset-password-by-phone` | OTP proves phone → server resolves real account, resets, links phone |
| Recover when locked out | `lib/contact-manager.ts` | WhatsApp to salon owner (number from `clinicSettings`), pre-filled Hebrew message |

---

## Key Files

| File | Responsibility |
|------|---------------|
| `src/types/index.ts` | All shared TypeScript types (includes `Salon` type) |
| `src/contexts/SalonProvider.tsx` | **NEW** Per-salon context: loads `salons/{salonId}`, exposes `{ salonId, salon, isOwner, loading }` |
| `src/lib/salon-path.ts` | Client-side path helpers: `salonCol(salonId, name)`, `salonSubDoc(salonId, col, id)` |
| `src/lib/server/salon-path-admin.ts` | Server-side Admin SDK helpers: `adminSalonCol(db, salonId, name)` |
| `src/lib/firestore/salons.ts` | `getSalon()`, `getSalonByOwner()`, `subscribeToSalon()` (client SDK) |
| `src/lib/firebase.ts` | Client Firebase init — no `ADMIN_UID` export (retired) |
| `src/lib/firebase-admin.ts` | **Server-only** Admin SDK init: `adminAuth`, `adminDb`, `adminMessaging` |
| `src/lib/admin-auth.ts` | **Server-only** `verifySalonOwner(authHeader, salonId)` + `adminErrorStatus()` |
| `src/lib/booking-logic.ts` | `generateDaySlots()` — pure, tz-correct slot generation |
| `src/lib/timezone.ts` | Asia/Jerusalem helpers (DST-aware, no dep) |
| `src/lib/storage.ts` | Firebase Storage upload: `uploadClinicPhoto(salonId, file)` → `salons/{salonId}/clinic/...` |
| `src/lib/server/booking-lock.ts` | Per-day mutex: `readLockAndCheckOverlap(db, tx, salonId, dayKey, ...)` |
| `src/lib/server/guest-token.ts` | Guest token lookup within `salons/{salonId}/` subcollections |
| `src/app/[salonId]/layout.tsx` | Async server layout: awaits `params.salonId` → `SalonProvider > AdminNotificationsProvider` |
| `src/app/[salonId]/admin/layout.tsx` | Admin guard: `isOwner` check (redirects to `/{salonId}` if not owner) |
| `src/app/onboard/page.tsx` | **NEW** 2-step self-serve registration wizard (invite code + salon details) |
| `src/app/api/onboard/route.ts` | **NEW** Validate invite code, slugify name, atomically create salon + settings + availability |
| `src/app/api/cron/appointment-reminders/route.ts` | Cross-salon: `collectionGroup("appointmentsApproved")`, extracts salonId from doc path |
| `src/hooks/useAuth.tsx` | `AuthProvider` + `useAuth()` — `role: "client"` always; no global admin concept |
| `src/components/notifications/AdminNotificationsProvider.tsx` | Uses `useSalon()` for `isOwner` + `salonId`; subscribes to pending appointments |
| `src/components/shared/Navbar.tsx` | Salon-scoped nav links; brand name from `salon.displayName`; admin item when `isOwner` |
| `src/components/shared/WhatsAppFab.tsx` | Uses `useSalon()` for `salonId` → `getClinicSettings(salonId)` |
| `firestore.rules` | Multi-tenant rules: all tenant data under `match /salons/{salonId}/` with `isSalonOwner()` |
| `storage.rules` | Per-salon Storage: public read, owner-only write (via `firestore.get`) |
| `firestore.indexes.json` | Includes composite indexes for `collectionGroup("appointmentsApproved")` |

---

## Environment Variables Required

**Client (`NEXT_PUBLIC_*`) — safe to expose, set in Vercel:**
```env
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        ← must be the Vercel domain (see authDomain rule)
NEXT_PUBLIC_FIREBASE_PROJECT_ID         ← salons-19a2e
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
NEXT_PUBLIC_FIREBASE_VAPID_KEY          ← FCM Web Push (Firebase Console → Cloud Messaging → Web Push)
NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID        ← native Google sign-in (Web OAuth client)
NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID        ← native iOS Google sign-in
```

**NO `NEXT_PUBLIC_ADMIN_UID`** — retired. Admin-ness is per-salon via `salon.ownerUid`.

**Server-only — NEVER prefix with `NEXT_PUBLIC_`:**
```env
FIREBASE_PROJECT_ID                     ← salons-19a2e
FIREBASE_CLIENT_EMAIL                   ← Service account email
FIREBASE_PRIVATE_KEY                    ← Service account key (escaped \n; code does .replace(/\\n/g,"\n"))
FIREBASE_SERVER_API_KEY                 ← Firebase Web API key (for REST password verification)
RESEND_API_KEY                          ← email sending
CRON_SECRET                             ← random string; sent as Bearer by the cron scheduler
APP_URL                                 ← https://salonss.vercel.app (used in owner approval emails)
```

**NO `ADMIN_EMAIL`** — retired. Owner email is read from `users/{ownerUid}.authEmail` at runtime.

Set all of these in Vercel Dashboard → Settings → Environment Variables.

---

## Deploying Firebase Rules & Indexes

Rules and indexes are **not** auto-deployed by Vercel. After editing, deploy manually:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

Or deploy individually via Firebase Console → Firestore → Rules tab.

⚠️ **Code-first ordering:** push the new code to Vercel first, then deploy rules.

---

## First Salon Setup (Seeding)

1. Create an invite code in Firebase Console → Firestore → `inviteCodes/` → new doc:
   - ID: any string (e.g. `SALON2025`)
   - Fields: `active: true`, `maxUses: 10`, `uses: 0`

2. A technician navigates to `/onboard`, enters the invite code + 4 fields (name, phone, address, hours) → clicks "סיים הרשמה" → lands at `/{salonId}/admin`

3. The owner then:
   - Fills in services at `/{salonId}/admin/services`
   - Adjusts availability at `/{salonId}/admin/availability`
   - Sets payment details at `/{salonId}/admin/payment`
   - Shares their booking link: `/{salonId}/book`

---

## Appointment Status Lifecycle

```
pending → approved   (owner approves → salons/{salonId}/appointmentsApproved, push + WhatsApp)
        → rejected   (owner rejects  → salons/{salonId}/appointmentsRejected)
        → cancelled  (client or owner cancels → appointmentsRejected)
pending/approved → change_requested  (client requests reschedule → appointmentsPending)
approved → completed (endTime passed → cron moves to appointmentsCompleted)
```

---

## Testing & CI

- `npm test` — vitest unit suite. Covers `timezone.ts` and `booking-logic.ts` (pure modules, Israel-tz invariants).
- `npm run build` — Next.js build; all pages must show `○ Static` or `ƒ Dynamic`; zero TypeScript errors.
- On Windows: if `npm test` errors with `@rolldown/binding-win32-x64-msvc`, run `npm install @rolldown/binding-win32-x64-msvc --no-save`.
- `.github/workflows/ci.yml` — `npm test` + `next build` on every push/PR.

---

## Further Reading

- [ARCHITECTURE.md](ARCHITECTURE.md) — full module diagram and coupling map
- [SETUP.md](SETUP.md) — Firebase project setup and first-run steps
- [README.md](README.md) — docs index

---

## Changelog

### 2026-06-25 (session 1 — Salons) — Full multi-tenant conversion from Roni Nails

Complete rewrite of the single-tenant "Roni Nails" into the multi-tenant "Salons" platform. The original Roni Nails repo/Vercel/Firebase remain **100% untouched**.

**Phase 0 — New workspace + env:**
- Copied Roni Nails source; deleted `.vercel/`, `node_modules/`, `.next/` (stale); fresh `npm install`
- New `.env.local` pointing at `salons-19a2e` Firebase project
- Updated `firebase.ts` (authDomain fallback → Salons Vercel domain), `next.config.ts` (proxy target → `salons-19a2e.firebaseapp.com`), `public/manifest.json` + `layout.tsx` (branding → "Salons 💅")
- New `.firebaserc` pointing at `salons-19a2e`

**Phase 1 — Data-access layer:**
- New `src/lib/salon-path.ts` — client path helpers: `salonCol(salonId, name)`, `salonSubDoc(salonId, col, id)`
- New `src/lib/server/salon-path-admin.ts` — Admin SDK helpers: `adminSalonCol(db, salonId, name)`
- New `src/lib/firestore/salons.ts` — `getSalon()`, `getSalonByOwner()`, `subscribeToSalon()`
- Updated `settings.ts`, `appointments.ts`, `services.ts` — all functions now take `salonId` as first param; all Firestore paths go through `salonCol()`/`salonSubDoc()`
- Updated `booking-lock.ts` — `readLockAndCheckOverlap(db, tx, salonId, dayKey, ...)` (salonId as 3rd arg)

**Phase 2 — Firestore rules:**
- Rewrote `firestore.rules` — all tenant data under `match /salons/{salonId}/` with `isSalonOwner(salonId)` helper
- Preserved all invariants: `validNewAppointment()`, `ownerKeepsCriticalFields()`, deny-all `slotLocks`/`loginRateLimit`
- Added deny-all `inviteCodes/` (server-only)
- Added `collectionGroup` composite indexes to `firestore.indexes.json` for `appointmentsApproved` cron queries

**Phase 3 — API routes:**
- All routes: added `salonId` to body/query schema, validate salon exists + active before doing any work
- `admin-auth.ts`: `verifyAdminRequest()` → `verifySalonOwner(authHeader, salonId)` (verifies token + checks `salon.ownerUid`); added `adminErrorStatus()`
- `notify-admin`: owner email read from `salons/{salonId}.ownerUid` → `users/{ownerUid}.authEmail`; approval URL → `/{salonId}/admin/appointments`
- `cron/appointment-reminders`: full cross-salon rewrite using `collectionGroup("appointmentsApproved")`; extracts `salonId` from `doc.ref.parent.parent?.id`; per-salon `salonName` in push body
- `bootstrap-admin`: retired → returns 410 Gone
- `guest-token.ts`: now takes `salonId` as first param; searches within `salons/{salonId}/` only
- All owner-gated routes: `verifyAdminRequest` → `verifySalonOwner`

**Phase 4 — Routing refactor:**
- All pages moved under `src/app/[salonId]/`
- New `src/contexts/SalonProvider.tsx` — loads `salons/{salonId}`, exposes `{ salonId, salon, isOwner, loading }`, redirects to "/" if salon not found/inactive
- `[salonId]/layout.tsx` — async server layout (Next.js 16 `params: Promise<...>`); wraps in `SalonProvider > AdminNotificationsProvider`
- `[salonId]/admin/layout.tsx` — guard on `isOwner` (not `isAdmin`); nav links salon-scoped; brand from `salon.displayName`
- `AdminNotificationsProvider` — moved from root `providers.tsx` into `[salonId]/layout.tsx`; now uses `useSalon()` for `isOwner` + `salonId`
- `providers.tsx` — simplified to just `QueryClientProvider + AuthProvider`
- Root `page.tsx` — static landing page ("Salons 💅" + link to /onboard)
- All pages: `useSalon()` for `salonId`/`salon`; all API fetch bodies include `salonId`; all internal links salon-scoped
- `Navbar`, `WhatsAppFab`, `RescheduleModal` — salon-scoped
- `useAuth.tsx` — removed `ADMIN_UID`/`ADMIN_EMAIL`, `looksLikeAdmin()`, `bootstrapAdminRole()`; all users get `role: "client"`; `isAdmin` always false (admin-ness is now per-salon ownership)
- `ForgotPassword.tsx` + `contact-manager.ts` — pass `salonId` to `contactManagerForRecovery()`
- `ResetPasswordForm.tsx` — moved to `[salonId]/reset-password/`; uses `useSalon()` for salon name + login link

**Phase 5 — Onboarding wizard:**
- `src/app/onboard/page.tsx` — 2-step wizard: step 1 (invite code + name + phone), step 2 (address + hours + open days)
- `src/app/api/onboard/route.ts` — verifies Bearer token; validates invite code; generates unique slug from `displayName` via `slugify()`; atomically creates `salons/{salonId}`, `clinicSettings/main`, `paymentSettings/main`, default `availabilityRules` (one per open day); consumes invite code; returns `{ salonId }` → client redirects to `/{salonId}/admin`

**Phase 6 — Storage:**
- `storage.ts` — `uploadClinicPhoto(salonId, file)` → `salons/{salonId}/clinic/home-photo-{ts}`
- New `storage.rules` — public read; owner-only write (verifies via `firestore.get`); 10 MB max; images only
- `firebase.json` — added `storage.rules` reference

**Build fixes:**
- `[salonId]/layout.tsx` — `params: Promise<{salonId:string}>` (Next.js 16 requirement for async layout)
- `admin/appointments/page.tsx` — removed dead `hasLegacyAppointments`/`migrateFromLegacyCollection` imports (migration helpers from Roni Nails, irrelevant in fresh multi-tenant project)
- `useAuth.tsx` — removed last stale `ADMIN_UID` reference (one line missed in Phase 4)

`npm run build` passes clean. All 22 `[salonId]/*` pages register as `ƒ Dynamic`; `/` and `/onboard` as `○ Static`.

---

_Forked from Roni Nails history (sessions 1–21). Prior changelog entries (pre-Salons) archived below for reference._

---

## Archived Changelog (Roni Nails sessions 1–21)

<details>
<summary>Click to expand (original single-tenant history)</summary>

### 2026-06-14 (session 21) — Phase 1+2: locking, reminder fix, guest recovery, reschedule, calendar, reports
*(Full entry preserved in git history of roni-nails repo)*

### 2026-06-14 (session 20) — PWA home-screen name fix
### 2026-06-12 (session 19) — iOS PWA launch-time push + WhatsApp buttons fixed
### 2026-06-12 (session 18) — Guest Details-tab fix, calendar-button gating, cancel success popup
### 2026-06-11 (session 17) — Admin block-release tool, custom broadcast, self-hosted signed APK
### 2026-06-11 (session 16) — Stop Google sign-in email recurring every login
### 2026-06-11 (session 15) — Spam-folder guidance for OTP SMS + reset emails
### 2026-06-11 (session 14) — Password recovery restored (email + SMS) + WhatsApp fallback
### 2026-06-10 (session 13) — AuthProvider, fail-closed states, write-validation rules, cron heartbeat
### 2026-06-10 (session 12) — Server-side availability + timezone
### 2026-06-10 (session 11) — Phase 0 security & perf hardening
### 2026-06-10 (session 10) — iOS PWA Google sign-in fix (part 2)
### 2026-06-09 (session 9) — iOS native project + PWA sign-in fix (part 1)
### 2026-06-05 (session 8b) — WhatsApp deep links + cancel/reject push
### 2026-06-04 (session 8) — iOS notifications (FCM Web Push) + multi-device tokens
### 2026-06-04 (session 7) — Notification diagnostics
### 2026-06-02 (session 6) — Client approval push notification
### 2026-06-01 (session 5) — Branding fix + appointment reminders cron
### 2026-06-01 — Capacitor, name-login, notifications, account deletion
### 2026-05-27 (session 3) — Today booking, completed collection, manual admin add
### 2026-05-27 (session 2) — Optional email, completed status, bulk availability
### 2026-05-27 — Initial critical bug fixes + monthly calendar

</details>

_Last updated: 2026-06-25 (session 1 — Salons)_
