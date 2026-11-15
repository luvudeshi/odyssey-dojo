// Phone numbers for the FaceTime call: what the host typed, turned into the +country form the call service wants.
// Pure, and shared by the page (to say what is wrong while typing) and the server (which never trusts the page).

export type PhoneResult =
  | { readonly ok: true; readonly e164: string }
  | { readonly ok: false; readonly why: string };

/** E.164: a plus, then 8 to 15 digits, the first one not zero. */
export const E164 = /^\+[1-9]\d{7,14}$/;

export const PHONE_MESSAGES = {
  empty: "Type your friend's phone number.",
  letters: "A phone number has only digits, like +1 555 555 0100.",
  short: "That number is too short. Add the country code, like +1 555 555 0100.",
  long: "That number is too long.",
  zero: "A country code does not start with 0. Try +1 555 555 0100.",
} as const;

/**
 * Turns "(555) 555-0100", "1 555 555 0100", "0044 20 ..." or "+44 20 ..." into "+15555550100" form.
 * A number with no plus is read as North American when it has 10 digits, or 11 starting with 1. Anything else
 * needs its country code.
 */
export function normalizePhone(raw: string): PhoneResult {
  const text = raw.trim();
  if (text === "") return { ok: false, why: PHONE_MESSAGES.empty };
  if (!/^[+\d\s().-]+$/.test(text) || text.indexOf("+", 1) !== -1) return { ok: false, why: PHONE_MESSAGES.letters };
  let digits = text.replace(/\D/g, "");
  let plus = text.startsWith("+");
  if (!plus && digits.startsWith("00")) {
    digits = digits.slice(2);
    plus = true;
  }
  if (!plus) {
    if (digits.length === 10) digits = `1${digits}`;
    else if (!(digits.length === 11 && digits.startsWith("1"))) {
      return { ok: false, why: digits.length > 15 ? PHONE_MESSAGES.long : PHONE_MESSAGES.short };
    }
  }
  if (digits.startsWith("0")) return { ok: false, why: PHONE_MESSAGES.zero };
  if (digits.length < 8) return { ok: false, why: PHONE_MESSAGES.short };
  if (digits.length > 15) return { ok: false, why: PHONE_MESSAGES.long };
  return { ok: true, e164: `+${digits}` };
}

/** "+15555550100" as "+1 555 555 0100" for North America; other countries are shown as they are. */
export function showPhone(e164: string): string {
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  if (us) return `+1 ${us[1] ?? ""} ${us[2] ?? ""} ${us[3] ?? ""}`;
  return e164;
}

/** For the screen while a call is on, and for logs: only the country digit and the last two digits are shown. */
export function maskPhone(e164: string): string {
  return e164.length <= 4 ? "+**" : `${e164.slice(0, 2)}${"*".repeat(e164.length - 4)}${e164.slice(-2)}`;
}
