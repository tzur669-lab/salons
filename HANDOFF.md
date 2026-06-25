# Roni Nails — Handoff (Start Here)

**GitHub:** https://github.com/tzura669-lab/roni-nails  
**Deployed:** Vercel (auto-deploy on push to main) — https://roni-nails.vercel.app  
**Mobile:** Capacitor wrapper (Android + iOS), `com.roninails.app`, loads the live Vercel URL  
**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Firebase (Auth + Firestore + Storage + Messaging) · Firebase Admin SDK (API routes) · Resend (email) · Capacitor 8

---

> 🛑 **GOLDEN RULE — UPDATE THIS FILE BEFORE EVERY `git push`.**
> Never push to GitHub without first updating `HANDOFF.md`: add a new dated **Changelog** entry
> (session N+1) describing what changed and why, and update any affected section above
> (Non-Obvious Rules, Data Layer, Env Vars, etc.). The handoff is the single source of truth for
> the next session — a push that leaves it stale breaks that contract. **No exceptions.**

---

## What This Is

A nail salon booking app for "רוני ניילס". Clients book appointments; Roni (admin) approves/rejects them. The app is in Hebrew (RTL), mobile-first. Runs as a web app (Vercel) **and** as a native Android/iOS app (Capacitor wrapping the same live site).

---

## Core Architecture

```
Client (Web browser  OR  Capacitor native WebView)
  └─ Next.js App Router (src/app/)
       ├─ Public pages:  /, /book, /clinic, /login, /my-appointments, /profile, /reset-password
       ├─ Admin pages:   /admin/* (layout.tsx enforces admin-only)
       └─ API routes:    /api/* (server-only, Firebase Admin SDK)

State / Logic
  ├─ AuthProvider/useAuth — ONE auth listener for the app (context). Firebase Auth state + AppUser;
  │                         native Google sign-in; name-login; push init. Mounted in providers.tsx
  ├─ useBookingStore      — Zustand: 4-step booking wizard state
  └─ booking-logic.ts     — Pure function: generates available time slots

Server (Next.js API routes — Firebase Admin SDK, never run client-side)
  ├─ /api/availability           — PUBLIC: bookable slots for ONE day (server-side slot math,
  │                                Israel-tz). The booking client calls this instead of reading the
  │                                appointments collection — returns only anonymous {start,end,available}
  ├─ /api/login-by-name          — name + password → custom token (rate-limited)
  ├─ /api/notify-admin           — emails Roni (Resend) + FCM push on new booking. Takes ONLY
  │                                {appointmentId}; reads the pending doc server-side (source of truth)
  ├─ /api/notify-client-approval — FCM push to client when admin approves their appointment
  │                                (admin auth via shared verifyAdminRequest: env UID OR role:"admin")
  ├─ /api/cancel-appointment     — client cancels their OWN pending request (ID-token auth, Admin-SDK move)
  ├─ /api/register-push-token    — POST saves / DELETE removes a device token. uid comes from the
  │                                verified ID token (Bearer), NEVER from the body
  ├─ /api/cron/appointment-reminders — 1-hour-before reminder push to each client (CRON_SECRET auth).
  │                                Stamps a cronStatus heartbeat on every successful run
  ├─ /api/cron-status            — admin-only: reminder-cron heartbeat age + staleness (dashboard banner)
  ├─ /api/self-test-push         — send a test push to the caller's own devices (any user)
  ├─ /api/push-token-status      — device count + freshness for the caller (diagnostics)
  ├─ /api/notify-update          — admin-only: broadcast an "update available" (or custom) push to
  │                                ALL client devices; tap opens /download. Used by AdminUpdateBroadcast
  ├─ /api/admin/rate-limits      — admin-only: GET lists every loginRateLimit counter, DELETE clears
  │                                one (unblocks a locked-out client). Backs the /admin/blocks page
  ├─ /firebase-messaging-sw.js   — dynamic route serving the Web Push service worker (config injected)
  └─ /api/delete-account         — deletes user (Apple App Store requirement)

Data Layer (Firestore)
  ├─ users/                  — AppUser (role, phone, phoneVerified, authEmail)
  ├─ services/               — Service catalog (public read)
  ├─ appointments/           — LEGACY flat collection (kept for back-compat)
  ├─ appointmentsPending/    — pending + change_requested
  ├─ appointmentsApproved/   — upcoming approved bookings
  ├─ appointmentsRejected/   — rejected + cancelled
  ├─ appointmentsCompleted/  — past completed bookings
  ├─ availabilityRules/      — Recurring + one-time open hours
  ├─ blockedTimes/           — Explicit closed periods
  ├─ clinicSettings/         — Name, address, hours, gallery, WhatsApp/Instagram
  ├─ paymentSettings/        — Bit/Paybox QR (public read — shown on the /clinic guest tab)
  ├─ clientNotes/            — Admin-only notes per client
  ├─ pushTokens/{uid}/tokens/{sha256(token)} — FCM device tokens, ONE doc per device
  │                            (android/ios/web) so multi-device works (server-written).
  │                            Legacy flat `pushTokens/{uid}.token` still read for back-compat.
  ├─ loginRateLimit/{key}    — Name-login + password-reset attempt counter (server-only, rules deny
  │                            all). Admin can list/clear via /admin/blocks → /api/admin/rate-limits
  │                            to unblock a locked-out client without the Firestore console.
  └─ slotLocks/{dayKey}      — Per-DAY booking mutex (server-only, rules deny all). The concurrency
                               anchor that makes double-booking impossible: every booking/reschedule
                               transaction reads+writes its day doc, serializing same-day writes.
                               See lib/server/booking-lock.ts. Never affects displayed availability.
```

> **Appointment storage moved from one flat `appointments/` collection to four status-bucketed collections.** Status changes physically move the document (batch set+delete) between collections. The flat `appointments/` collection is left in the rules for backward compatibility but new writes go to the bucketed collections.

