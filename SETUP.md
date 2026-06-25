# Roni Nails — מדריך הגדרה ראשונית

## שלב 1: Firebase Project

1. כנסי ל-https://console.firebase.google.com
2. צרי פרויקט חדש: "roni-nails"
3. אפשרי Google Analytics (אופציונלי)

## שלב 2: Firebase Authentication

1. Build → Authentication → Get started
2. הפעילי: **Google** ו-**Email/Password**
3. ב-Authorized domains — הוסיפי את הדומיין של Vercel לאחר deploy

## שלב 3: Firestore Database

1. Build → Firestore Database → Create database
2. Location: **europe-west1** (הכי קרוב לישראל)
3. Start in **production mode**
4. העתיקי את `firestore.rules` לטאב Rules ולחצי Publish

## שלב 4: Storage

1. Build → Storage → Get started
2. Location: europe-west1
3. Rules (בסיסי):
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

## שלב 5: קבלת Firebase Config

1. Project Settings (⚙️) → Your apps → Add app → Web
2. Register app: "roni-nails-web"
3. העתיקי את ה-config לקובץ `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=roni-nails.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=roni-nails
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=roni-nails.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1234567890
NEXT_PUBLIC_FIREBASE_APP_ID=1:123:web:abc
```

## שלב 6: Admin UID

1. הפעילי את האפליקציה מקומית: `npm run dev`
2. התחברי עם Google (החשבון של רוני)
3. Firebase Console → Authentication → Users
4. העתיקי את ה-UID של רוני
5. הוסיפי ל-.env.local:
```env
NEXT_PUBLIC_ADMIN_UID=uid-של-רוני-כאן
```
6. עצרי ואתחילי שוב: `npm run dev`

## שלב 7: נתונים ראשוניים

לאחר הכניסה כ-admin:
1. `/admin/clinic` — הוסיפי פרטי סלון
2. `/admin/services` — הוסיפי שירותים (ג'ל, הסרה, בנייה...)
3. `/admin/availability` — הגדירי ימי ושעות פעילות
4. `/admin/payment` — הגדירי פרטי Bit/Paybox

## שלב 8: Deploy ל-Vercel

```bash
npm install -g vercel
vercel login
vercel --prod
```

הוסיפי את כל משתני הסביבה מ-.env.local ב-Vercel Dashboard → Settings → Environment Variables.

## הרצה מקומית

```bash
cd "Roni Nails"
npm install
npm run dev
```

פתחי: http://localhost:3000
