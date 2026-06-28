# Salons — Handoff (Start Here)

**GitHub:** https://github.com/tzura669-lab/salons  
**Deployed:** Vercel (auto-deploy on push to main) — https://salonss.vercel.app  
**Firebase project:** `salons-19a2e`  
**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Firebase (Auth + Firestore + Storage + Messaging) · Firebase Admin SDK (API routes) · SendGrid (email) · Capacitor 8 (native, deferred for MVP)

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
  ├─ /api/appointments           — Create appointment under salons/{salonId}/appointmentsPending (via bookSlotTx)
  ├─ /api/admin/appointments     — Owner-gated manual create via bookSlotTx (same per-day lock; no double-booking)
  ├─ /api/notify-admin           — Email owner (reads ownerUid → users/{ownerUid}.notificationEmail ?? authEmail) + FCM push
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
  salons/{salonId}/              ← ROOT tenant anchor doc { slug, displayName, ownerUid, status, bookingUrl, createdAt }
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
    clients/{uid}                ← Per-salon client directory (server-write, owner-read; scopes admin client list + broadcasts)
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
| `notify-admin` trusts only `{salonId, appointmentId}` | `api/notify-admin` | Unauthenticated (guests book); reads the real pending doc as source of truth; HTML-escaped; idempotent via `adminNotifiedAt`. Email goes to the OWNER via SendGrid (reads `salons/{salonId}.ownerUid` → `users/{ownerUid}.notificationEmail`, falling back to `authEmail` if unset), never a global ADMIN_EMAIL. |
| Root layout is NOT `force-dynamic` | `app/layout.tsx` | All pages prerender `○ Static` (CDN-served). Do not add `export const dynamic`. |
| Slot availability is computed SERVER-side | `api/availability` | Clients must NOT read appointment collections directly. Privacy + read-cost. |
| Appointment `list` is owner-OR-self | `firestore.rules` | `list: if isSalonOwner(salonId) \|\| (request.auth != null && resource.data.clientId == request.auth.uid)` on all four status collections. Non-owner client queries MUST carry `where("clientId","==",uid)` or Firestore rejects them. Verified by `npm run test:rules`. |
| All slot-allocating writes go through `bookSlotTx` | `lib/server/booking-lock.ts`, `/api/appointments`, `/api/admin/appointments` | The per-day mutex + overlap check live in one primitive. Never create/reschedule an appointment by a direct (client-SDK or Admin) write that skips it — that re-opens double-booking. |
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
    → reads salon.ownerUid → users/{ownerUid}.notificationEmail ?? authEmail → SendGrid email
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
SENDGRID_API_KEY                        ← email sending (SendGrid)
SENDGRID_FROM                           ← verified single-sender address (SendGrid → Sender Authentication)
CRON_SECRET                             ← random string; sent as Bearer by the cron scheduler
APP_URL                                 ← https://salonss.vercel.app (used in owner approval emails)
```

**NO `ADMIN_EMAIL`** — retired, and its last fallback removed. Owner email is read from `users/{ownerUid}.notificationEmail` (falling back to `authEmail`) at runtime.

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

2. A technician navigates to `/onboard`. If not signed in, the page shows an inline
   **login/sign-up** card (Google + email/password) — no pre-existing salon link needed.
   After auth, they enter the invite code + 4 fields (name, phone, address, hours) →
   click "סיים הרשמה" → land at `/{salonId}/admin`

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
- `npm run test:rules` — Firestore security-rules suite (`tests/firestore-rules.test.ts`) on the emulator (`firebase emulators:exec`). Proves the multi-tenant isolation invariants. Requires Java; **`firebase-tools` is pinned to v13** (v14+ needs JDK 21, this env has JDK 17). Excluded from `npm test`.
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

### 2026-06-28 (session 7 follow-up — Salons) — Deploy Storage rules (fix 403 on image upload) + contentType hardening

**Symptom:** uploading a portfolio/home image → `403 (Forbidden)` from
`firebasestorage.googleapis.com/.../salons/{salonId}/gallery/...`.

**Root cause:** the repo's `storage.rules` (owner-write under `salons/{salonId}/**`) had **never been
deployed** to `salons-19a2e` — the bucket still had Firebase's default deny-all rules, so every Storage
write 403'd (the new gallery **and** the existing home-photo uploader). Firestore rules were already
deployed (the app reads salon data), which masked the gap. All other rule conditions were satisfied
(authenticated owner on the owner-guarded admin page, <1 MB after compression, image content-type,
App Check not configured).

**Fix:**
- **Deployed Storage rules:** `firebase deploy --only storage --project salons-19a2e` (CLI logged in as
  tzur669@gmail.com; released to the default bucket `salons-19a2e.firebasestorage.app`).
- **Hardening ([src/lib/storage.ts](src/lib/storage.ts)):** `uploadBytes(..., { contentType:
  optimized.type || file.type || "image/jpeg" })` so a compressed blob with a missing type can never
  trip the rule's `contentType.matches('image/.*')` check.

> ⚠️ Reminder: **Storage/Firestore rules are NOT auto-deployed by Vercel.** After editing
> `storage.rules` / `firestore.rules`, run `firebase deploy --only storage` (or `firestore:rules`).

`npm run build` clean.

### 2026-06-28 (session 7 — Salons) — 🔴 Bit money-routing fix + Portfolio (תיק עבודות) + Instagram on home

**🔴 Critical fix — hardcoded Bit link routed clients to a stranger.**
[src/app/[salonId]/clinic/page.tsx](src/app/[salonId]/clinic/page.tsx) had two fork-leftover
constants — `BIT_PAY_URL` (Roni's personal `bitpay.co.il/app/me/3F9611C3…`) and `GOOGLE_MAPS_URL`
(Roni's location) — and the "תשלום ב-Bit" button rendered **unconditionally** with
`href={payment?.bitPayUrl || BIT_PAY_URL}`. Any salon whose owner never set her own Bit link
sent a paying client to Roni's account. **Fix:** deleted both constants; the payment **card** now
renders only when Bit or Paybox is configured; the **"תשלום ב-Bit" button** renders only when
`payment.bitPayUrl` is set; the **map** renders only when `clinic.googleMapsUrl` is set. Same
poisoned defaults removed from [admin/payment/page.tsx](src/app/[salonId]/admin/payment/page.tsx)
(`bitPayUrl: ""`) and the [admin/clinic](src/app/[salonId]/admin/clinic/page.tsx) `DEFAULT`
(`name: ""`, `googleMapsUrl: ""`). General principle now holds: **anything the owner didn't
configure does not appear to clients.** (`api/onboard` already wrote empty values — data was clean.)

**Portfolio (תיק עבודות).** Reuses the existing `ClinicSettings.galleryImages` field (no migration).
- Admin: the old "גלריה (URLs)" section in `admin/clinic` is now **"תיק עבודות"** with a multi-file
  **drag-and-drop uploader** (loading state disables the dropzone during compression), a thumbnail
  grid with per-image remove, an optional add-by-URL row, and a **40-image cap**.
- New **dedicated page** `src/app/[salonId]/portfolio/page.tsx` (server component): reads the gallery
  server-side; **`redirect()`s to `/[salonId]` when empty** (no dead page for bookmarked links to a
  cleared gallery); renders the new client `src/components/portfolio/PortfolioGallery.tsx`
  (`next/image` grid + tap-to-zoom lightbox).
- Home: a **"תיק עבודות" teaser card** (first ~4 photos) links to the page — shown only when photos exist.

**Instagram on the entry page.** The salon home now shows an **inline Instagram button in the hero**
(brand gradient), only when `clinicSettings.instagramUrl` is set. The existing Instagram button on
"פרטים ומיקום" is unchanged.

**Architecture (from review feedback):**
- **No CLS:** `src/app/[salonId]/page.tsx` and `portfolio/page.tsx` are now **server components**
  that read `clinicSettings` server-side (new `src/lib/server/clinic-read.ts`, reusing the lazy/
  HMR-safe `getAdminDb()`) and pass `instagramUrl`/`galleryImages` as props to client children
  (`HomeContent.tsx`, `PortfolioGallery.tsx`). The new hero/teaser are known at first paint — no
  pop-in. Safe because `ClinicSettings` has **no Timestamp fields** → clean RSC→client serialization.
- **`next/image`** for the portfolio grid + teaser — [next.config.ts](next.config.ts) **already**
  whitelists `firebasestorage.googleapis.com`, so no config change. One-off `<img>` tags elsewhere
  unchanged.
- **Bounded uploads:** [src/lib/storage.ts](src/lib/storage.ts) now validates (jpg/png/webp, ≤15 MB
  input) and **compresses** to ≤~1 MB / ≤1600 px via **`browser-image-compression`** (new dep)
  before upload, for both the new `uploadGalleryPhoto` and the existing `uploadClinicPhoto`. Gallery
  uploads go to `salons/{salonId}/gallery/...` — storage rules already cover `salons/{salonId}/**`
  (no rules change).

**✅ Verification:** `npm run build` clean (`/[salonId]/portfolio` registers `ƒ Dynamic`; `/` + `/onboard`
stay `○ Static`); `npm test` 20/20. New dependency: `browser-image-compression`.

### 2026-06-28 (session 6 — Salons) — Calendar "הוסף ליומן" button + salon share card

**"הוסף ליומן" on calendar page (`src/app/[salonId]/admin/calendar/page.tsx`):**
Added a 📅 "הוסף ליומן" Google Calendar button to each approved appointment card in the calendar view. Appears only when `a.status === "approved"`, below the service name. Uses the existing `buildGoogleCalendarLink` utility (same as the dashboard upcoming list). Event title: `לק {clientName}`, description: `שירות: {serviceName}`, times from the appointment.

**Salon share card on admin dashboard (`src/app/[salonId]/admin/page.tsx`):**

Added a "שיתוף הסלון" card to the admin dashboard (`src/app/[salonId]/admin/page.tsx`), positioned after the stats grid. Each owner now sees two copyable links on their dashboard:

- **כתובת ההזמנה** — `bookingUrl/book` — the direct booking page to share with clients
- **קישור להתקנה** — `bookingUrl` — the PWA root URL; clients open it and Add to Home Screen

Each row has an "העתק" button (copies to clipboard, shows "הועתק ✓" for 2 s) and a "פתח" button (opens in new tab). Visible only to the owner (all `/admin` routes are already owner-guarded by `admin/layout.tsx`).

**Fallback:** if `salon.bookingUrl` is not set (salons onboarded before session 5), the URL is constructed from `NEXT_PUBLIC_APP_URL + salonId`. No Firestore or API changes needed.

`npm run build` passes clean.

---

### 2026-06-26 (session 5 — Salons) — Multi-tenant security hardening (Phase 1 + safe Phase 2/3)

Closed the cross-tenant data-leak and double-booking holes surfaced by an architecture
review, then verified the isolation invariants on the Firestore emulator. **Pre-launch
(test data only), so all rule/collection changes are clean breaking changes — no migration.**

**🔴 Isolation & integrity (Phase 1):**
- **`firestore.rules` — appointment `list` is now owner-OR-self.** All four status collections
  changed from `allow list: if request.auth != null` (any logged-in user could enumerate every
  salon's client names+phones) to
  `list: if isSalonOwner(salonId) || (request.auth != null && resource.data.clientId == request.auth.uid)`.
  Clients keep direct client-SDK self-reads (real-time + offline); the existing
  `getClientAppointments` already filters `where("clientId","==",uid)`, which is what the rule
  requires (Firestore rules are not filters — an unconstrained client query is rejected).
- **Deleted the legacy `salons/{salonId}/appointments` block** (it allowed `create: if true` —
  anonymous writes). Nothing read it.
- **Salon doc identity is now immutable:** `salons/{salonId}` update carries an
  `affectedKeys().hasAny(['ownerUid','slug','createdAt'])` guard — an owner can no longer reassign
  ownership or rewrite the slug/URL.
- **Single booking primitive `bookSlotTx`** (`src/lib/server/booking-lock.ts`): the per-day mutex +
  overlap check + write, extracted from `/api/appointments`. **Admin manual creation now goes
  through it** via the NEW owner-gated route `POST /api/admin/appointments` (replaces the old
  client-SDK `createAdminAppointment`, which bypassed the lock → double-booking). The admin page
  posts date/time strings; the server resolves them in Asia/Jerusalem (also fixes a device-tz bug).
  The pending→approved transition is unchanged — it reuses the slot the pending doc already holds,
  so it is not a slot-allocating op.
- **Per-salon client directory `salons/{salonId}/clients/{uid}`** (`src/lib/server/salon-clients.ts`):
  thin membership record (clientId/name/phone/lastSeenAt, no canonical PII), upserted server-side on
  booking for REGISTERED clients only (guests / free-text walk-ins skipped). Replaces the old
  `getAllClients()` GLOBAL `users` scan. Repointed: admin clients page + new-appointment picker
  (`getSalonClients(salonId)`), and `notify-update` recipients (was a platform-wide blast via
  `getAllUidsWithTokens` → now `listSalonClientUids`). Rule: `clients` is owner-read, server-write.
- **`delete-account` actually erases PII now.** It previously queried ROOT collections that don't
  exist in the multi-tenant model (deleted nothing). Now uses `collectionGroup(...)` keyed by
  `clientId==uid` across all salons to anonymize appointments + delete clientNotes + delete the
  per-salon `clients` entries. Removed the dead `NEXT_PUBLIC_ADMIN_UID` guard and the legacy bucket.
- **App Check** wired in `src/lib/firebase.ts` (browser-only, gated on
  `NEXT_PUBLIC_FIREBASE_APPCHECK_KEY` — no-op until the reCAPTCHA v3 key + Console enforcement are
  set). **`notify-admin`** (unauthenticated) now has a per-IP rate limit.

**🟡 Safe Phase 2 / Phase 3:**
- **Booking-store cross-tenant bleed fixed:** the Zustand wizard resets on `salonId` change
  (`book/page.tsx`), so salon A's service/slot can't carry into salon B.
- **Error envelope:** every `{ error: String(err) }` leak replaced with `"server_error"` (+ kept the
  server-side `console.error`) across notify-update, notify-client-approval, admin/rate-limits,
  register-push-token, cron.
- **Hygiene:** deleted the 10 empty legacy route stub dirs (`src/app/admin`, `/book`, …); removed
  dead `createAdminAppointment`, `createAppointment`, `getActiveAppointmentsForSlots`,
  `requestAppointmentChange` + orphaned imports; gitignored Firebase emulator debug logs.

**➕ Onboarding additions (owner request):**
- Each salon doc now stores a convenience **`bookingUrl`** field (`{APP_URL}/{slug}`), written at
  onboarding (`api/onboard`). Derived from the slug (added `bookingUrl?` to the `Salon` type); the
  app still routes by slug, so it's purely for Console visibility / sharing. Existing salons need a
  one-time manual backfill in the Console (e.g. `gylt-nyyls` → `https://salonss.vercel.app/gylt-nyyls`).
- `/onboard` now has an OPTIONAL **"English name for the URL"** input (`englishName`). When provided it
  becomes the slug (slugified + collision-checked); left empty → the existing auto-transliteration of
  the Hebrew display name (unchanged). Lets owners pick a clean URL (e.g. `gilat-nails`) instead of the
  rough auto-slug (`gylt-nyyls`). NOTE: the auto fallback is the built-in Hebrew→Latin map, not a live
  Google Translate call — true Google-quality transliteration would need an external API.

**✅ Verification (all green):**
- `npm run build` (type gate) ✓ · `npm test` 20/20 ✓
- **NEW: `npm run test:rules`** — Firestore-emulator security-rules suite (`tests/firestore-rules.test.ts`,
  `vitest.rules.config.ts`), **11/11 PASS**: cross-tenant list denied, client self-list allowed,
  anonymous legacy-create denied, ownerUid reassignment denied, clients dir owner-only, slotLocks/
  inviteCodes deny-all. Needs the emulator + Java. **NOTE: `firebase-tools` is pinned to v13** because
  v14+ requires JDK 21 and this environment has JDK 17.

**⏭️ Deferred (documented, NOT done — perf, needs browser QA; safe at MVP scale):**
- Server-side salon prefetch in `[salonId]/layout.tsx` → seed `SalonProvider` (kill the ~200ms
  client-side blank flash). **Directives:** seed via Context and DO NOT re-fetch on mount; convert
  Firestore `Timestamp`→millis/ISO at the RSC boundary (class instances lose methods when serialized).
- React Query adoption for hot reads. **Directives:** `salonId` in EVERY query key; `queryClient.clear()`
  on salon-switch + logout (shared app-level client → cross-tenant cache-bleed risk otherwise);
  `HydrationBoundary`/`initialData` only if/when server-prefetching RQ data.
- `isOwner` redirect must gate on `authReady && salonReady` (server-instant salon + async auth widens
  a false-`!isOwner` window → can bounce a real owner from `/admin`).
- Bound the unbounded appointment queries (date floor + `limit`) — careful: reports/calendar need
  history; bound per-caller, don't blanket `getAllAppointments`.
- One bounded, deduped pending `onSnapshot` (currently always-on + duplicated in `admin/page.tsx`).
- `safeDocs` should surface an error state instead of returning `[]` (masks failures as "empty").

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

### 2026-06-25 (session 2 — multi-tenant cal route + whatsapp fix)

**Bug fix — `cal/[id]/route.ts` was broken for multi-tenant:**
- Old route read from root-level Firestore collections (`appointmentsApproved/{id}`) instead of per-salon subcollections (`salons/{salonId}/appointmentsApproved/{id}`)
- Old route read clinic settings from root `clinicSettings/main` instead of `salons/{salonId}/clinicSettings/main`
- Old route had no `salonId` — could not scope queries to the right tenant

**Fix:**
- Deleted `src/app/cal/[id]/route.ts` (single-tenant legacy)
- Created `src/app/cal/[salonId]/[id]/route.ts` — reads appointments and clinic settings from the correct per-salon paths
- Updated `src/lib/whatsapp.ts` — added `salonId` to `WhatsAppApprovalParams`; cal URL is now `/cal/${salonId}/${appointmentId}`; removed hardcoded "רני" from rejection message
- Updated `src/app/[salonId]/admin/appointments/page.tsx` and `src/app/[salonId]/admin/page.tsx` to pass `salonId` to `buildWhatsAppApprovalLink`
- Added `NEXT_PUBLIC_APP_URL=https://salonss.vercel.app` to `.env.local` (required by `notify-admin` route and `firebase.ts` authDomain logic)

`npm run build` passes clean. `/cal/[salonId]/[id]` registers as `ƒ Dynamic`.

---

### 2026-06-25 (session 3 — per-salon booking-alert emails via SendGrid)

**Problem:** with multiple salons, only the user's own inbox received "new appointment"
emails. Root cause: `notify-admin` sent `from: onboarding@resend.dev` (Resend's shared
*test* sender, which only delivers to the Resend-account owner), and for owners without a
real login email the recipient fell back to a global `ADMIN_EMAIL` (the user's own inbox).

**Changes:**
- Email provider Resend → **SendGrid single-sender** (`@sendgrid/mail`). `from` is the
  verified `SENDGRID_FROM`, with each salon's `displayName` as the sender's display name.
  Removed the `resend` dependency. (`onboarding@resend.dev` only emailed your own inbox;
  SendGrid single-sender delivers to any manager once one sender address is verified.)
- `notify-admin` recipient resolution: `users/{ownerUid}.notificationEmail` (explicit) →
  `authEmail` (if not a `noemail_` placeholder) → send nothing. **Removed the
  `process.env.ADMIN_EMAIL` fallback** — it leaked one salon's bookings into the user's inbox.
- New PRIVATE per-owner field `AppUser.notificationEmail`, stored on the owner-only
  `users/{uid}` doc (NOT `clinicSettings`/`salons`, which are public-read → would expose the
  address). Read by `notify-admin` (same doc it already fetches → zero extra reads).
- Owner sets it in `…/admin/clinic` (new "התראות על תורים" section); optionally seeded at
  `/onboard` (field prefilled from the owner's real login email). New helpers
  `getOwnerNotificationEmail` / `saveOwnerNotificationEmail` in `lib/firestore/settings.ts`;
  `api/onboard` writes it to `users/{uid}` (merge) when provided.
- Env: `RESEND_API_KEY` → `SENDGRID_API_KEY` + `SENDGRID_FROM`. **No Firestore-rules change**
  (owner already may update non-`role` fields on their own user doc).

> ⚠️ Deliverability: a SendGrid single sender from a free `@gmail.com` address may land in
> Spam/Promotions at first (Gmail DMARC). Mark "Not spam" once; or verify a real domain later
> and point `SENDGRID_FROM` at `alerts@yourdomain` — no code change needed.

`npm run build` + `npm test` pass clean.

---

### 2026-06-25 (session 4 — first-login on /onboard)

**Problem:** `/onboard` required an authenticated user, but the only login UI lives at
`/[salonId]/login`, and `SalonProvider` redirects to `/` when the salon doesn't exist. For
the **very first salon** there was no salon to log in through → a chicken-and-egg deadlock
(the page just showed "התחבר תחילה דרך קישור הסלון שלך"). Surfaced after the Vercel
Framework-Preset fix made the deployment reachable (was returning a platform-level 404).

**Fix (no backend change):**
- `src/app/onboard/page.tsx` — when `!user`, render an inline **login/sign-up card**
  (Google via `signInWithGoogle`, or email+password via `signInWithEmail`/`signUpWithEmail`
  from the global `useAuth`). Sign-up is the default mode. On success the global auth
  listener sets `user`, and the page re-renders straight into the registration form (already
  on `/onboard`, so no redirect). Step indicator hidden until signed in.
- Auth is global (one Firebase Auth across all salons), so no new route/rule was needed — the
  technician's account is reused as the salon `ownerUid` when `/api/onboard` runs.

**Note (unrelated, pre-existing):** `package.json` still `"name": "roni-nails"` and
`capacitor.config.ts` still `appName: 'Roni Nail'` + `server.url: roni-nails.vercel.app` —
fork leftovers, not yet rebranded. No effect on the web app.

`npm run build` passes clean; `/onboard` stays `○ Static`.

---

_Last updated: 2026-06-28 (session 7 — Bit fix + Portfolio + Instagram on home)_
