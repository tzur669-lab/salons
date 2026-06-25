/**
 * Pure phone-number helpers (no Firebase) — shared by the auth/recovery flows.
 *
 * The app stores phones in Firestore `users.phone` as LOCAL digits with a leading
 * zero (e.g. "0501234567"), the way they were typed. Firebase phone auth needs
 * E.164 ("+972501234567"). These helpers are the single source of truth for the
 * conversion in both directions so the login + profile recovery flows agree.
 */

/** Local digits (with/without leading 0, spaces, dashes) → E.164 Israel: "+972XXXXXXXXX". */
export function buildFullPhone(raw: string): string {
  const cleaned = raw.replace(/\D/g, "");
  const normalized = cleaned.startsWith("0") ? cleaned.slice(1) : cleaned;
  return `+972${normalized}`;
}

/**
 * E.164 Israel → local digits with leading zero: "+972501234567" → "0501234567".
 * This is the inverse of buildFullPhone and matches how `users.phone` is stored,
 * so a server-verified `phone_number` claim can be looked up in Firestore.
 * Defensive: if the input isn't a +972 number, strip a leading "+" and return digits.
 */
export function e164ToLocal(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.startsWith("972")) return `0${digits.slice(3)}`;
  return digits;
}

/** A local Israeli mobile is ~9–10 digits once the country code is stripped. */
export function isValidLocalPhone(raw: string): boolean {
  return raw.replace(/\D/g, "").length >= 9;
}
