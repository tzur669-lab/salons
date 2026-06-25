import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getMessaging, type Messaging } from "firebase-admin/messaging";

function getAdminApp(): App {
  // Idempotent: safe even if all three accessors call it (JS is single-threaded,
  // so the length check + initializeApp never races).
  if (getApps().length > 0) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

/**
 * LAZY, memoized Admin SDK accessors.
 *
 * The SDK is created only when one of these is CALLED — never at import — so a
 * missing/malformed FIREBASE_PRIVATE_KEY can no longer crash `next build` during
 * page-data collection. A genuinely absent credential only fails the specific
 * admin route at runtime. Call these INSIDE a request handler/helper, never at
 * module scope.
 */
let _auth: Auth | undefined;
let _db: Firestore | undefined;
let _messaging: Messaging | undefined;

export function getAdminAuth(): Auth {
  return (_auth ??= getAuth(getAdminApp()));
}
export function getAdminDb(): Firestore {
  return (_db ??= getFirestore(getAdminApp()));
}
export function getAdminMessaging(): Messaging {
  return (_messaging ??= getMessaging(getAdminApp()));
}
