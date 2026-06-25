import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// iOS standalone PWA fix: if authDomain is the default .firebaseapp.com domain,
// override with our Vercel domain so signInWithRedirect stays same-origin (ITP-safe).
// The /__/auth/* paths are reverse-proxied in next.config.ts.
// Set NEXT_PUBLIC_APP_URL to your Vercel/custom domain (e.g. https://salons.vercel.app).
const rawAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
const authDomain =
  appUrl
    ? appUrl.replace(/^https?:\/\//, "")
    : !rawAuthDomain || rawAuthDomain.endsWith(".firebaseapp.com")
    ? "salons-19a2e.firebaseapp.com"
    : rawAuthDomain;

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
