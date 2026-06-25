# Handoff — iOS native + PWA Google sign-in

מסמך מצב קצר למפתח שממשיך. עודכן 2026-06-09.

## ארכיטקטורה (חשוב להבין קודם)
- אפליקציית **Next.js 16** עטופה ב-**Capacitor 8** במצב **remote-URL**: ה-`server.url` ב-`capacitor.config.ts` מצביע על `https://roni-nails.vercel.app`. הקליפה הנייטיב **טוענת את האתר החי** — היא לא מכילה את ה-web build.
- יש **שתי דרכי הפצה שונות לחלוטין**, אל תבלבל ביניהן:
  1. **אפליקציית Capacitor נייטיב** (נבנית ב-Xcode מ-`ios/`). יש בה את גשר Capacitor ופלאגינים נייטיב. כאן Google sign-in עובד דרך ה-SDK הנייטיב.
  2. **"Add to Home Screen" מ-Safari** = רק האתר ב-WebView, **בלי** גשר Capacitor. כאן Google sign-in הוא web (Firebase) — וזה מה שתוקן בנפרד (ראה למטה).

## מה כבר נעשה ✅
### צד נייטיב (`ios/`)
- נוצר פרויקט iOS עם `@capacitor/ios` במצב **CocoaPods** (לא SPM — כי `@codetrix-studio/capacitor-google-auth` תומך רק ב-CocoaPods). מאומת: הפלאגין ב-`ios/App/Podfile.lock`.
- `ios/App/App/Info.plist`: נוסף `CFBundleURLTypes` עם ה-reversed iOS client ID (ל-Google), ו-`whatsapp` ב-`LSApplicationQueriesSchemes` (לכפתורי WhatsApp).
- `GoogleService-Info.plist` נוסף ל-target App (bundle `com.roninails.app`).
- האפליקציה הנייטיב נבנתה והורצה על אייפון — **Google sign-in עובד** בה.

### צד web — תיקון Google sign-in ב-iOS standalone PWA
הבעיה: ב-PWA במסך מלא, `signInWithRedirect` של Firebase נשבר כי authDomain ברירת המחדל (`roni-nail.firebaseapp.com`) גורם ל-redirect חוצה-דומיין ש-ITP של iOS חוסם.
התיקון (already merged):
- `next.config.ts`: reverse-proxy של `/__/auth/*` ו-`/__/firebase/*` אל `roni-nail.firebaseapp.com` (same-origin).
- `src/lib/firebase.ts`: `authDomain` נכפה ל-`roni-nails.vercel.app`.
- מאומת: `https://roni-nails.vercel.app/__/auth/handler` מחזיר 200 (ה-rewrite חי ב-Vercel).

## מה נשאר ⏳ (חוסם את ה-PWA login)
**הגדרה אחת ב-Google Cloud Console** (לא קוד) — בלעדיה Google מחזיר `redirect_uri_mismatch`:
- לקוח OAuth מסוג **Web** (`903565127318-ugg7kjv1mgi51dsf7qer4l2p2c29hp5u`):
  - Authorized redirect URIs → הוסף `https://roni-nails.vercel.app/__/auth/handler`
  - Authorized JavaScript origins → הוסף `https://roni-nails.vercel.app`
- Firebase Console → Authentication → Authorized domains → ודא `roni-nails.vercel.app`.
- בדיקה: באייפון למחוק את קיצור מסך-הבית הישן, להוסיף חדש מ-Safari, ולנסות Google.

> חלופה ללא Google Console: להפיץ את האפליקציה הנייטיב (שבה login כבר עובד) דרך **TestFlight** (דורש חשבון Apple Developer בתשלום).

## להריץ מקומית (Mac)
```bash
npm install
npx cap sync ios          # מייצר capacitor.config.json + מריץ pod install
cd ios/App && pod install # אם צריך, דורש CocoaPods >= 1.12 (Ruby >= 2.7, למשל דרך brew)
open ios/App/App.xcworkspace   # לפתוח את ה-workspace, לא את ה-xcodeproj
```
הערות: `node_modules/` ו-`ios/App/Pods/` לא ב-git (תקני — מתחדשים ע"י הפקודות מעלה). לבנייה על מכשיר צריך Xcode מלא + Signing Team.
