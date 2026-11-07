/**
 * Spots one-time codes, PINs, passwords and similar secrets in text a user pastes, types or shares,
 * so the app can throw the text away before it is shown, saved, or sent to the AI.
 *
 * A secret is a code number (4 to 8 digits) sitting next to a word like OTP, PIN or "verification code".
 * Warnings that only *mention* PIN/OTP ("Never share your PIN. Call 16247") are not secrets.
 */

const KEYWORD = String.raw`(?:otp|one[\s-]*time[\s-]*(?:pass(?:word|code)?|code|pin)|verification[\s-]*code|v-?code|security[\s-]*code|safety[\s-]*code|secret[\s-]*code|confirmation[\s-]*code|auth(?:entication)?[\s-]*code|login[\s-]*code|pass[\s-]*code|password|pin(?:[\s-]*(?:code|number|no\.?))?|m?pin|cvv|cvc|ওটিপি|পিন|পাসওয়ার্ড|ভেরিফিকেশন\s*কোড|নিরাপত্তা\s*কোড|কোড)`;

// "OTP is 482913", "PIN: 1234", "your verification code - 5521"
const KEYWORD_THEN_CODE = new RegExp(String.raw`(?<![a-z])${KEYWORD}(?![a-z])([^0-9]{0,30}?)(?<![\d.,])(\d{4,8})(?![\d.,]\d)`, 'giu');
// "482913 is your OTP", "5521 is your Facebook code"
// (here a plain "code" counts too, because "<number> is your ... code" is always a login code)
const CODE_THEN_KEYWORD = new RegExp(String.raw`(?<![\d.,])(\d{4,8})(?![\d.,]\d)\s*(?:is|=|:|-|holo|hocche|হলো|হচ্ছে)?\s*(?:your|the|apnar|আপনার)?\s*(?:[\p{L}]+\s+){0,2}?(?:${KEYWORD}|code)(?![a-z])`, 'giu');

