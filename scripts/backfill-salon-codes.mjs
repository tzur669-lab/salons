/**
 * One-time backfill: assigns a 4-digit salonCode to every salon that doesn't
 * already have one, and writes the reverse-index salonCodes/{code} → salonId.
 *
 * Run once after deploying the salon-code feature:
 *   node scripts/backfill-salon-codes.mjs
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON env var
 * (same as the rest of the Admin SDK usage in this project).
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const CODE_LENGTH = 4;
const CODE_ALPHABET = "0123456789";

function randomCode() {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

async function resolveUniqueCode(db) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = randomCode();
    const snap = await db.collection("salonCodes").doc(code).get();
    if (!snap.exists) return code;
  }
  throw new Error("code-collision after 20 attempts");
}

async function main() {
  if (!getApps().length) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
      : undefined;
    initializeApp(serviceAccount ? { credential: cert(serviceAccount) } : undefined);
  }

  const db = getFirestore();
  const salonsSnap = await db.collection("salons").get();

  let assigned = 0, skipped = 0;

  for (const doc of salonsSnap.docs) {
    const data = doc.data();
    if (data.salonCode) {
      skipped++;
      continue;
    }

    const salonId = doc.id;
    const code = await resolveUniqueCode(db);
    const batch = db.batch();
    batch.update(doc.ref, { salonCode: code });
    batch.set(db.collection("salonCodes").doc(code), {
      salonId,
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    console.log(`  ${salonId} → code ${code}`);
    assigned++;
  }

  console.log(`\nDone: ${assigned} assigned, ${skipped} already had a code.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
