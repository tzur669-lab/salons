import { describe, it, expect } from "vitest";
import { buildFullPhone, e164ToLocal, isValidLocalPhone } from "./phone";

describe("buildFullPhone", () => {
  it("converts a local number with leading zero to E.164", () => {
    expect(buildFullPhone("0501234567")).toBe("+972501234567");
  });

  it("handles dashes and spaces", () => {
    expect(buildFullPhone("050-123 4567")).toBe("+972501234567");
  });

  it("handles a 9-digit number without leading zero", () => {
    expect(buildFullPhone("501234567")).toBe("+972501234567");
  });
});

describe("e164ToLocal", () => {
  it("converts E.164 Israel back to local with leading zero", () => {
    expect(e164ToLocal("+972501234567")).toBe("0501234567");
  });

  it("tolerates a number without the + sign", () => {
    expect(e164ToLocal("972501234567")).toBe("0501234567");
  });

  it("falls back to digits for a non-Israel number", () => {
    expect(e164ToLocal("+15551234567")).toBe("15551234567");
  });
});

describe("buildFullPhone ∘ e164ToLocal round-trip", () => {
  it("is stable across the round-trip", () => {
    expect(e164ToLocal(buildFullPhone("0501234567"))).toBe("0501234567");
  });
});

describe("isValidLocalPhone", () => {
  it("accepts a full local number", () => {
    expect(isValidLocalPhone("0501234567")).toBe(true);
  });

  it("rejects too-short input", () => {
    expect(isValidLocalPhone("12345")).toBe(false);
  });
});
