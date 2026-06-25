# iOS Native Setup — Prompt for an AI Coding Assistant (run this on a Mac)

> **Copy everything below the line into your AI coding assistant (Claude Code / Cursor / etc.) while it is open in the Rani Nails project on a Mac with Xcode installed.**
> It is written to be self-contained — the assistant does not need any other context.

---

You are working on **Rani Nails**, a salon-booking app. It is a **Next.js 16** web app wrapped as a **Capacitor 8** native app in **remote-URL mode** (the native shell loads the live website `https://roni-nails.vercel.app`; it does **not** bundle the web build). The web/JavaScript side has **already been fixed and deployed** — your job is **only the native iOS configuration** that cannot be done from a Windows machine.

## Background: what's already done (do NOT redo)

The JavaScript fixes are live on Vercel and reach the iOS WebView automatically:
- Google sign-in initialization was hardened (valid client IDs guaranteed, init awaited before `signIn()`).
- WhatsApp links now open via the native `whatsapp://send?phone=&text=` scheme instead of `wa.me`, which also fixed an emoji-corruption bug.

These will only fully work on iOS once the **native iOS project exists and its `Info.plist` is configured** — which is what you must do now. The repo currently has **only an `android/` folder; there is no `ios/` folder and `@capacitor/ios` is not installed.**

## Project facts (use these exact values)

| Thing | Value |
|------|-------|
| App ID (bundle id) | `com.roninails.app` |
| App name | `Rani Nails` (the Capacitor `appName` is currently `Roni Nail` — keep as-is unless asked) |
| Remote URL | `https://roni-nails.vercel.app` |
| Capacitor config file | `capacitor.config.ts` (repo root) |
| Google **iOS** OAuth client ID | `903565127318-f8ut8smvr34nlpa7vjc0n72gmns17c0a.apps.googleusercontent.com` |
| Google **iOS** client ID — **REVERSED** (for the URL scheme) | `com.googleusercontent.apps.903565127318-f8ut8smvr34nlpa7vjc0n72gmns17c0a` |
| Google **Web/server** OAuth client ID | `903565127318-ugg7kjv1mgi51dsf7qer4l2p2c29hp5u.apps.googleusercontent.com` |
| Google Sign-In plugin (already in package.json) | `@codetrix-studio/capacitor-google-auth` |

The two native bugs you are fixing:
1. **Google sign-in does nothing on iPhone** → caused by the missing reversed-client-ID **URL scheme** in `Info.plist` (the OAuth callback has nowhere to return to).
2. **"Approve + WhatsApp" / "Cancel + WhatsApp" buttons don't open WhatsApp on iPhone** → the JS now emits `whatsapp://…`; iOS needs `whatsapp` whitelisted in **`LSApplicationQueriesSchemes`** so the app may query/open it.

---

## Step 1 — Create the iOS project

Run from the repo root:

```bash
npm install @capacitor/ios
npx cap add ios
npx cap sync ios
```

This generates `ios/App/…` and installs CocoaPods. If `pod install` fails, run:

```bash
cd ios/App && pod install && cd ../..
```

Confirm the `@codetrix-studio/capacitor-google-auth` pod appears in `ios/App/Podfile.lock`.

## Step 2 — Add `GoogleService-Info.plist`

1. In the Firebase Console → Project Settings → **Your apps** → the **iOS app** (`com.roninails.app`) → download **`GoogleService-Info.plist`**.
   - If no iOS app is registered there yet, add one with bundle id `com.roninails.app`, then download the plist.
2. In Xcode, open `ios/App/App.xcworkspace`, then drag `GoogleService-Info.plist` into the **`App`** target (check **"Copy items if needed"** and that **Target Membership → App** is ticked). It must sit next to `Info.plist` inside the `App` group.

> Note: the iOS client ID inside that downloaded plist must match `903565127318-f8ut8smvr34nlpa7vjc0n72gmns17c0a.apps.googleusercontent.com`. If it differs, the project's Firebase iOS app was set up with a different OAuth client — in that case use **the reversed form of the client ID that's actually in the downloaded plist** for the URL scheme in Step 3.

## Step 3 — Edit `ios/App/App/Info.plist`

Open `ios/App/App/Info.plist` and add the following two keys inside the top-level `<dict>` (do not duplicate keys — if `CFBundleURLTypes` or `LSApplicationQueriesSchemes` already exist, merge into them instead of adding a second copy).

**3a. URL scheme for the Google OAuth callback** (fixes Google sign-in):

```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleTypeRole</key>
        <string>Editor</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>com.googleusercontent.apps.903565127318-f8ut8smvr34nlpa7vjc0n72gmns17c0a</string>
        </array>
    </dict>
</array>
```

**3b. Allow querying/opening WhatsApp** (fixes the WhatsApp buttons):

```xml
<key>LSApplicationQueriesSchemes</key>
<array>
    <string>whatsapp</string>
</array>
```

## Step 4 — Verify the WhatsApp deep link is not blocked by app-bound domains

`capacitor.config.ts` sets `ios.limitsNavigationsToAppBoundDomains: true`. This restricts **http(s)** navigation, not custom schemes, so `whatsapp://` should still open. **If, and only if, the WhatsApp buttons still fail to open the app after Steps 1–3**, set it to `false` in `capacitor.config.ts`:

```ts
ios: {
  // ...
  limitsNavigationsToAppBoundDomains: false,
},
```

then re-run `npx cap sync ios`. (Leave it `true` if WhatsApp already opens — narrower is safer.)

## Step 5 — Build, run, and verify on a real iPhone

```bash
npx cap sync ios
npx cap open ios   # opens Xcode
```

In Xcode: select a **real device** (Google sign-in and WhatsApp can't be fully tested in the Simulator), set your signing **Team** under *Signing & Capabilities*, then Run.

**Verification checklist (must all pass):**
- [ ] Tap **"המשך עם Google"** (Continue with Google). The Google sheet appears, you pick an account, and the app **returns to itself signed in** (no hang, no blank). This proves Step 3a.
- [ ] As admin, approve or cancel an appointment and tap **"אישור + וואטסאפ" / "ביטול + וואטסאפ"**. **WhatsApp opens** with the message pre-filled, and the white-heart 🤍 in the message **renders correctly** (not `ð¤`). This proves Step 3b.
- [ ] No regressions to push notifications or normal navigation.

## Step 6 — Vercel env (one check, not a code change)

Make sure `NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID` is set in the Vercel project settings to `903565127318-f8ut8smvr34nlpa7vjc0n72gmns17c0a.apps.googleusercontent.com`. The web code falls back to a hardcoded value if it's missing, but setting it is cleaner.

---

## If something still fails

- **Google button still does nothing:** double-check the URL scheme string in `Info.plist` is the **reversed** client ID (`com.googleusercontent.apps.<id-without-the-.apps.googleusercontent.com-suffix>`) and matches the iOS client ID in `GoogleService-Info.plist`. Also confirm `GoogleService-Info.plist` has **Target Membership → App** checked.
- **WhatsApp button does nothing:** confirm `LSApplicationQueriesSchemes` contains `whatsapp`, that WhatsApp is installed on the test device, and (last resort) try Step 4.
- Always re-run `npx cap sync ios` after editing `capacitor.config.ts`, and clean build (`Product → Clean Build Folder`) in Xcode after `Info.plist` changes.

When done, report exactly which files you created/changed and the result of each verification checkbox.
