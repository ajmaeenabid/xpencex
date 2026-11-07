import { auth } from "../../shared/firebase";
import { normalizeExpense, ExtractedExpense } from "../expenses/expense";
import { parseModelJson } from "./aiResponse";
import { restoreLineBreaks } from "./markdownRepair";
import { ReplyLanguage, UNSUPPORTED_NOTICE, attachmentLanguageRules, languageRules } from "./language";
import { callWorker } from "../../shared/lib/workerApi";
import type { Limits } from "./limits";

// The Gemini key lives on our own server (see /ai-server), never in the app. The app sends the
// user's login token, and the server checks it and enforces a daily limit per user.
const AI_URL = import.meta.env.VITE_AI_WORKER_URL as string | undefined;

class AiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Part = { text: string } | { inlineData: { data: string; mimeType: string } };

// Every reply from the server says how much of each daily limit is used; the chat shows warnings from this
let limitsListener: ((limits: Limits) => void) | null = null;
export const onLimitsChange = (listener: ((limits: Limits) => void) | null) => { limitsListener = listener; };
export const fetchLimits = async () => (await callWorker<{ limits: Limits }>('/limits')).limits;

// `backup` names the model that answered when the main one was busy or retired
type Generated = { text: string; backup?: string };

async function generate(parts: Part[], schema?: object): Promise<Generated> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new AiError(401, "Not signed in");
  if (!AI_URL) throw new AiError(0, "VITE_AI_WORKER_URL is not set");
  let res: Response;
  try {
    res = await fetch(AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ parts, schema }),
    });
  } catch {
    // fetch only throws when the server can't be reached at all (offline, or not running)
    throw new AiError(-1, "AI server unreachable");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body.limits) limitsListener?.(body.limits);
    throw new AiError(res.status, body.error || res.statusText);
  }
  const body = await res.json();
  if (body.limits) limitsListener?.(body.limits);
  return { text: body.text as string, backup: typeof body.model === 'string' ? body.model : undefined };
}

// A used-up daily limit deserves a clear message; everything else gets the generic one
const friendly = (error: unknown, fallback: string) => {
  if (!(error instanceof AiError)) return fallback;
  if (error.status === 429) return "You've reached today's limit. It resets at midnight. You can still add expenses manually.";
  if (error.status === -1) return "I can't reach the AI server right now. Check your internet connection and try again.";
  // The server explains these itself (every model busy, out of quota, or retired), so show its words
  if ((error.status === 400 || error.status === 413 || error.status === 502 || error.status === 503) && error.message) return error.message;
  return fallback;
};

export type { ExtractedExpense };

// How chat answers are written: brief answer first, then a scannable list or table
const RESPONSE_STYLE = `
    You help with anything about the user's money: tracking, reports, budgets, saving advice, and planning
    (trips, events, purchases) with cost estimates. Never say a plan or explanation is outside your abilities.

    How to write "content" when type is "chat" (GitHub-flavoured Markdown):
    - Start with one sentence that sums up the answer. No greetings or filler such as "Of course!".
    - Then ALWAYS give the full answer below it. The summary sentence alone is never a complete reply.
    - Give the details as bullet lists. Start each bullet with a **bold label:** followed by the explanation.
    - When the answer involves money (expense breakdowns, cost estimates, budgets, comparisons, plans with costs),
      use a Markdown table with clear columns (e.g. | Item | Cost | Note |) and a final **Total** row.
    - Put every paragraph, list item, heading and table row on its own line, with a blank line before and after a table.
    - For multi-part answers, cover every part. A 3-day plan must have **Day 1**, **Day 2** and **Day 3** headings,
      each with its activities, where to stay or eat, and that day's costs.
    - Use the user's real spending data and currency when relevant. If something is an estimate, say so briefly.
    - Be as detailed as the question needs, but use short lines so it is easy to read on a phone.
    - You may end with one or two lines of practical advice based on the user's spending.
    - Write like a friendly person talking to a friend: plain everyday words, no corporate or robotic phrases
      (avoid "Here's a breakdown", "delve", "crucial", "Certainly"). Never use em dashes or en dashes; use commas or full stops.

    "steps": 1 to 4 very short past-tense phrases describing what you actually did to answer,
    e.g. "Checked your last 100 expenses", "Totalled food spending this month", "Estimated hotel costs in Cox's Bazar".
    Never claim you searched the internet: you cannot browse.`;

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