// Numbers right after these words are phone numbers or money, not codes
// (including labelled IDs: "TxnId 4829", "Ref No: 482910", "Order 12345")
const NOT_A_CODE = /(call|helpline|hotline|dial|contact|tk\.?|bdt|৳|taka|amount|balance|fee|হেল্পলাইন|হটলাইন|কল|টাকা|ব্যালেন্স|পরিমাণ|(?:trx|txn|ref(?:erence)?|order|invoice|ticket)\s*(?:id|no\.?|number|#)?)\W*$/i;

const HAS_KEYWORD = new RegExp(String.raw`(?<![a-z])${KEYWORD}(?![a-z])`, 'iu');
// A number standing on its own: not money (1,025.64), not part of a word or code (RM4673),
// not a date or time (20/10/2026, 14:45)
const STANDALONE_NUMBER = /(?<![\w.,৳\/-])(\d{4,8})(?![\w\/]|[.,:-]\d)/g;

// Codes written in groups, like "309-842" or "309 842" (groups of 3-4 digits, so dates like 20-10-26 don't count)
const SPLIT_CODE = /(?<![\w.,৳\/-])(\d{3,4}[-\s]\d{3,4})(?![\w\/]|[.,:-]\d)/g;
// One digit at a time, like "4 8 2 9 1 0" (only counted inside a sentence about an OTP / PIN)
const SPACED_DIGITS = /(?<![\w.,])\d(?:[ -]\d){3,7}(?![\w]|[.,]\d)/g;

/** A sentence that talks about an OTP / PIN and also holds a standalone code, however far apart they are */
function sentenceHoldsCode(text: string): boolean {
  for (const sentence of text.split(/(?<=[.!?।])\s+|\n+/)) {
    if (!HAS_KEYWORD.test(sentence)) continue;
    for (const m of [...sentence.matchAll(STANDALONE_NUMBER), ...sentence.matchAll(SPLIT_CODE), ...sentence.matchAll(SPACED_DIGITS)]) {
      const before = sentence.slice(Math.max(0, (m.index ?? 0) - 12), m.index ?? 0);
      if (!NOT_A_CODE.test(before)) return true;
    }
  }
  return false;
}

// "password is Admin@Pass!", "Wi-Fi password: hunter22". The value must look like a real password
// (has a digit or symbol), so "change your password regularly" isn't flagged.
const PASSWORD = /(?<![a-z])(?:password|passcode|pass\s*code|pwd|wi-?fi\s*(?:password|key)|পাসওয়ার্ড)(?![a-z])\s*(?:is|:|=|-)\s*["'“]?(\S{4,})/giu;
const LOOKS_LIKE_PASSWORD = /\d|[^\p{L}\p{N}\s"'”.,!?]/u;

// Private keys, seed / recovery phrases, backup codes and access tokens, which are secrets even without digits
// (dots that don't end a sentence, like "...8F9c", may sit between the words and the value)
const KEY_PHRASE = /(?<![a-z])(?:(?:private|secret|shard|recovery|wallet|api)\s+(?:key|phrase|seed)|seed\s*phrase|recovery\s*(?:details|words)|mnemonic|backup\s*codes?|access\s*token)(?![a-z])(?:[^.\n]|\.(?!\s|$)){0,80}?(?:\bis\b|:|=)\s*["'“]?((?:[\p{L}\p{N}]+[\s-]){3,}[\p{L}\p{N}]+|[^\s"'”]{12,})/iu;

function holdsPasswordOrKey(text: string): boolean {
  for (const m of text.matchAll(PASSWORD)) {
    if (LOOKS_LIKE_PASSWORD.test(m[1])) return true;
  }
  return KEY_PHRASE.test(text);
}

// National ID numbers (10, 13 or 17 digits) next to an NID label, with any punctuation between ("NID No: ", "নং >>> ")
const NID = /(?<![a-z])(?:nid|national\s*id(?:entity)?(?:\s*card)?|smart\s*card|জাতীয়\s*পরিচয়(?:\s*পত্র)?|এনআইডি)(?![a-z])(?:\s*(?:no\.?|number|নং|নম্বর))?[^\p{L}\p{N}]{0,8}(\d{10}|\d{13}|\d{17})(?!\d)/iu;

/**
 * Bangla digits (০-৯) to 0-9. Regex `\d` only knows 0-9, so without this a code like "৪৮২৯১৩"
 * or a phone number like "০১৭১২৩৪৫৬৭৮" would slip past every rule.
 */
export function toAsciiDigits(text: string): string {
  return text
    .replace(/[০-৯]/g, d => String(d.charCodeAt(0) - 0x09E6))
    .replace(/[０-９]/g, d => String(d.charCodeAt(0) - 0xFF10)); // full-width digits, e.g. "４８２９"
}

// Invisible characters (zero-width spaces/joiners, soft hyphens, BOM) can be slipped between digits or
// letters ("4​8​2​9", "O​T​P") to break every pattern without changing what's shown on screen
const INVISIBLE = /[­᠎​-‏⁠-⁤﻿]/g;

/** Text as the rules should see it: no invisible characters, and every digit as 0-9 */
export function normalizeForScan(text: string): string {
  return toAsciiDigits(text.replace(INVISIBLE, ''));
}

export function containsSecret(input: string): boolean {
  if (!input) return false;
  const text = normalizeForScan(input);
  if (NID.test(text)) return true;
  if (holdsPasswordOrKey(text)) return true;
  if (!/\d/.test(text)) return false; // every code has a digit (spaced codes like "4 8 2 9" included)
  if (sentenceHoldsCode(text)) return true;

  for (const m of text.matchAll(KEYWORD_THEN_CODE)) {
    const gap = m[1];
    // A sentence break between the word and the number usually means they're unrelated
    if (/[.!?।\n]\s*\S/.test(gap)) continue;
    if (NOT_A_CODE.test(gap)) continue;
    return true;
  }
  for (const m of text.matchAll(CODE_THEN_KEYWORD)) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 12), m.index ?? 0);
    if (NOT_A_CODE.test(before)) continue;
    return true;
  }
  return false;
}

export const SECRET_WARNING =
  "For your safety, I deleted that message. Please never share OTPs, PINs, passwords or verification codes with anyone, including this app.";
