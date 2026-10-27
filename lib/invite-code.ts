// Household invite codes (PRD A2): 6 characters from A–Z and 2–9, leaving out
// 0/O and 1/I so a code read aloud or typed on a phone can't be misread.
export const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 6;
export const INVITE_CODE_TTL_DAYS = 7;

const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

/** A new random code. The alphabet has 32 characters, so `byte & 31` is unbiased. */
export function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(INVITE_CODE_LENGTH));
  return Array.from(bytes, (b) => INVITE_CODE_ALPHABET[b & 31]).join("");
}

/** Uppercases and drops spaces and dashes, so "abc-234" matches "ABC234". */
export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

export function isInviteCode(code: string): boolean {
  return INVITE_CODE_PATTERN.test(code);
}

export function inviteExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITE_CODE_TTL_DAYS * 24 * 60 * 60 * 1000);
}
