// Which language the assistant answers in: the one the user just used, not the app's setting.
export type ReplyLanguage = 'en' | 'bn';

const NOTICE_EN = 'Sorry, this language is not supported. Please use English or Bangla.';
const NOTICE_BN = 'দুঃখিত, এই ভাষাটি সমর্থিত নয়। অনুগ্রহ করে ইংরেজি বা বাংলা ব্যবহার করুন।';

// The app shows this itself, so the wording stays exact whatever the AI writes
export const UNSUPPORTED_NOTICE = `${NOTICE_EN}\n\n${NOTICE_BN}`;

const BENGALI_LETTERS = /[ঀ-৿]/;

/** For text read on the phone, without the AI (such as a shared SMS) */
export const scriptLanguage = (text: string): ReplyLanguage => (BENGALI_LETTERS.test(text) ? 'bn' : 'en');

const LANGUAGE_NAMES: Record<ReplyLanguage, string> = { en: 'English', bn: 'Bangla (Bengali script)' };

const SHARED_RULES = `
    - English gets a reply in English.
    - Bangla gets a reply in Bangla (Bengali script). Bangla typed in English letters ("ami 200 taka khoroch korsi") is Bangla too, so it also gets a reply in Bengali script.
    - A message mixing English and Bangla gets a reply in whichever language most of it uses. English words inside a Bangla sentence ("budget", "salary") are normal Bangla.
    - A foreign word or two inside an English or Bangla message is fine, and that message counts as English or Bangla.
      Food names, brand names, place names and words like "gracias" never make a message another language.
    - Keep amounts and currency symbols exactly as they are.`;

/**
 * The rules for text and voice messages. The app's language is only a tie-break for messages with
 * no language of their own, such as "500". The reply reports the language it found, so the app can
 * match its own sentences and show the "not supported" notice itself.
 */
export const languageRules = (appLanguage: ReplyLanguage) => `
    Language rules (these override the app's language setting):
    Work out the language of the user's latest message. Earlier messages don't matter.${SHARED_RULES}
    - If the message has no clear language (only numbers, or a word like "ok"), reply in ${LANGUAGE_NAMES[appLanguage]}.
    - Only when most of the message is in another language (Hindi, Urdu, Arabic, Spanish and so on), it is not supported, even if you understand it.
      Set "language" to "other", set type to "chat", leave "content" empty, and do not answer or record anything.
    Set "language" in your JSON to "en", "bn" or "other": the language of the user's message, not of your reply.`;

/** The rules when a photo or file is attached: only the user's typed message decides the language */
export const attachmentLanguageRules = (appLanguage: ReplyLanguage, hasMessage: boolean) => hasMessage
  ? `${languageRules(appLanguage)}
    The attached file may be in any language: read it normally. Only the user's typed message decides the language.`
  : `
    Language rules: the user attached a file with no message, so reply in ${LANGUAGE_NAMES[appLanguage]}.
    The attached file may be in any language: read it normally, and never refuse it because of its language.
    Keep amounts and currency symbols exactly as they are. Set "language" in your JSON to "${appLanguage}".`;

/** The rules for live chat, where the assistant speaks the notice because there is no JSON reply */
export const liveLanguageRules = (appLanguage: ReplyLanguage) => `
    Language rules (these override the app's language setting):
    Listen to the language of what the user just said, and answer in that language.${SHARED_RULES}
    - If you can't tell, answer in ${LANGUAGE_NAMES[appLanguage]}.
    - Only when most of what they said is in another language (Hindi, Urdu, Arabic, Spanish and so on), it is not supported, even if you understand it.
      Say only these two sentences and do not answer or record anything: "${NOTICE_EN}" "${NOTICE_BN}"`;
