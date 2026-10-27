import { describe, expect, it } from "vitest";
import {
  generateInviteCode,
  INVITE_CODE_ALPHABET,
  inviteExpiry,
  isInviteCode,
  normalizeInviteCode,
} from "./invite-code";

describe("invite codes", () => {
  it("alphabet is A–Z and 2–9 without 0, O, 1 or I", () => {
    expect(INVITE_CODE_ALPHABET).toHaveLength(32);
    expect(new Set(INVITE_CODE_ALPHABET).size).toBe(32);
    for (const c of "0O1I") expect(INVITE_CODE_ALPHABET).not.toContain(c);
  });

  it("generates valid 6-character codes", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateInviteCode();
      expect(code).toMatch(/^[A-Z2-9]{6}$/);
      expect(isInviteCode(code)).toBe(true);
    }
  });

  it("normalizes what people type", () => {
    expect(normalizeInviteCode(" abc-234 ")).toBe("ABC234");
    expect(normalizeInviteCode("x7k p9q")).toBe("X7KP9Q");
  });

  it("rejects wrong length and look-alike characters", () => {
    expect(isInviteCode("ABC23")).toBe(false);
    expect(isInviteCode("ABC2345")).toBe(false);
    expect(isInviteCode("ABC10O")).toBe(false);
    expect(isInviteCode("ABCDEI")).toBe(false);
    expect(isInviteCode("abc234")).toBe(false);
  });

  it("expires 7 days later", () => {
    const from = new Date("2026-10-27T12:00:00Z");
    expect(inviteExpiry(from).toISOString()).toBe("2026-11-03T12:00:00.000Z");
  });
});