// The last few messages, so follow-up questions ("why didn't you…", "make it cheaper") make sense
function historyBlock(history: ChatTurn[]) {
  if (!history.length) return 'None (this is the first message).';
  return history
    .slice(-10)
    .map(t => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content.slice(0, 2000)}`)
    .join('\n');
}

type ChatResult = {
  type: 'chat' | 'expense' | 'income';
  content: string;
  expense?: ExtractedExpense;
  steps?: string[];
  backup?: string;
  // The language the user was using, so the app's own sentences can match it
  language?: ReplyLanguage;
  // What was said in a voice message, written out, so the next question can refer back to it
  heard?: string;
};

function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(asText).join('\n');
  if (value == null) return '';
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
}

/** Swap long dashes for plain punctuation: "500–800" becomes "500-800", "beach — then" becomes "beach, then" */
function noDashes(s: string): string {
  return s
    .replace(/(\d)\s*[–—]\s*(\d)/g, '$1-$2')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/,\s*([.,!?;:])/g, '$1');
}

function parseResult({ text, backup }: Generated): ChatResult {
  const result = parseReply(text);
  return backup ? { ...result, backup } : result;
}

export function parseReply(text: string): ChatResult {
  let parsed: any;
  try {
    parsed = parseModelJson(text);
  } catch (err) {
    // Keep the raw reply in the browser console (F12) so a bad response can be diagnosed
    console.error('Could not read the AI reply:', text);
    throw err;
  }
  // Another language: the app's own notice, in both languages, and nothing recorded
  if (parsed.language === 'other') return { type: 'chat', content: UNSUPPORTED_NOTICE };
  parsed.language = parsed.language === 'bn' || parsed.language === 'en' ? parsed.language : undefined;
  // The model occasionally returns content as a list or object; the chat can only show text
  parsed.content = noDashes(restoreLineBreaks(asText(parsed.content)));
  parsed.steps = Array.isArray(parsed.steps)
    ? parsed.steps.filter((s: unknown) => typeof s === 'string' && s.trim()).slice(0, 4).map(noDashes)
    : undefined;
  if (parsed.type === 'expense') {
    const expense = parsed.expense?.category === 'INVALID' ? parsed.expense : normalizeExpense(parsed.expense);
    if (!expense) return { type: 'chat' as const, content: parsed.content || "I couldn't figure out the amount. Could you rephrase?" };
    return { ...parsed, expense };
  }
  if (parsed.type === 'income') {
    // Same clean-up as expenses: a real positive number and a full date, as the database requires
    const income = normalizeExpense({ title: 'Money received', ...parsed.expense });
    if (!income) return { type: 'chat' as const, content: parsed.content || "I couldn't figure out the amount. Could you rephrase?" };
    return { ...parsed, expense: income };
  }
  return parsed;
}

export async function processInput(input: string, categories: string[], spendingContext = '', history: ChatTurn[] = [], lang: ReplyLanguage = 'en'): Promise<ChatResult> {
  const prompt = `
    You are XpenceX Assistant, a smart expense tracker.
    ${languageRules(lang)}
    Conversation so far (oldest first):
    ${historyBlock(history)}

    User input: "${input}"
    Available categories: ${categories.join(', ')}
    Current Date: ${new Date().toISOString()}
    User's recent spending (use this to answer questions about reports, totals and budget advice):
    ${spendingContext || 'No data available.'}

    Tasks:
    1. Detect if the user wants to record an expense, record money they received, or just chat/ask for advice.
       - Money received (credited, deposited, cash in, received, salary in) is type "income": put its title, amount and date in "expense".
       - Never repeat account numbers, card numbers or phone numbers, even partly. If the user wrote one, leave it out.
       - If the message contains an OTP, PIN, password or verification code, do not repeat or use it. Reply as type "chat"
         with only a short warning not to share such codes with anyone, including this app.
    2. If it's an expense:
       - Mobile wallet or bank SMS for Payment, Send Money, Cash Out, Recharge, debit or purchase are expenses; money received is income.
       - Correct any misheard words (e.g., "speed" -> "spent", "fod" -> "food").
       - Extract: title, amount (number), category (must match one of the available categories or be "Other"), date (ISO string).
       - If the category doesn't strictly match, try fuzzy matching to available categories.
       - If it's a completely new category not in the list, set category to "INVALID".
    3. If it's a chat:
       - Provide helpful financial advice or answer questions, following the language rules above.
    ${RESPONSE_STYLE}

    Return ONLY a JSON object:
    {
      "language": "en" | "bn" | "other",
      "type": "chat" | "expense" | "income",
      "content": "Your response to the user",
      "steps": ["..."],
      "expense": { "title": "...", "amount": 0, "category": "...", "date": "...", "notes": "..." } // Only if type is expense
    }
  `;

  try {
    return parseResult(await generate([{ text: prompt }]));
  } catch (error) {
    console.error("Gemini Error:", error);
    return { type: 'chat', content: friendly(error, "I'm sorry, I couldn't process that. Please try again.") };
  }
}

export async function processAudioInput(audioData: string, mimeType: string, categories: string[], spendingContext = '', history: ChatTurn[] = [], lang: ReplyLanguage = 'en'): Promise<ChatResult> {
  const prompt = `
    You are XpenceX Assistant, a smart expense tracker.
    ${languageRules(lang)}
    Conversation so far (oldest first):
    ${historyBlock(history)}

    The user has provided an audio message.
    If they say an OTP, PIN, password or verification code, never repeat it: reply as type "chat" with only a short warning
    not to share such codes with anyone. Never repeat account, card or phone numbers either.
    Available categories: ${categories.join(', ')}
    Current Date: ${new Date().toISOString()}
    User's recent spending (use this to answer questions about reports, totals and budget advice):
    ${spendingContext || 'No data available.'}

    Tasks:
    1. Listen to the audio, and work out its language using the language rules above.
    2. Understand the intent.
    3. If the user wants to record an expense:
       - Extract: title (translate to English), amount (number), category (must match one of the available categories or be "Other"), date (ISO string).
       - If the category doesn't strictly match, try fuzzy matching to available categories.
       - If it's a completely new category not in the list, set category to "INVALID".
    4. If it's a chat:
       - Provide helpful financial advice or answer questions, following the language rules above.
    ${RESPONSE_STYLE}

    Return ONLY a JSON object:
    {
      "language": "en" | "bn" | "other",
      "heard": "What the user said, written out in the language they spoke. Leave out any code, password, or account, card or phone number.",
      "type": "chat" | "expense" | "income",
      "content": "Your response to the user, following the language rules",
      "steps": ["..."],
      "expense": { "title": "...", "amount": 0, "category": "...", "date": "...", "notes": "..." } // Only if type is expense
    }
  `;

  try {
    return parseResult(await generate([
      { text: prompt },
      { inlineData: { data: audioData.split(',')[1] || audioData, mimeType } },
    ]));
  } catch (error) {
    console.error("Gemini Audio Error:", error);
    return { type: 'chat', content: friendly(error, "I'm sorry, I couldn't understand the audio. Please try again.") };
  }
}

export async function processAttachment(
  file: { data: string; mimeType: string; name: string },
  message: string,
  categories: string[],
  spendingContext = '',
  history: ChatTurn[] = [],
  lang: ReplyLanguage = 'en',
): Promise<ChatResult> {
  const prompt = `
    You are XpenceX Assistant, a smart expense tracker.
    ${attachmentLanguageRules(lang, !!message)}
    Conversation so far (oldest first):
    ${historyBlock(history)}

    The user attached a file named "${file.name}".
    ${message ? `Their message about it: "${message}"` : 'They did not write a message.'}
    Available categories: ${categories.join(', ')}
    Current Date: ${new Date().toISOString()}
    User's recent spending (use this to answer questions about reports, totals and budget advice):
    ${spendingContext || 'No data available.'}

    Tasks:
    1. Do what their message asks, using the file. A spreadsheet arrives as plain text with commas between columns.
    2. With no message: if the file is a single receipt or bill, record it as an expense. Otherwise describe in short
       what the file shows and what it means for their money.
    3. To record an expense, extract: title (translate to English), amount (the total, as a number),
       category (must match one of the available categories or be "Other"), date (ISO string, today if not shown).
    4. If a file holds an OTP, PIN, password or verification code, do not repeat it, and warn them briefly not to share such codes.
       Never repeat account, card or phone numbers, even partly.
    ${RESPONSE_STYLE}

    Return ONLY a JSON object:
    {
      "language": "en" | "bn" | "other",
      "type": "chat" | "expense" | "income",
      "content": "Your response to the user, following the language rules",
      "steps": ["..."],
      "expense": { "title": "...", "amount": 0, "category": "...", "date": "...", "notes": "..." } // Only if type is expense
    }
  `;

  try {
    return parseResult(await generate([
      { text: prompt },
      { inlineData: { data: file.data, mimeType: file.mimeType } },
    ]));
  } catch (error) {
    console.error("Attachment Error:", error);
    return { type: 'chat', content: friendly(error, "I'm sorry, I couldn't read that file. Please try again.") };
  }
}
