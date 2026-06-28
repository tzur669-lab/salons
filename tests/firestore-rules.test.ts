/**
 * Firestore security-rules tests (Phase 1 isolation gate).
 *
 * Runs against the Firestore EMULATOR — `npm run test:rules` boots it via
 * `firebase emulators:exec`. Excluded from the default `npm test` (which globs
 * src/**) because it needs the emulator + Java.
 *
 * Proves the multi-tenant isolation invariants the hardening pass introduced:
 *   - appointment `list` is owner-OR-self (no cross-tenant enumeration)
 *   - the legacy anonymous-write `appointments` collection is gone
 *   - a salon's `ownerUid` cannot be reassigned by its owner
 *   - the per-salon `clients` directory is owner-read, server-write
 *   - server-only mutexes stay deny-all
 */
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, updateDoc, addDoc, collection, getDocs, query, where,
} from "firebase/firestore";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, it } from "vitest";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-salons",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => { await testEnv.cleanup(); });

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed two tenants + appointments, bypassing rules.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "salons/salonA"), {
      slug: "salonA", displayName: "Salon A", ownerUid: "ownerA", status: "active", createdAt: new Date(),
    });
    await setDoc(doc(db, "salons/salonB"), {
      slug: "salonB", displayName: "Salon B", ownerUid: "ownerB", status: "active", createdAt: new Date(),
    });
    await setDoc(doc(db, "salons/salonA/appointmentsPending/appt1"), {
      clientId: "clientX", clientName: "X", clientPhone: "050", status: "pending",
    });
    await setDoc(doc(db, "salons/salonA/appointmentsPending/appt2"), {
      clientId: "clientY", clientName: "Y", clientPhone: "051", status: "pending",
    });
    await setDoc(doc(db, "salons/salonA/clients/clientX"), { clientId: "clientX", name: "X", phone: "050" });
  });
});

describe("appointment list — owner-OR-self", () => {
  it("DENIES an authenticated non-owner listing another salon's appointments", async () => {
    const clientX = testEnv.authenticatedContext("clientX").firestore();
    // No clientId==self constraint → must be rejected (rules are not filters).
    await assertFails(getDocs(collection(clientX, "salons/salonA/appointmentsPending")));
  });

  it("ALLOWS the owner to list all their salon's appointments", async () => {
    const ownerA = testEnv.authenticatedContext("ownerA").firestore();
    await assertSucceeds(getDocs(collection(ownerA, "salons/salonA/appointmentsPending")));
  });

  it("ALLOWS a client to list ONLY their own appointments (clientId==self)", async () => {
    const clientX = testEnv.authenticatedContext("clientX").firestore();
    await assertSucceeds(getDocs(query(
      collection(clientX, "salons/salonA/appointmentsPending"),
      where("clientId", "==", "clientX"),
    )));
  });

  it("DENIES a client querying someone else's appointments by clientId", async () => {
    const clientX = testEnv.authenticatedContext("clientX").firestore();
    await assertFails(getDocs(query(
      collection(clientX, "salons/salonA/appointmentsPending"),
      where("clientId", "==", "clientY"),
    )));
  });
});

describe("legacy anonymous-write collection is gone", () => {
  it("DENIES anonymous create on salons/{id}/appointments", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(anon, "salons/salonA/appointments"), { clientId: "guest" }));
  });
});

describe("salon ownership integrity", () => {
  it("DENIES the owner reassigning ownerUid", async () => {
    const ownerA = testEnv.authenticatedContext("ownerA").firestore();
    await assertFails(updateDoc(doc(ownerA, "salons/salonA"), { ownerUid: "attacker" }));
  });

  it("ALLOWS the owner to edit a non-identity field", async () => {
    const ownerA = testEnv.authenticatedContext("ownerA").firestore();
    await assertSucceeds(updateDoc(doc(ownerA, "salons/salonA"), { displayName: "Salon A (renamed)" }));
  });

  it("DENIES a non-owner updating the salon doc", async () => {
    const clientX = testEnv.authenticatedContext("clientX").firestore();
    await assertFails(updateDoc(doc(clientX, "salons/salonA"), { displayName: "hijacked" }));
  });
});

describe("per-salon clients directory", () => {
  it("ALLOWS the owner to read the client directory", async () => {
    const ownerA = testEnv.authenticatedContext("ownerA").firestore();
    await assertSucceeds(getDocs(collection(ownerA, "salons/salonA/clients")));
  });

  it("DENIES a client reading the directory, and ALL client-side writes", async () => {
    const clientX = testEnv.authenticatedContext("clientX").firestore();
    await assertFails(getDocs(collection(clientX, "salons/salonA/clients")));
    await assertFails(setDoc(doc(clientX, "salons/salonA/clients/clientX"), { name: "self" }));
  });
});

describe("server-only collections stay deny-all", () => {
  it("DENIES reading slotLocks and inviteCodes from the client", async () => {
    const ownerA = testEnv.authenticatedContext("ownerA").firestore();
    await assertFails(getDoc(doc(ownerA, "salons/salonA/slotLocks/2026-06-25")));
    await assertFails(getDoc(doc(ownerA, "inviteCodes/SALON2025")));
  });
});