> **New appointment fields (2026-06-14):** `servicePrice` (price snapshot at booking → correct revenue reports), `guestAccessTokenHash` (sha256 of a guest's one-time recovery token), `rescheduleCount` / `originalStartTime` (self-service reschedule), and the reminder-delivery state `reminderClaimedAt` / `reminderAttempts` / `reminderFailed` (`reminderSentAt` now means *confirmed delivered*, not *attempted*).

---

## Non-Obvious Rules — Do Not Break

| Rule | Where | Why |
|------|--------|-----|
| **Update `HANDOFF.md` before every `git push`** | this file | The handoff is the next session's source of truth. Every push must be preceded by a new Changelog entry + any affected-section updates. A stale handoff silently misleads the next session. No exceptions. |
| Admin = `ADMIN_UID` env var OR `role === "admin"` in Firestore | `useAuth.ts`, `firebase.ts`, `lib/admin-auth.ts` | Dual check: belt-and-suspenders. Never remove the env-var check. **Server routes MUST authorize via `verifyAdminRequest()` in `lib/admin-auth.ts`** (env UID OR role) — not an env-UID-only check, or role-admins get 403. |
| `register-push-token` derives uid from the **ID token**, never the body | `api/register-push-token`, `push.ts`, `web-push.ts`, `useAuth.logout` | Both POST + DELETE require `Authorization: Bearer <idToken>`. The old body-`userId` let anyone register a device under the (public) admin UID and siphon every client's pushes. Callers send the header; body `userId` is ignored server-side. |
| Client cancellation goes through `/api/cancel-appointment` | `my-appointments/page.tsx` | Moving a doc pending→rejected is admin-only in the rules, so the old client-side `cancelAppointment()` was silently denied. The route verifies `clientId === uid` then moves it via the Admin SDK. **Admin** cancel still uses the client SDK directly (admin passes `isAdmin()`). |
| `notify-admin` trusts only `{appointmentId}` | `api/notify-admin`, `book/page.tsx` | Unauthenticated (guests book), so it reads the real pending doc as source of truth, escapes all HTML, builds the approval URL from `APP_URL` (not the Origin header), and is idempotent via `adminNotifiedAt`. A notification can't be forged. |
| Root layout is NOT `force-dynamic` | `app/layout.tsx` | Every page is a client component fetching Firebase in the browser → server only emits a static shell. All pages prerender `○ Static` (CDN-served). Do not re-add `export const dynamic`; it reintroduced per-navigation serverless cold-starts. |
| Slot availability is computed SERVER-side | `api/availability`, `book/page.tsx`, `booking-logic.ts` | The booking client posts `{dayKey, serviceDuration}` and gets back anonymous slots. It must NOT read appointment collections directly (that was the privacy + read-cost hole). `generateDaySlots()` is pure + tz-correct. |
| Appointment-list rules require auth | `firestore.rules` | `list: if request.auth != null` on all appointment collections (was `if true`). Safe because the only public slot consumer now goes through `/api/availability`. **Deploy these rules only AFTER the availability code is live** (see Deploying Firestore Rules). |
| `useAuth()` must be inside `<AuthProvider>` | `hooks/useAuth.tsx`, `providers.tsx` | It's now a context consumer (throws if used outside), not a standalone hook — one `onAuthStateChanged` + one `users/{uid}` read for the whole app instead of N. `AuthProvider` wraps everything in `providers.tsx`. Layout-level components above `<Providers>` (NativeSetup/PushPermissionPrompt/WebPushSetup) must NOT call `useAuth`. |
| Appointment creates/updates are validated in rules | `firestore.rules` `validNewAppointment()` / `ownerKeepsCriticalFields()` | create requires `status:'pending'`, the caller's own `clientId` (or `"guest"`), ordered timestamps, length-capped + whitelisted fields. Owner updates can't change status/clientId/time → **no client self-approval**. Admin unrestricted. Manual deploy — test in the Rules Playground first. |
| Data loads fail CLOSED | `book/page.tsx`, `my-appointments/page.tsx` | A failed fetch shows an explicit error + "נסו שוב" retry, never an empty grid/list (which reads as "no slots"/"no appointments"). |
| All calendar math is Asia/Jerusalem | `lib/timezone.ts` | One source of truth: `israelWallTimeToInstant`, `israelDayKey`, `formatIsraelTime`, etc. (DST-aware via Intl, no dependency). Timestamps are absolute instants; "HH:MM" rule strings are Israel wall time. Never use `Date.setHours()` for slot math — it silently used the runtime's tz (device on client, UTC on server). |
| Guests can create appointments without login | `firestore.rules`, `book/page.tsx` | Intentional. `clientId = "guest"` for unauth users. |
| `isAdmin()` in Firestore rules reads the `users` doc | `firestore.rules:5–9` | The `users` doc must exist with `role` set before admin writes work. |
| Slot interval is 5 min | `booking-logic.ts` | `SLOT_INTERVAL_MINUTES = 5`. Duration of service ≠ slot interval. |
| `one_time` availability rule overrides `recurring` | `booking-logic.ts` | `oneTimeRule ?? recurringRule` — one-time wins. |
| Appointment collections `allow list: if true` | `firestore.rules` | Required so guests/clients can compute available slots. Single-doc `get` is auth-only. |
| Status change MOVES the doc between collections | `firestore/appointments.ts` | Batch set+delete. Don't assume an appointment stays in one collection. |
| Double-booking is prevented by a per-DAY mutex transaction | `lib/server/booking-lock.ts`, `api/appointments`, `api/reschedule-request` | `slotLocks/{dayKey}` is read+written inside the create/reschedule transaction. Firestore query reads alone DON'T stop phantom inserts (two concurrent bookings both see an empty slot); the shared day-doc serializes them so the loser retries and sees the committed booking. The overlap re-check runs INSIDE the transaction (excludes self on reschedule). Locks are reused mutexes — never cleaned up, never affect displayed availability. |
| Reminder `reminderSentAt` = *delivered*, never *attempted* | `api/cron/appointment-reminders` | Claim→send→confirm: a per-doc check-and-set transaction claims (`reminderClaimedAt` + `reminderAttempts++`) so concurrent runs can't double-send; `reminderSentAt` is set ONLY after ≥1 device delivery; failures clear the claim and retry next run, up to `MAX_ATTEMPTS` (then `reminderFailed`). A stale claim (>5 min) is retryable. Never pre-stamp before sending. |
| Guest recovery is token-authorized, hash-stored | `api/appointments`, `lib/server/guest-token.ts`, `api/guest/*`, `app/guest` | A guest booking mints a one-time token, returns the plaintext ONCE (confirmation screen → `/guest?t=`), and stores only its sha256 (`guestAccessTokenHash`). `/api/guest/appointment` + `/api/guest/cancel` look up by hash and are IP-rate-limited. Token is scoped to one appointment, never a session. |
| Reschedule reverts the appointment to `pending` | `api/reschedule-request`, `RescheduleModal.tsx` | Self-service reschedule applies the new time and sets status back to `pending` (which reserves the new slot — pending counts as taken — and routes it into the admin's existing approve/reject queue; no new admin UI). Re-fires `notify-admin` (clears `adminNotifiedAt`). Capped at `MAX_RESCHEDULES`. Approved appts move approved→pending in the txn. |
| `servicePrice` is snapshotted at booking | `api/appointments`, `admin/appointments/new`, `admin/reports` | Revenue reports read the price stored ON the appointment, not the live `services` price, so editing a service price later doesn't rewrite history. Older appointments without a snapshot are excluded from revenue (the report notes this). |
| Admin calendar/reports read client-side (admin-gated) | `admin/calendar`, `admin/reports` | Both reuse `getAllAppointments()` / `getAvailabilityRules()` / `getBlockedTimes()` (client SDK, admin-gated by rules) — no new API route. Aggregation/agenda is computed in-memory; fine at single-practitioner volume. |
| No client-side overlap check | `book/page.tsx` | `checkOverlap()` removed — needed a missing composite index. Admin handles duplicates. |
| Client push awaited **before** opening WhatsApp | `admin/page.tsx`, `admin/appointments/page.tsx` | Opening WhatsApp backgrounds the WebView and can abort in-flight fetches. `keepalive: true` extends lifetime, but awaiting first is belt-and-suspenders. Applies to approve **and** cancel/reject (`notifyClientApproved`/`Cancelled`/`Rejected`). |
| Push tokens are PER-DEVICE in a subcollection, not one field | `lib/firestore/push-tokens-admin.ts` | `pushTokens/{uid}/tokens/{sha256}`. Every sender loops all tokens; doc id = sha256(token) so re-registration is idempotent and prune-by-token works. Legacy flat field still read for back-compat. |
| iOS Web Push works ONLY in the installed PWA, iOS 16.4+ | `lib/web-push.ts`, `WebNotificationsBanner.tsx`, `WebPushPermissionPrompt.tsx` | A Safari tab cannot receive push. The banner detects `isStandalonePWA()` and shows an Add-to-Home-Screen guide instead of a dead button. Needs `NEXT_PUBLIC_FIREBASE_VAPID_KEY`. First launch of the installed PWA shows a soft-ask modal (`WebPushPermissionPrompt`) whose button fires the one-shot OS prompt — iOS cannot prompt without a tap; never call `Notification.requestPermission()` outside a gesture-first handler. |
| Web push permission must be requested gesture-first | `lib/web-push.ts` `requestWebPushPermission()` | Safari blocks `Notification.requestPermission()` if any async work runs before it — it is the first call in the button handler. |
| External links use `openExternal()`, not `window.open` | `lib/open-external.ts` | On native, opens system browser (Chrome Custom Tab / Safari). Web falls back to `window.open`. |
| WhatsApp uses `openWhatsApp()` (`whatsapp://` scheme), not `wa.me` | `lib/open-external.ts` | The `wa.me` web→app redirect failed to open WhatsApp on iOS **and** corrupted the astral 🤍 emoji to latin-1 mojibake. Open the `whatsapp://` scheme directly. iOS needs `LSApplicationQueriesSchemes` in `Info.plist`. **On iOS web/PWA too** the scheme is navigated via `window.location.href`, NOT `window.open` — callers await pushes first, the tap's transient activation expires, and Safari silently popup-blocks `window.open`. A visibility-checked 2s timer falls back to `wa.me` when WhatsApp isn't installed. |
| `authDomain` forced to `roni-nails.vercel.app`, NOT `*.firebaseapp.com` | `firebase.ts`, `next.config.ts` | iOS standalone PWA: a default `firebaseapp.com` authDomain makes `signInWithRedirect` cross-origin → iOS/ITP blocks it. `/__/auth/*` is reverse-proxied to `roni-nail.firebaseapp.com` so the handshake stays same-origin. The Web OAuth client must allow `…/__/auth/handler`. A real custom domain still wins. |
| PaymentSettings is publicly readable | `firestore.rules` | Payment details (Bit/Paybox) show on the public `/clinic` ("פרטים") tab, which guests use. `allow read: if true` (was auth-only — it stuck the guest Details tab in an endless spinner). Write stays admin-only. |
| Firebase Admin SDK only in `/api/*` and `lib/firebase-admin.ts` | server-only | Uses `FIREBASE_PRIVATE_KEY`. NEVER import into a client component. |
| Name-login is server-side via Admin SDK + custom token | `/api/login-by-name`, `useAuth.signInByName` | Verifies password against Firebase REST API, returns a custom token. Rate-limited 5 / 15 min per name. Ambiguous names → masked-phone disambiguation. |
| `loginRateLimit` rules deny all client access | `firestore.rules` | Only the Admin SDK (which bypasses rules) touches it. |
| Push token is deleted on native logout | `useAuth.logout` | Session hygiene so the next user on the same device doesn't get the previous user's pushes. |
| Capacitor runs in **remote URL mode** (`server.url`) | `capacitor.config.ts` | The native app loads the live Vercel site, not a bundled build. `webDir: 'public'` only satisfies the sync check + offline `errorPath`. |
| `webContentsDebuggingEnabled` is off by default | `capacitor.config.ts` | Now `process.env.CAP_DEBUG === "true"` → **false** unless you explicitly set `CAP_DEBUG=true` before `cap sync`. A release build can't accidentally ship a remotely-debuggable WebView. |
| Admin account cannot self-delete | `/api/delete-account` | Guarded by `NEXT_PUBLIC_ADMIN_UID` check. |
| SMS password reset resolves the account SERVER-side | `ForgotPassword.tsx`, `/api/reset-password-by-phone` | `signInWithPhoneNumber` on a phone that isn't linked as an Auth provider creates a **ghost** account; resetting client-side set the password on the ghost, not the real user. The route trusts only the verified `phone_number` claim, resets the real account, **links the phone** (so no ghost recurs), and deletes the ghost (guarded: phone-only provider + no email → a real account can never be deleted). Don't reintroduce a client-side `updatePassword` here. |
| `users.phone` is self-asserted (no OTP at signup) | `PhoneInput.tsx` | Intentional — signup stays SMS-free. Residual risk: someone who typed another user's number could SMS-reset them. The reset route sets `phoneVerified:true` only after a real OTP and links the number; same exposure already existed via `SetPasswordForOAuth`. A true fix (OTP in `PhoneInput`) is a deferred follow-up. |

---

## Data Flow: Booking a Slot

```
User selects service                         → Zustand step 1 → 2
User selects date (monthly calendar, 60-day window)
  → POST /api/availability { dayKey, serviceDuration }
  → server reads availabilityRules + blockedTimes + that day's active appointments
  → generateDaySlots() computes available slots (5-min intervals, Israel-tz)
  → returns anonymous { startTime, endTime, available }[] (no client data leaves the server)
User picks slot                              → Zustand step 2 → 3
User confirms (or fills GuestForm if not logged in)
  → createAppointment() → appointmentsPending (status: "pending")
  → POST /api/notify-admin → Resend email + FCM push to Roni's device
Admin approves
  → updateAppointmentStatus("approved") — moves doc to appointmentsApproved
  → POST /api/notify-client-approval → FCM push to client's device (awaited before WhatsApp)
  → openExternal(buildWhatsAppApprovalLink()) — wa.me message w/ Google Calendar link
```

---

## Authentication Flows

| Method | How | Notes |
|--------|-----|-------|
| Google (web) | `signInWithPopup`, redirect fallback if popup blocked | Auto-creates `users` doc on first sign-in |
| Google (native) | `@codetrix-studio/capacitor-google-auth` → `signInWithCredential` | Bypasses WebView OAuth restriction; needs OAuth client IDs in `capacitor.config.ts` + env |
| Email + password | `signInWithEmailAndPassword` / `createUserWithEmailAndPassword` | Email optional at signup → placeholder `noemail_<ts>@placeholder.com`, `authEmail` stored |
| Name + password | `/api/login-by-name` → custom token | For users who don't remember their email. Rate-limited, ambiguity-aware |
| Set password for OAuth user | `SetPasswordForOAuth.tsx` | Google-only users verify via Google re-auth **or** SMS (reauth/link), then set a password. Generalized with a `variant` prop — `"reset"` is also the profile "forgot current password" escape hatch (Google button hidden when no Google provider). |
| Forgot password (email) | `ForgotPassword.tsx` → `/reset-password` page | Standard Firebase email reset (`sendPasswordResetEmail`). Enumeration-safe copy: always shows "אם המייל רשום… נשלח קישור". |
| Forgot password (SMS) | `ForgotPassword.tsx` → `/api/reset-password-by-phone` | OTP proves phone possession → server resolves the **real** account by `users.phone`, resets it, **links the phone provider**, deletes the throwaway ghost phone-account, returns a custom token → `signInWithCustomToken`. No client-side Firestore lookup (was rules-denied). |
| Recover when fully locked out | `lib/contact-manager.ts` | "פנה למנהלת" fallback in both the login modal and profile reset → opens Roni's WhatsApp pre-filled with a Hebrew help message + the user's context. |

---

## Key Files

| File | Responsibility |
|------|---------------|
| `src/types/index.ts` | All shared TypeScript types |
| `src/lib/firebase.ts` | Client Firebase init + `ADMIN_UID` export |
| `src/lib/firebase-admin.ts` | **Server-only** Admin SDK init: `adminAuth`, `adminDb`, `adminMessaging` |
| `src/lib/admin-auth.ts` | **Server-only** `verifyAdminRequest()` — the one admin-authorization check for `/api/*` (env UID OR Firestore role). Mirrors `firestore.rules` `isAdmin()`. |
| `src/lib/booking-logic.ts` | `generateDaySlots(dayKey,…)` — pure, tz-correct slot generation (5-min intervals). No Firebase at runtime. Called server-side by `/api/availability` |
| `src/lib/timezone.ts` | Asia/Jerusalem helpers (DST-aware, no dep): `israelWallTimeToInstant`, `israelDayKey`, `toDayKey`, `parseDayKey`, `weekdayOfDayKey`, `formatIsraelTime` |
| `src/app/api/availability/route.ts` | PUBLIC slot endpoint — server-side reads + `generateDaySlots`, returns anonymous slots |
| `src/lib/whatsapp.ts` | Builds wa.me approval link with Hebrew date |
| `src/lib/google-calendar.ts` | Builds Google Calendar "add event" URL |
| `src/lib/open-external.ts` | Native-aware external link opener (`openExternal`) + `openWhatsApp()` (`whatsapp://` scheme, iOS-safe) |
| `src/lib/push.ts` | Native FCM push registration via `@capacitor-firebase/messaging` (Android/iOS app) |
| `src/lib/web-push.ts` | **Web** FCM push for installed PWAs (iPhone path, iOS 16.4+) — gesture-first permission, SW register, token save |
| `src/lib/firestore/push-tokens-admin.ts` | Admin-SDK token store: `pushTokens/{uid}/tokens/{hash}` save/get/delete; used by every push sender |
| `src/components/native/WebNotificationsBanner.tsx` | Web-only opt-in; iOS shows an Add-to-Home-Screen guide until installed |
| `src/components/native/WebPushSetup.tsx` | Refresh-on-launch for an installed PWA (mounted in `layout.tsx`) |
| `src/app/firebase-messaging-sw.js/route.ts` | Dynamic route serving the Web Push service worker with config injected server-side |
| `src/lib/storage.ts` | Firebase Storage upload helper (clinic photos) |
| `src/lib/firestore/appointments.ts` | Create/read/status updates — moves docs across the 4 collections |
| `src/hooks/useAuth.tsx` | `AuthProvider` (one listener + memoized value) **and** `useAuth()` consumer + `reauthenticateWithGoogle`. All sign-in methods, native Google, name-login, push init |
| `src/store/bookingStore.ts` | Zustand booking wizard (steps 1–4) |
| `src/lib/notify-client.ts` | Builds Hebrew push messages and POSTs to `/api/notify-client-approval` (`keepalive: true`). Shared `notifyClient()` → `notifyClientApproved`/`Cancelled`/`Rejected` |
| `src/app/api/login-by-name/route.ts` | Name+password login (Admin SDK + custom token, rate-limited) |
| `src/app/api/notify-admin/route.ts` | New-booking email (Resend) + FCM push to admin. Reads the pending doc by `{appointmentId}`; HTML-escaped; idempotent (`adminNotifiedAt`); Israel-tz formatting |
| `src/app/api/notify-client-approval/route.ts` | Admin-auth (`verifyAdminRequest`) push to a specific client on status change; prunes dead FCM tokens |
| `src/app/api/cancel-appointment/route.ts` | Client cancels their own pending appointment (ID-token auth → Admin-SDK move pending→rejected) |
| `src/app/api/cron/appointment-reminders/route.ts` | Hourly cron: queries approved appts ≤60 min out, sends personalized push, marks `reminderSentAt`, prunes dead tokens |
| `src/app/api/register-push-token/route.ts` | Store device FCM token per user |
| `src/app/api/delete-account/route.ts` | Account deletion (App Store requirement) |
| `src/app/api/notify-update/route.ts` | **Admin-only** broadcast push to all client devices (default "update available" or custom title/body); tap opens `/download`. Prunes dead tokens |
| `src/app/api/admin/rate-limits/route.ts` | **Admin-only** `GET` list / `DELETE` clear of `loginRateLimit` counters — unblock a rate-limited client |
| `src/app/admin/blocks/page.tsx` | Admin "release a locked-out client" screen (lists blocks, one-tap clear) |
| `src/components/native/AdminUpdateBroadcast.tsx` | Dashboard tool: broadcast an update/custom push to all clients (two-tap confirm) |
| `src/app/download/page.tsx` | Public install page; Android button → self-hosted `public/roni-nails.apk` (`NEXT_PUBLIC_ANDROID_APK_URL` override) |
| `android/app/release.keystore` | **Gitignored** release signing keystore (CN=Roni Nails). Back up off-machine — required for every update |
| `android/keystore.properties` | **Gitignored** signing credentials for `assembleRelease` (see Building & Releasing the Android APK) |
| `src/app/book/page.tsx` | Booking flow — monthly calendar, 5-min slots |
| `src/app/profile/page.tsx` | User profile — email confirm, set password, delete account |
| `src/app/reset-password/` | Password reset page + form |
| `src/app/admin/layout.tsx` | Admin route guard + nav |
| `src/app/admin/page.tsx` | Admin dashboard — today's schedule + pending approvals |
| `src/components/native/NativeSetup.tsx` | Native side effects: status bar + Android back button |
| `src/components/shared/PhoneInput.tsx` | Phone verification modal (Firebase phone auth + reCAPTCHA) |
| `src/components/shared/SetPasswordForOAuth.tsx` | Set-password flow for Google-only accounts (Google or SMS re-auth) |
| `src/components/shared/ForgotPassword.tsx` | Login-screen password-reset modal: email (`sendPasswordResetEmail`) **or** SMS (OTP → `/api/reset-password-by-phone`). Disambiguates when multiple accounts share a phone; "פנה למנהלת" WhatsApp fallback |
| `src/app/api/reset-password-by-phone/route.ts` | **Server-only** SMS reset: verifies the OTP-proven `phone_number` claim (+15-min freshness), resolves the real account, resets password, links phone, deletes ghost, custom token. Rate-limited per phone+IP; admin excluded |
| `src/lib/phone.ts` | Pure phone helpers: `buildFullPhone` (local→E.164), `e164ToLocal` (inverse), `isValidLocalPhone`. Unit-tested |
| `src/lib/server/rate-limit.ts` | **Server-only** shared `rateKey` + `checkRateLimit` (Firestore `loginRateLimit/{key}` fixed-window). Used by login-by-name + reset-password-by-phone |
| `src/lib/contact-manager.ts` | `contactManagerForRecovery()` — total-lockout WhatsApp escape hatch to the manager (number from clinicSettings, opened via `openWhatsApp()`) |
| `capacitor.config.ts` | Native app config (remote URL, OAuth IDs, splash, status bar, push) |
| `firestore.rules` | Security rules — deploy via Firebase Console → Firestore → Rules |

---

## Environment Variables Required

**Client (`NEXT_PUBLIC_*`) — safe to expose, set in Vercel for production:**
```env
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_ADMIN_UID                ← Roni's Firebase UID
NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID     ← native Android Google sign-in (Web OAuth client)
NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID     ← native iOS Google sign-in
NEXT_PUBLIC_FIREBASE_VAPID_KEY       ← FCM Web Push (iPhone PWA). Firebase Console → Cloud
                                        Messaging → Web Push certificates → Generate key pair.
                                        Until set, web push is disabled (no-op).
NEXT_PUBLIC_APP_URL                  ← OPTIONAL. Absolute base URL for the admin approval link
                                        in notify-admin emails. Defaults to
                                        https://roni-nails.vercel.app when unset (never read
                                        from the request Origin/Host header).
```

**Server-only (Admin SDK + integrations) — NEVER prefix with `NEXT_PUBLIC_`:**
```env
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY        ← escaped \n in the value; code does .replace(/\\n/g,"\n")
FIREBASE_SERVER_API_KEY     ← Firebase Web API key, used for REST password verification
RESEND_API_KEY              ← email sending
ADMIN_EMAIL                 ← where new-booking emails are sent
```

Set all of these in Vercel Dashboard → Settings → Environment Variables.

---

## Mobile (Capacitor) Notes

- App ID `com.roninails.app`, name "Roni Nail". Android project lives in `android/`, iOS project in `ios/` (Capacitor 8 + CocoaPods; build/archive on a Mac with Xcode — see [IOS_NATIVE_SETUP_PROMPT.md](IOS_NATIVE_SETUP_PROMPT.md)).
- **Remote URL mode:** the native app loads `https://roni-nails.vercel.app` directly. Web fixes ship instantly to the app on next launch — no rebuild needed. Only native config / plugin changes require a rebuild.
- Native-only behavior: status bar styling + Android hardware back button (`NativeSetup.tsx`), native Google sign-in (`useAuth.ts`), FCM push (`push.ts`), system-browser external links (`open-external.ts`).
- `android/app/google-services.json` is required for FCM/Google sign-in and is **gitignored**. iOS uses `ios/App/App/GoogleService-Info.plist` (committed).
- Offline fallback: `errorPath: '/offline.html'` loads from the bundle when the network is down at launch.
- **WebView debugging** is off by default (`webContentsDebuggingEnabled: process.env.CAP_DEBUG === "true"`). For local debugging, run `cap sync` with `CAP_DEBUG=true`; release builds stay safe automatically.

---

## Appointment Status Lifecycle

```
pending → approved   (admin approves → moves to appointmentsApproved, WhatsApp sent)
        → rejected   (admin rejects  → moves to appointmentsRejected)
        → cancelled  (client cancels via /api/cancel-appointment, or admin cancels → appointmentsRejected)
pending/approved → change_requested  (client requests reschedule → appointmentsPending)
approved → completed (endTime passed → moves to appointmentsCompleted)
```

---

## Deploying Firestore Rules

Rules are **not** auto-deployed by Vercel. After editing `firestore.rules`, deploy manually:

> ⚠️ **Ordering (Phase 1):** the current `firestore.rules` tightens appointment `list`
> to `request.auth != null`. Deploy it **only AFTER** the `/api/availability` code is live
> on Vercel. If you publish the rules first, the still-deployed old booking page (which
> lists appointments as an anonymous guest) breaks. Order: (1) push code → Vercel deploys,
> (2) then publish rules.

**Option A — Firebase Console (no setup needed):**
1. [console.firebase.google.com](https://console.firebase.google.com) → project → Firestore → Rules tab
2. Paste contents of `firestore.rules` → Publish

**Option B — CLI:**
```bash
firebase deploy --only firestore:rules
```
(`firebase.json` + `.firebaserc` are already committed for CLI deploys.)

---

## Building & Releasing the Android APK

The native app loads the live Vercel site (remote-URL mode), so the APK is just a thin shell —
**web/JS fixes do NOT need a new APK**, they ship on `git push`. Rebuild the APK only for native
changes (plugins, `capacitor.config.ts`, icons, version bump). The APK is **self-hosted**:
`public/roni-nails.apk` → `https://roni-nails.vercel.app/roni-nails.apk` (the `/download` page links
to it). The repo is private, so do NOT move the APK back to GitHub Releases (404s for clients).

**Prerequisites (one-time):**
- **JDK 21** is required (Capacitor android libs compile at source release 21; JDK 17 fails with
  `invalid source release: 21`). Use Android Studio's bundled JBR — no separate install needed.
- The signing keystore `android/app/release.keystore` and `android/keystore.properties` must exist
  (both gitignored). If you cloned fresh, restore them from your backup — they are NOT in git.

**Rebuild + ship a new signed APK (PowerShell):**
```powershell
# 1. (only if native config/plugins changed) sync Capacitor
npx cap sync android

# 2. point JAVA_HOME at JDK 21 + load the signing creds (values are in android/keystore.properties)
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:KEYSTORE_PATH="release.keystore"
$env:KEYSTORE_STORE_PASSWORD="<store password>"
$env:KEYSTORE_KEY_ALIAS="roninails"
$env:KEYSTORE_KEY_PASSWORD="<key password>"

# 3. build the signed release APK
.\android\gradlew.bat -p android assembleRelease --no-daemon

# 4. publish it to the site, then push (Vercel redeploys → live in ~1 min)
Copy-Item android\app\build\outputs\apk\release\app-release.apk public\roni-nails.apk -Force
git add public/roni-nails.apk; git commit -m "Update Android APK"; git push
```
Output APK: `android/app/build/outputs/apk/release/app-release.apk`. Verify the signer with
`apksigner verify --print-certs <apk>` (build-tools) → expect `CN=Roni Nails`. Bump `versionCode`
(and `versionName`) in `android/app/build.gradle` for a meaningful new release.

> ⚠️ Always sign with the **same** `release.keystore`. A different keystore (or the debug key)
> changes the signature → Android blocks installing over the existing app (client must uninstall
> first). Keep the keystore + password backed up off-machine.

## Testing & CI

- `npm test` runs the vitest unit suite (`src/**/*.test.ts`). Currently covers the two pure,
  high-stakes modules: `timezone.ts` and `booking-logic.ts`. Keep these green — they encode the
  Israel-tz + slot-generation invariants.
- On Windows, vitest 4 needs its native rolldown binding; if `npm test` errors with
  `@rolldown/binding-win32-x64-msvc`, run `npm install @rolldown/binding-win32-x64-msvc --no-save`
  (CI on Linux resolves its own binding automatically).
- `.github/workflows/ci.yml` runs `npm test` + `next build` on every push/PR (hard gates) and lint
  as advisory. Next high-value test targets: Firestore rules (emulator) and the API routes.

## Further Reading

- [ARCHITECTURE.md](ARCHITECTURE.md) — full module diagram and coupling map
- [SETUP.md](SETUP.md) — Firebase project setup and first-run steps
- [README.md](README.md) — docs index

---

## Changelog

### 2026-06-14 (session 21) — Phase 1+2: locking, reminder fix, guest recovery, reschedule, calendar, reports

Six approved features (Waitlist, No-shows/Deposits, Audit Log were explicitly out of scope).

**Phase 1 — stability/reliability**

1. **Appointment locking (double-booking).** New `lib/server/booking-lock.ts` + `slotLocks/{dayKey}` collection (rules: deny-all). `/api/appointments` create now runs inside `runTransaction`: it reads the day mutex (serialization anchor) + re-queries the day's pending/approved appointments, rejects on overlap (`slot-taken`), else bumps the lock and `tx.create`s the appointment. The old read-then-write gap (two concurrent bookings both passing the availability check) is closed. The optimistic `generateDaySlots` pre-check is kept for cheap rejection. Per-day granularity correctly guards overlapping-but-different-start bookings (per-slot keys wouldn't). Locks are permanent reused mutexes — no cleanup, no effect on displayed availability.
2. **Reminder mechanism fix.** `/api/cron/appointment-reminders` switched from "pre-stamp `reminderSentAt` before send" to **claim→send→confirm**: per-appointment check-and-set transaction claims (`reminderClaimedAt` + `reminderAttempts++`), sends, then sets `reminderSentAt` ONLY for appointments with ≥1 confirmed device delivery. Failures clear the claim and retry next run up to `MAX_ATTEMPTS` (5) → then `reminderFailed`. Stale claims (>5 min) are retryable (crash recovery). Heartbeat `lastResult` now reports `confirmed`/`retrying`/`failedPermanently`. Silent reminder loss on FCM failure is gone.
3. **Guest appointment recovery.** Guests get a one-time token at booking (`/api/appointments` returns plaintext once; stores only `guestAccessTokenHash` = sha256). New `lib/server/guest-token.ts`, `/api/guest/appointment` (view) + `/api/guest/cancel` (cancel) — both IP-rate-limited. New public `/guest?t=<token>` page shows the appointment + cancel + add-to-calendar. Confirmation screen now shows a copyable recovery link for guests.

**Phase 2 — features**

4. **Self-service rescheduling.** New `/api/reschedule-request` (Bearer) re-validates the new slot through the locking transaction (excluding the appt's own slot), applies the new time, and sets the appointment back to `pending` for admin reconfirmation (reusing the existing approve/reject queue — reverting to pending also reserves the new slot since pending counts as taken). Capped at `MAX_RESCHEDULES` (3); records `originalStartTime`/`rescheduleCount`; re-fires `notify-admin`. New `RescheduleModal` (reuses `/api/availability` + `TimeSlotPicker`) wired into `/my-appointments` for pending+approved future appts. Admin appointments list flags rescheduled items.
5. **Admin calendar view.** New `/admin/calendar` (day/week agenda, today shortcut, prev/next) built client-side from `getAllAppointments` + availability rules + blocked times. Shows open-hours window, blocked periods, and time-ordered appointment blocks colored by status. Added to admin nav.
6. **Analytics & reporting.** `servicePrice` now snapshotted onto appointments at booking (both client + admin manual create). New `/admin/reports` (date range, default current month): revenue, served count, unique clients, cancellation rate, revenue-by-service bars, bookings-by-weekday chart, CSV export. Added to admin nav. Revenue is based on appointments with a stored price (older ones excluded; noted in the UI).

**Schema:** added `slotLocks/` collection (rules deny-all) and the new appointment fields above. **Deploy `firestore.rules`** (adds the `slotLocks` deny-all block) per *Deploying Firestore Rules* — code-first ordering still applies. No composite indexes required (guest-token lookup is single-field equality; range queries reuse existing patterns). Tests 20/20, `next build` green, no new lint findings.

### 2026-06-12 (session 19) — iOS PWA: launch-time push soft-ask + WhatsApp buttons fixed

**1. Notification permission is now requested on first launch of the installed PWA (iPhone).**
  Previously nothing prompted at launch on the web/PWA path: `PushPermissionPrompt` is native-only,
  `WebPushSetup` never prompts (refresh-only), and the only opt-in UI (`WebNotificationsBanner`) is
  buried on `/my-appointments` — so a client who installed the PWA and landed on `/` was never asked.
  iOS forbids firing the OS notification prompt without a user gesture (and the prompt is one-shot),
  so the closest compliant "ask immediately" is a soft-ask modal:
  - New **`WebPushPermissionPrompt.tsx`** — web twin of the native soft-ask, mounted in `layout.tsx`
    (above `<Providers>` → reads `auth.currentUser` directly, no `useAuth`). Shows once, ~1.4s after
    first launch, only when: not native, `isStandalonePWA()`, `isWebPushSupported()`, and permission
    is `"default"`. "Allow" calls `requestWebPushPermission()` as the FIRST statement (gesture-first
    rule), then registers the token if a user is signed in; if not signed in, permission is still
    granted per-origin and the token is registered after login (useAuth push init / `WebPushSetup`
    next-launch refresh). "Not now" burns only the soft-ask — the OS prompt stays available via the
    `/my-appointments` banner.

**2. "Approve/Reject/Cancel + WhatsApp" now actually opens WhatsApp on iPhone (PWA).**
  Root cause: in the PWA branch `openWhatsApp()` used `window.open(wa.me)`, but the admin handlers
  `await` the status update + client push first (documented invariant) — by then the tap's transient
  activation has expired and Safari **silently popup-blocks** `window.open` (returns null, no error).
  Fix in **`lib/open-external.ts`** only (all WhatsApp call-sites funnel through it; handlers untouched,
  push-before-WhatsApp invariant preserved):
  - On **iOS web/PWA**, convert to the `whatsapp://` scheme (existing `toWhatsAppScheme`, emoji-safe)
    and navigate via `window.location.href` — same-window scheme navigation is not popup-blocked.
  - If WhatsApp isn't installed the scheme navigation fails silently → a 2s visibility-checked timer
    falls back to the `wa.me` URL (cancelled on `visibilitychange`→hidden / `pagehide`).
  - Desktop web unchanged (`window.open(wa.me)`); native branch unchanged.
  - `isIOS()` extracted from `WebNotificationsBanner` to new **`lib/platform.ts`** (shared).

> Both fixes are pure JS → ship on push (Vercel) to the PWA **and** the remote-URL native shells; no
> APK/IPA rebuild, no rules deploy. Verified: `next build` + `vitest` pass. On-device check (iPhone):
> reinstall the PWA → soft-ask appears at launch; approve a booking → WhatsApp opens with intact 🤍.

### 2026-06-12 (session 18) — Guest Details-tab fix, calendar-button gated on approval, cancel success popup

**1. Guest "פרטים" (Details) tab no longer hangs on an endless spinner.**
  Root cause: `clinic/page.tsx` did `Promise.all([getClinicSettings(), getPaymentSettings()])`
  with **no `.catch()`**. For a guest (unauthenticated), the `paymentSettings` read was denied by
  rules (`request.auth != null`), the promise rejected, and `setLoading(false)` never ran → infinite
  spinner. Fix is two parts:
  - **`clinic/page.tsx`** now uses `Promise.allSettled`: a failed `paymentSettings` read is swallowed
    (`payment` stays `null`; the JSX already optional-chains every `payment?.…` and the Bit button has
    a constant fallback). A failed **`getClinicSettings()`** (the mandatory data, e.g. real network
    error) now shows an explicit "לא ניתן לטעון את פרטי הקליניקה" + "נסו שוב" retry instead of a
    half-empty screen. `setLoading(false)` always runs.
  - **`firestore.rules`**: `paymentSettings` read opened to `if true` (was `request.auth != null`) so
    guests see the full payment block. ⚠️ **Deploy the rules manually after the code is live** (see
    Deploying Firestore Rules) — `firebase deploy --only firestore:rules`.

**2. "הוספה ליומן Google" button now appears ONLY after the manager approves.**
  Previously the button rendered on the booking-confirmation screen the moment a request was sent
  (status still `pending`). Now:
  - **`BookingConfirmation.tsx`**: calendar button (and its `buildGoogleCalendarLink` import) removed —
    the confirmation screen only shows the "ממתין לאישור" note.
  - **`my-appointments/page.tsx`**: the approved-future appointment card (`approvedFuture`) now renders
    a "הוספה ליומן Google" button next to the WhatsApp button, built client-side with
    `buildGoogleCalendarLink` from the live appointment data (same title/description format as the
    `/cal/[id]` short link). So the button is conditional on `status === "approved"` — matching the
    requested flow (approve → client notified → opens app → sees the calendar button).

**3. Cancelling an appointment now shows a success popup.**
  `handleCancel` in **`my-appointments/page.tsx`** previously updated state silently. It now opens a
  modal (reusing the `PhoneInput`-style overlay) titled "התור בוטל בהצלחה" with two actions:
  **"קביעת תור חדש"** (`/book`) and **"פנייה למנהלת בוואטסאפ"** (`buildWhatsAppContactLink`, shown only
  when a whatsapp number exists), plus a "סגירה" dismiss. The existing optimistic state update
  (status→`cancelled`, filtered out of "upcoming") means the cancelled appointment disappears from the
  list even if the user just dismisses the modal.

> Verified: `next build` (TypeScript clean) + `vitest` (20/20) pass. JS changes ship on push (Vercel);
> the `paymentSettings` rule change requires a manual Firestore rules deploy.

### 2026-06-11 (session 17) — Admin block-release tool, custom broadcast, self-hosted signed APK

**1. Manager can unblock a rate-limited client (no Firestore console needed).**
- New page **`/admin/blocks`** + **`/api/admin/rate-limits`** (`GET` list, `DELETE` clear).
  Lists every `loginRateLimit/{key}` counter with a friendly type + label (e.g.
  `rpphone__972586554189` → `0586554189`, "איפוס סיסמה (טלפון)"), marks which are actively
  blocking and how many minutes remain, and a "שחרר" button deletes the doc so the client can
  retry **immediately** instead of waiting out the 15-min window. Admin-only via
  `verifyAdminRequest`. Linked from the dashboard quick-links ("שחרור חסימות").

**2. Broadcast push now supports a custom message.** `AdminUpdateBroadcast` gained a
  "הודעה מותאמת אישית" checkbox → optional free-text title + body (sent to `/api/notify-update`,
  which already accepted them). Empty = the default "new version available" text. Two-tap confirm
  unchanged; tapping the push still opens `/download`. NOTE: the broadcast UI lives on the **admin
  dashboard** (`/admin`) — it was already there in session-8/diagnostics work; this session just made
  the message editable. (Answered "where do I notify clients about an update?" → it's on the dashboard.)

**3. ForgotPassword "back to login".** The choose step's bottom button now reads
  "← חזרה להתחברות" (was "ביטול") so a client who opened "שכחתי סיסמה" by mistake has an obvious
  way back to the login screen.

**4. APK distribution moved off private GitHub Releases → self-hosted on Vercel.**
  The `/download` Android button pointed at `github.com/.../releases/latest/download/roni-nails.apk`,
  which **404'd for every client** because the repo is **private** (Release assets of a private repo
  aren't publicly downloadable). Now the APK is served from the site itself: **`public/roni-nails.apk`**
  → `https://roni-nails.vercel.app/roni-nails.apk`, and `download/page.tsx` `APK_URL` defaults to the
  same-origin `/roni-nails.apk` (still overridable via `NEXT_PUBLIC_ANDROID_APK_URL`). The repo stays
  private; no secrets are in git (`.env*` is gitignored; `google-services.json` is safe-to-ship).

**5. Release signing with the project's OWN keystore (was a debug APK).**
  Generated `android/app/release.keystore` (CN=Roni Nails, RSA-2048, 10000-day validity) and built a
  proper **`assembleRelease`** APK signed with it (verified: `Signer #1 DN: CN=Roni Nails`,
  cert SHA-256 `3d6e76c1…f0f2b7`). `build.gradle` already wires `signingConfigs.release` to the
  `KEYSTORE_*` env vars — no gradle change needed. The keystore + `android/keystore.properties`
  (credentials) are **gitignored** (uncommented the keystore rules in `android/.gitignore`).
  - **Build needs JDK 21** (Capacitor's android libs compile at `source release 21`); the system
    default JDK 17 fails with `invalid source release: 21`. Use Android Studio's bundled JBR:
    `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr`.
  - **One-time client friction:** the previous public APK was **debug-signed**; Android refuses to
    install a differently-signed APK over an existing one, so a client who already installed the old
    APK must **uninstall it first**. Every future build with this same keystore installs over the
    previous one cleanly.
  - See the new **Building & Releasing the Android APK** section for the exact rebuild steps.

> ⚠️ **BACK UP THE KEYSTORE.** `android/app/release.keystore` + its password
> (`android/keystore.properties`) are the ONLY way to ship an update clients can install over the
> current one. If lost, every client must uninstall + reinstall on the next release. Store a copy
> off-machine (private Drive / external disk). It is intentionally NOT in git.

### 2026-06-11 (session 16) — Stop Google's "Sign in with Google" email recurring every login

**Problem:** Every time a client signed in with Google they got Google's email *"מעקב אחרי הנתונים בחשבון שלך ב-Google"* (from `noreply-accounts@google.com`) — the "Sign in with Google" data-access notification. Normal behavior is **once per user**; getting it on every login meant each sign-in was recorded as a *fresh* authorization grant.

**Cause:** The native flow requested **offline access / a refresh token** on every sign-in, even though the app only consumes the momentary **ID token** (for Firebase `signInWithCredential`) — it never exchanges the server auth code or calls a Google API. Forcing a new auth-code grant per login re-triggered Google's notification each time.
- `grantOfflineAccess: true` in `GoogleAuth.initialize()` (`src/hooks/useAuth.tsx`)
- `forceCodeForRefreshToken: true` in the `GoogleAuth` plugin block (`capacitor.config.ts`)

**Fix:** Removed both flags. Sign-in is functionally unchanged (`GoogleAuth.signIn()` still returns the ID token). A returning user is now a remembered grant → Google should stop re-sending the email on every login.

**Deploy:** the `useAuth.tsx` change ships via Vercel push (native loads JS remotely), but the `capacitor.config.ts` flag is baked into the native build — **rebuild + reinstall the Android APK** (`npx cap sync android` → rebuild) for full effect on native; re-sync iOS when next rebuilt. Web/PWA benefit immediately.

**Honest caveat:** This Google email **cannot be disabled by the developer** — Google sends it to the user, not us. The fix stops it recurring on *every* login (back to ~once per user); it does not remove it entirely. The app requests only name+email and is legitimate — there is no security problem. Optional: in Google Cloud Console → OAuth consent screen, set publishing status "In production" and complete branding (app name, logo, support email, privacy/terms URLs) for a cleaner, less-alarming one-time notice.

### 2026-06-11 (session 15) — Spam-folder guidance for OTP SMS + reset emails

**Problem:** Clients' verification SMS (Firebase OTP) and password-reset emails land in spam because Firebase sends SMS via "CloudOTP" (Google's shared sender — uncontrollable) and sends emails from `noreply@roni-nail.firebaseapp.com` (unbranded shared domain).

**Code changes (all UI-only, deploy via git push):**
- `ForgotPassword.tsx` — added spam notice on the OTP-entry step ("לא קיבלת קוד? ייתכן שסוננה לספאם... נשלחת דרך Google ובטוחה") + strengthened the email-sent success screen note.
- `SetPasswordForOAuth.tsx` — same SMS-OTP spam notice on the OTP step.
- `profile/page.tsx` — reset-email-sent success message now includes a spam + "נשלח דרך Google" note.

**Free email fix (console, no code change):** Firebase Custom SMTP → Gmail App Password turns reset emails into DKIM-signed `@gmail.com` mail that lands in inboxes. Steps:
1. Use (or create) a Gmail account for the salon.
2. Google Account → Security → **App Passwords** → create one (2-Step Verification must be on).
3. Firebase Console → Authentication → **Templates** → SMTP settings:
   - Host: `smtp.gmail.com` · Port: `465` · Security: SSL
   - Username: the Gmail address · Password: the App Password
   - Sender name: `Roni Nails`
4. Send a test reset email to confirm inbox delivery.
Limit: ~500 emails/day (more than enough for a nail salon).

**SMS sender:** Not controllable — Firebase owns the sender identity. UI notices are the only mitigation; a paid SMS provider (e.g., Twilio Verify) would be needed for full branding.

### 2026-06-11 (session 14) — Password recovery restored (email + SMS) + WhatsApp fallback
Branch `password-recovery` (merged to `main`, PR #1). Each item its own commit; verified
by `npm test` (20 tests, incl. new `phone.test.ts`) + `next build` (all pages still `○ Static`;
`/api/reset-password-by-phone` registered `ƒ`). **No firestore.rules change/deploy needed.**
- **Bug fix (SMS reset was fully broken):** the login "שכחתי סיסמה" → SMS path did a
  client-side `users where phone==…` lookup that the tightened rules **denied** (permission-
  denied), and `signInWithPhoneNumber` created a **ghost** Auth account so `updatePassword`
  set the password on the ghost, not the real user. Now: OTP proves the phone → new server
  route **`/api/reset-password-by-phone`** (Admin SDK) verifies the `phone_number` claim (+15-min
  freshness), resolves the real account by `users.phone`, resets it, **links the phone provider**
  (no ghost recurs), deletes the ghost (guarded: phone-only + no email), revokes sessions, returns
  a custom token → `signInWithCustomToken`. Rate-limited per phone+IP; admin account excluded.
  Disambiguation by name when multiple accounts share a phone.
- **Login redirect guard:** `login/page.tsx` no longer auto-redirects while the modal is open
  (the mid-flow phone session was navigating away and killing the reset modal).
- **Email path:** enumeration-safe — neutral "אם המייל רשום… נשלח קישור" copy (treats
  `auth/user-not-found` as success). `/reset-password` page unchanged.
- **Profile recovery (#2):** `SetPasswordForOAuth` generalized with a `variant` prop; the password
  tab gains "שכחתי את הסיסמה הנוכחית?" → SMS re-auth/link (no current password) + an email-reset-
  link option when the account has a real (non-placeholder) email. Google re-auth button hidden
  when no Google provider is linked.
- **WhatsApp fallback (total lockout):** new `lib/contact-manager.ts` → "פנה למנהלת" opens Roni's
  WhatsApp (number from clinicSettings, via `openWhatsApp()`) pre-filled with a Hebrew help message
  + the user's context (attempted phone on login; name+phone on profile). For users who can recover
  via neither email (placeholder address) nor SMS (wrong/old phone). **Signup stays OTP-free.**
- **Refactors:** extracted `lib/phone.ts` (pure, tested) and `lib/server/rate-limit.ts` (shared by
  login-by-name + the new route).

### 2026-06-10 (session 13) — Phase 1/2 part 2 (in progress)
Branch `phase-1-availability`, continued. Each item its own commit; verified by `next build`.
- **#9 AuthProvider:** `useAuth` is now a single context provider (`useAuth.ts` → `useAuth.tsx`,
  `AuthProvider` mounted in `providers.tsx`). Was a per-component hook → every consumer opened its
  own `onAuthStateChanged` + `users/{uid}` read and flickered `loading` on each navigation. Now one
  listener, one read, memoized value. Call sites unchanged; `useAuth()` throws if used outside the provider.
- **#16 Fail-closed states:** `book/page.tsx` (slots) and `my-appointments/page.tsx` (list) now show an
  explicit error + retry on a failed load instead of a silent empty grid / infinite spinner.
- **#4 Write-validation rules:** `appointmentsPending` create is validated (`validNewAppointment()`:
  status pending, own clientId/guest, ordered timestamps, length-capped + whitelisted fields); owner
  updates can't flip status/clientId/time (blocks self-approval). Manual deploy — Rules Playground first.
- **#18 Cron heartbeat:** the reminder cron stamps `cronStatus/appointmentReminders` on every
  successful run; new admin-only `GET /api/cron-status`; the dashboard shows a banner if reminders
  haven't run in >30 min. A silent scheduler outage becomes a visible alert. (cronStatus is
  server-only — Admin SDK read/write, no client access, no rules entry.)
- **#19 Account deletion (complete):** `/api/delete-account` now `recursiveDelete`s the pushTokens
  subcollection, ANONYMIZES the user's appointments across all buckets (name/phone cleared, clientId
  → "deleted" — keeps salon schedule/stats with zero PII), deletes their clientNotes, revokes refresh
  tokens, and deletes the Auth user LAST (so a mid-way failure stays retryable).
- **#20 Name-login hardening:** rate-limit by name AND caller IP (`x-forwarded-for`); candidates are
  sorted by uid so the `disambiguateIndex` is stable across requests (was Promise-resolution order).
- **#23 Housekeeping:** `webContentsDebuggingEnabled` is now safe-off by default (`CAP_DEBUG` opt-in);
  removed the stray `__cdp_probe.js`. (Deferred: deduping the 3 `STATUS_LABELS` maps + the admin
  approve/reject/cancel handlers — the labels intentionally differ per view and the handlers touch the
  push-before-WhatsApp invariant, so both want a runtime check before refactoring.)
- **#22 Tests + CI:** vitest + `npm test`; 11 unit tests — `timezone.ts` (DST offsets, 365-day
  round-trip) and `booking-logic.ts` (windows, blocked/existing overlap boundaries, one_time override).
  `types/index.ts` now `import type` for Timestamp so pure modules are runtime-Firebase-free. New
  `.github/workflows/ci.yml`: `npm test` + `next build` are hard gates on push/PR; lint advisory
  (repo has pre-existing react-hooks findings to clean up separately).

### 2026-06-10 (session 12) — Phase 1 part 1: server-side availability + timezone
Branch `phase-1-availability` (off `main` after Phase 0). The review's single highest-leverage move.
- **Privacy + perf (#1, #10):** new **`/api/availability`** (public, Admin-SDK) computes bookable
  slots for one day server-side and returns only anonymous `{startTime,endTime,available}`. The
  booking page (`book/page.tsx`) now calls it instead of reading `availabilityRules` + `blockedTimes`
  + ALL pending/approved appointments client-side. Closes the hole where the booking client pulled
  every client's name/phone, and the per-tap read cost.
- **Rules lockdown (#1):** all appointment collections `list: if true` → `if request.auth != null`.
  Verified safe: every remaining client-side list (admin pages, a client's own my-appointments) is
  authenticated. **Manual deploy, and only AFTER the code is live** — see Deploying Firestore Rules.
- **Timezone (#14):** new **`src/lib/timezone.ts`** (Asia/Jerusalem, DST-aware via Intl, no dep) is
  the one source of truth for calendar math. `booking-logic.ts` rewritten to `generateDaySlots()` —
  pure, runtime-Firebase-free, builds slot instants via the tz helper instead of `Date.setHours()`
  (which silently used the runtime tz: device on client, UTC on server). `TimeSlotPicker` labels
  slots with `formatIsraelTime` so a non-Israel device still shows salon hours. Verified: winter
  (UTC+2) / summer (UTC+3) conversions + a 365-day round-trip with 0 day-shifts across both DST edges.
- Verified via `next build` (all pages still `○ Static`; `/api/availability` registered).
- **Deploy sequence:** (1) push Phase 0 `main`, (2) merge+push this branch → Vercel, (3) publish rules.
- Not yet done in Phase 1: write-validation rules (#4), AuthProvider (#9), my-appointments server-side
  read (full owner-scoping), TanStack adoption (#12), fail-closed error states (#16), tests/CI (#22).

### 2026-06-10 (session 11) — Phase 0 security & perf hardening
Branch `phase-0-security-hardening` (not yet merged). Acts on the Ultra Review's Phase 0.
- **Security (push tokens):** `/api/register-push-token` POST+DELETE now require a Firebase
  ID token and derive the uid from it; the body `userId` is ignored. Closes the hole where
  anyone could register a device under the (public) admin UID and receive every client's
  bookings/reminders. Callers updated: `push.ts`, `web-push.ts`, `useAuth.logout` send the
  `Authorization` header. Added Zod body validation.
- **Security (notify-admin):** route now accepts ONLY `{appointmentId}` and reads the real
  `appointmentsPending` doc as the source of truth — a notification can no longer be forged.
  All interpolated email values are HTML-escaped; the approval URL is built from `APP_URL`
  (new optional `NEXT_PUBLIC_APP_URL`, not the attacker-controlled Origin header); idempotent
  via the new `adminNotifiedAt` field; returns proper 4xx/5xx instead of 200-on-failure.
- **Security/correctness (admin auth):** new server-only `lib/admin-auth.ts` `verifyAdminRequest()`
  (env UID OR Firestore `role:"admin"`), now used by `/api/notify-client-approval` — previously
  env-UID-only, so a role-admin could approve appointments but every client push 403'd.
- **Reliability (client cancel):** new `/api/cancel-appointment` (ID-token auth → Admin-SDK
  move pending→rejected). `my-appointments` was calling the client-side `cancelAppointment()`,
  whose cross-collection batch is admin-only in the rules → it was **silently failing**. The
  page now calls the route with proper error surfacing.
- **Perf:** removed `export const dynamic = "force-dynamic"` from the root layout. All pages now
  prerender as `○ Static` (CDN shell) instead of a per-request serverless render — kills the
  cold-start lag on every Capacitor WebView navigation. Verified via `next build`.
- **Tz (partial #14):** notify-admin email now formats date/time in `Asia/Jerusalem` (was UTC).
- Not yet done (later phases): server-side availability endpoint + rules `list` lockdown (#1),
  write-validation rules (#4), AuthProvider (#9), tests/CI (#22). See the review for the full plan.

### 2026-06-10 (session 10)
- **Fix (iOS PWA Google sign-in, part 2):** In a standalone iOS PWA, `signInWithPopup`
  cannot open a popup; the async failure **burns the user-activation**, so the redirect
  fallback was then blocked as a non-user-initiated navigation and the Google account
  picker never opened. `useAuth.ts` now detects standalone display mode (`navigator.standalone`
  / `display-mode: standalone` via new `isStandaloneDisplay()`) and calls
  `signInWithRedirect` **directly inside the click gesture**, skipping the popup entirely.
  Also broadened the popup-failure fallback codes (`auth/cancelled-popup-request`,
  `auth/operation-not-supported-in-this-environment`). Completes the 06-09 fix.

### 2026-06-09 (session 9)
- **Feature (iOS native project):** Added the native iOS Capacitor 8 project under `ios/`
  (`cap add ios`, CocoaPods). `com.roninails.app`, loads the live Vercel URL like Android.
  `GoogleService-Info.plist`, `Info.plist` (Google OAuth callback URL scheme +
  `LSApplicationQueriesSchemes` for WhatsApp), app icon + splash. Building/archiving needs
  a Mac + Xcode — see [IOS_NATIVE_SETUP_PROMPT.md](IOS_NATIVE_SETUP_PROMPT.md).
- **Fix (iOS PWA Google sign-in, part 1):** `signInWithRedirect` broke inside a standalone
  iOS PWA because the default `<project>.firebaseapp.com` `authDomain` triggers a
  cross-origin redirect that iOS/ITP blocks (the redirect "escapes" the PWA). Now served
  **same-origin**: `next.config.ts` reverse-proxies `/__/auth/*` and `/__/firebase/*` to
  `roni-nail.firebaseapp.com`, and `firebase.ts` forces `authDomain` to `roni-nails.vercel.app`
  (ignores a default `*.firebaseapp.com` value; a real custom domain still wins).
  **Requires** the Web OAuth client to allow `https://roni-nails.vercel.app/__/auth/handler`
  as an authorized redirect URI.

### 2026-06-05 (session 8b)
- **Fix (WhatsApp deep links + 🤍 corruption):** New `openWhatsApp()` in `open-external.ts`
  opens the `whatsapp://` scheme **directly** instead of going through `wa.me`. The wa.me
  web→app redirect was failing to open WhatsApp on iOS **and** re-encoding the astral 🤍
  emoji as latin-1 mojibake. `admin/page.tsx` and `admin/appointments/page.tsx` both use it.
- **Feature (cancel/reject push):** Admin **cancel** and **reject** now push the client too,
  not just approve. `notify-client.ts` refactored around a shared `notifyClient()` helper
  with `notifyClientApproved` / `notifyClientCancelled` / `notifyClientRejected`; each is
  awaited before opening WhatsApp.
- **Fix (iOS Google auth init):** Hardened native Google Auth init in `useAuth.ts` — a valid
  client ID is guaranteed (env var or `capacitor.config.ts` fallback), init is wrapped in
  try/catch and awaited before `signIn()` to prevent a race; errors logged in `login/page.tsx`.
- **Feature (battery optimization):** `PushPermissionPrompt.tsx` now chains a
  battery-optimization step after the notification-permission grant — on aggressive OEMs
  (OnePlus/Xiaomi/Huawei) with the native BatteryOptimization plugin it explains, then calls
  `requestIgnoreBatteryOptimizations()`. Safe no-op on iOS/other devices.

### 2026-06-04 (session 8)
- **Feature (iOS notifications, free):** iPhone clients who install the PWA ("Add to Home
  Screen", iOS 16.4+) now get reminders via **FCM Web Push** — no App Store, no vendor, no
  APK rebuild. New `src/lib/web-push.ts` (Web SDK: `isWebPushSupported`/`isStandalonePWA`/
  `requestWebPushPermission` [gesture-first for Safari]/`registerWebPushToken`), new
  `src/components/native/WebNotificationsBanner.tsx` (iOS shows an Add-to-Home-Screen guide
  when not yet installed) + `WebPushSetup.tsx` (refresh-on-launch, mounted in layout). The
  service worker is served by a **dynamic route** `src/app/firebase-messaging-sw.js/route.ts`
  with the public Firebase config injected server-side (no query-string/hardcoding).
- **Refactor (multi-device tokens):** `pushTokens/{uid}` single-token field → subcollection
  **`pushTokens/{uid}/tokens/{sha256(token)}`** `{ token, platform, updatedAt }`, so a user
  can have an Android app AND an iPhone PWA without one overwriting the other. New server
  helper `src/lib/firestore/push-tokens-admin.ts` (`saveToken`/`getTokens`/`getTokensForUsers`/
  `deleteToken`/`getTokenStatus`); reads the legacy field too for back-compat. **All senders**
  (cron-reminders, notify-admin, notify-client-approval, admin/self-test-push) now send to
  every device and prune dead tokens individually. `register-push-token` takes `platform` +
  gained a **DELETE** handler; `useAuth.logout` now removes the device token via that route
  (the old client-side `deleteDoc` was silently denied by rules). Subcollection is
  client-denied by default — **no Firestore rules change/deploy needed.**
- **Fix (PWA icons):** generated the missing `public/icons/{icon-192,icon-512,apple-touch-icon}.png`
  (from `assets/icon.png` via `scripts/gen-pwa-icons.mjs`) and **committed** them, so the
  iPhone/Android home-screen install shows Roni's logo instead of a generic icon.
- **Env:** new `NEXT_PUBLIC_FIREBASE_VAPID_KEY` (Firebase Console → Cloud Messaging → Web
  Push certificates). Until set, web push self-disables and the banner stays hidden.

### 2026-06-04 (session 7)
- **Feature (diagnostics):** Self-service **Notification Diagnostics** to pinpoint why reminders stop on aggressive OEMs (OnePlus/OxygenOS). Root cause is OS-level, not code: swiping the app from recents **force-stops** the package → the app receives no FCM (and no AlarmManager/WorkManager either — none survive force-stop). New `/notification-check` page + `NotificationDiagnostics.tsx`: checks notification permission, battery-optimization exemption, on-device FCM token, and server-side token registration/freshness, runs an end-to-end self-test push, and has a copy-report button. New `POST /api/self-test-push` (any logged-in user → own device; generalized from `admin-test-push`) and `GET /api/push-token-status` (token presence + age, no token value exposed). Extracted `src/lib/detect-oem.ts` (shared by `BackgroundDeliveryGuide`). Linked from `/my-appointments` (client) and the admin dashboard — closes the gap where the OEM battery/auto-launch guide was admin-only. Ships via Vercel; runs on the current APK. **Next:** roll the OEM anti-kill UX out to all clients once diagnostics confirm force-stop.

### 2026-06-02 (session 6)
- **Feature (notifications):** Admin approval now sends a push notification to the client's device. New `POST /api/notify-client-approval` (admin Firebase ID-token auth): looks up the client's FCM token, sends a personalized Hebrew push (`"רני אישרה לך את התור..."`) on the `appointment-reminders` HIGH-importance channel, prunes dead tokens on failure. New `src/lib/notify-client.ts`: `notifyClientApproved()` builds the message on the admin's device (correct Israel tz, matches the WhatsApp text), calls the route with `keepalive: true` so the request survives the WhatsApp navigation that immediately follows. `await`-ed before `openExternal()` in `admin/page.tsx:approve()`. No-op for guest appointments and if no admin ID token is available.

### 2026-06-01 (session 5)
- **Fix (branding):** App icon + splash now show Roni's pink nail-polish design instead of the default Capacitor blue "X". Root cause: `assets/icon.png` / `assets/splash.png` existed but were never generated into native resources. Installed `@capacitor/assets`, ran `generate --android` (`#FCF1F3` background), regenerated all `mipmap-*` icons + `drawable*/splash.png`, `cap sync`. **Requires an APK rebuild + reinstall** — icon/splash are native, not served via the remote URL.
- **Feature (reminders):** Clients get a native push **~1 hour before** their appointment. New `POST|GET /api/cron/appointment-reminders` (Admin SDK): queries `appointmentsApproved` in the next 70 min, fires for those ≤60 min out and not yet reminded, sends **personalized** messages via `adminMessaging.sendEach()`, marks `reminderSentAt` (new field on `Appointment`) in one batch, prunes dead tokens. Hardened: `runtime="nodejs"`, `dynamic="force-dynamic"`, `maxDuration=60`, `Cache-Control: no-store`, Bearer-secret auth (`CRON_SECRET`, timing-safe). Batched token reads via `getAll`.
- **Scheduling:** Free external cron (cron-job.org) calls the endpoint every 10 min with `Authorization: Bearer ${CRON_SECRET}`. Vercel Hobby can't run sub-daily cron, so no active `vercel.json` (it would break deploys); `vercel.cron.example.json` documents the Pro path.
- **Feature (permission):** Android-13-aware push permission flow. New `PushPermissionPrompt` soft-ask (first native launch) gates the one-shot OS prompt; `NotificationsBanner` on `/my-appointments` re-enables (prompt state) or guides to settings (denied). HIGH-importance `appointment-reminders` channel so reminders pop with sound. `push.ts` split into `getPushPermission` / `requestPushPermission` / `registerPushToken` / `ensureReminderChannel`; `initPushNotifications` now refreshes the token on every native launch (catches tokens rotated while the app was closed).
- **Env:** New `CRON_SECRET` (set in `.env.local` **and** Vercel).

### 2026-06-01
- **Feature (mobile):** Capacitor wrapper for Android + iOS (`com.roninails.app`). Remote-URL mode loads the live Vercel site. Native Google sign-in, FCM push, Android back button, status bar styling, splash screen, offline fallback. New: `capacitor.config.ts`, `android/`, `src/components/native/NativeSetup.tsx`, `src/lib/push.ts`, `src/lib/open-external.ts`.
- **Feature (auth):** Name + password login via `/api/login-by-name` (Firebase Admin SDK → custom token). Rate-limited 5/15 min per name; resolves auth email through the Admin SDK so it works for legacy users; masked-phone disambiguation when multiple accounts share a name+password.
- **Feature (auth):** Set-password flow for Google-only accounts (`SetPasswordForOAuth.tsx`) — re-auth via Google **or** SMS (`linkWithPhoneNumber`), then `updatePassword`. Forgot-password flow + `/reset-password` page. New `/profile` page (email confirm, set password, delete account).
- **Feature (notifications):** New bookings trigger `/api/notify-admin` → Resend email to `ADMIN_EMAIL` + FCM push to Roni's device. Device tokens stored per-user in `pushTokens/` via `/api/register-push-token`.
- **Feature (account deletion):** `/api/delete-account` (Apple App Store Guideline 5.1.1 requirement). Verifies the caller's ID token; admin account is protected.
- **Infra:** Firebase Admin SDK (`src/lib/firebase-admin.ts`) — `adminAuth`, `adminDb`, `adminMessaging`. New server env vars: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_SERVER_API_KEY`, `RESEND_API_KEY`, `ADMIN_EMAIL`, plus `NEXT_PUBLIC_GOOGLE_WEB/IOS_CLIENT_ID`.
- **Rules:** Added `loginRateLimit/` (deny-all to clients; Admin-SDK only). `pushTokens/` written server-side. Appointment collections confirmed split (pending/approved/rejected/completed) with `allow list: if true`.
- **Design:** New "פשוט" (Simple) theme — light pink background (`#FCF1F3`), warm ink text (`#473A3E`), rose accent (`#CE7C9B`), no emojis in primary UI, mobile tab bar. Theme tokens in `globals.css`.
- **UX:** User name display, back buttons, service duration in confirmation, auto-clean of past availability rules, red cancel button, admin Google Calendar button, fixed notes saving.

### 2026-05-27 (session 3)
- **Fix:** Booking page now allows selecting today; past slots for today are filtered out after generation. `minDate` changed from `tomorrow` to `today`.
- **Fix (critical):** `"completed"` appointments move to a dedicated `appointmentsCompleted` collection (batch set+delete). `getTodayAppointments` includes it. Rules updated.
- **Feature:** Admin can manually add an appointment at `/admin/appointments/new` (registered client or free name+phone) — creates directly as "approved".
- **Change:** `my-appointments` no longer calls `markPastAppointmentsAsCompleted` (permission issues for non-admins). Past approved appointments are remapped to "completed" client-side based on `endTime`.

### 2026-05-27 (session 2)
- **Feature:** Email optional on signup (placeholder `noemail_<timestamp>@placeholder.com`); no-email users can log in via Google.
- **Feature:** `"completed"` status — approved appointments past `endTime` auto-marked "completed" (sky-blue "בוצע ✓" badge) on dashboard / My Appointments load.
- **Feature:** Availability "הוסף לכלל ימות השבוע" checkbox — one click creates 7 recurring rules (Sun–Sat).

### 2026-05-27
- **Fix (critical):** `appointments` rules changed from `allow read` to `allow get` (auth-only) + `allow list: if true`.
- **Fix:** Removed `checkOverlap()` client-side call (required a missing composite index, broke all bookings).
- **Fix:** `PhoneInput.tsx` — only auto-verifies if entered number matches the already-linked Firebase Auth phone.
- **Fix:** `admin/page.tsx` — status badge in "לוח היום" updates immediately after approval.
- **Feature:** Monthly calendar grid date picker (60-day window).
- **Change:** Slot interval 10 min → 5 min.

---

### 2026-06-14 (session 20) — PWA home-screen name: "רוני ניילס" → "רני ניילס"

Changed the app name displayed when an iPhone user adds the PWA to their home screen from "רוני ניילס" to "רני ניילס":
- `src/app/layout.tsx`: `apple-mobile-web-app-title` meta tag
- `public/manifest.json`: `name` + `short_name` fields

Pure JS/web change — ships on push to Vercel, no APK rebuild needed. Existing installs will update the name after the user removes and re-adds the icon.

_Last updated: 2026-06-14 (session 20)_
