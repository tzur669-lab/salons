import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { rateKey, checkRateLimit } from "@/lib/server/rate-limit";

const SERVER_API_KEY = process.env.FIREBASE_SERVER_API_KEY!;
const NAME_MAX_ATTEMPTS = 5; // lock a single name after 5 tries / 15 min
const IP_MAX_ATTEMPTS = 20; // a single IP can't grind many names at once

async function verifyPassword(authEmail: string, password: string): Promise<boolean> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${SERVER_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: authEmail, password, returnSecureToken: false }),
    }
  );
  return res.ok;
}

function maskPhone(phone: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 4) return "מספר לא ידוע";
  return `**-****-${digits.slice(-4)}`;
}

export async function POST(req: NextRequest) {
  try {
    const adminDb = getAdminDb();
    const adminAuth = getAdminAuth();
    const body = await req.json();
    const { name, password, disambiguateIndex } = body as {
      name: string;
      password: string;
      disambiguateIndex?: number;
    };

    if (!name || !password) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    // Rate-limit by name AND by caller IP: the name limit stops one account being
    // brute-forced; the IP limit stops one attacker grinding many names (and stops a
    // name limit being weaponized to lock a specific user out from elsewhere).
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    if (!(await checkRateLimit(rateKey("name", name), NAME_MAX_ATTEMPTS))) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    if (!(await checkRateLimit(rateKey("ip", ip), IP_MAX_ATTEMPTS))) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    const usersSnap = await adminDb
      .collection("users")
      .where("name", "==", name.trim())
      .limit(10)
      .get();

    if (usersSnap.empty) {
      return NextResponse.json({ error: "name_not_found" }, { status: 404 });
    }

    // Resolve Firebase Auth email for each candidate via Admin SDK
    // Works for ALL users, including old ones without authEmail in Firestore.
    // Sorted by uid so the candidate order — and therefore the disambiguateIndex —
    // is STABLE across requests (Promise.all resolution order is not deterministic).
    const resolved = await Promise.all(
      usersSnap.docs.map(async (docSnap) => {
        try {
          const authUser = await adminAuth.getUser(docSnap.id);
          if (authUser.email) {
            return {
              uid: docSnap.id,
              authEmail: authUser.email,
              phone: (docSnap.data().phone as string) ?? "",
            };
          }
        } catch {
          // User deleted from Auth but not Firestore — skip
        }
        return null;
      })
    );
    const candidates = resolved
      .filter((c): c is { uid: string; authEmail: string; phone: string } => c !== null)
      .sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));

    if (candidates.length === 0) {
      return NextResponse.json({ error: "name_not_found" }, { status: 404 });
    }

    const testCandidates =
      disambiguateIndex !== undefined &&
      disambiguateIndex >= 0 &&
      disambiguateIndex < candidates.length
        ? [candidates[disambiguateIndex]]
        : candidates;

    const matches: { uid: string; phone: string }[] = [];

    await Promise.all(
      testCandidates.map(async (c) => {
        const ok = await verifyPassword(c.authEmail, password);
        if (ok) matches.push({ uid: c.uid, phone: c.phone });
      })
    );

    if (matches.length === 0) {
      return NextResponse.json({ error: "wrong_password" }, { status: 401 });
    }

    if (matches.length === 1) {
      const customToken = await adminAuth.createCustomToken(matches[0].uid);
      return NextResponse.json({ type: "success", token: customToken });
    }

    // Multiple accounts share the same name AND password — ask user to disambiguate
    const accounts = matches.map((m) => ({
      maskedPhone: maskPhone(m.phone),
      index: candidates.findIndex((c) => c.uid === m.uid),
    }));
    return NextResponse.json({ type: "ambiguous", accounts });
  } catch (err) {
    console.error("[login-by-name] error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
