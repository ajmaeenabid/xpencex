// The welcome email a brand-new account gets once, right after choosing its username (chosen 2026-11-20,
// design approved from the preview https://claude.ai/artifact/739uvuRfpCkSLRYCExETZ6). It is sent through the
// Gmail API from the owner's admin Gmail, with a permission token from a separate small Google Cloud project
// (secrets GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN; see docs/welcome-email-setup.md).
// Without those secrets nothing is sent. A failure never stops the sign-up.

export type MailLang = 'en' | 'bn';

const SITE = 'https://xpencex.xpence.workers.dev';
// Email apps don't show SVG, so the logo is the PNG icon from the download site
const LOGO = `${SITE}/icon-192.png`;

const TEXT = {
  en: {
    subject: 'Welcome to Xpences, {name}!',
    preheader: 'Three easy steps to see where your money goes.',
    tagline: 'Your money, made simple',
    hello: 'Hi {name}, welcome to Xpences!',
    intro: "We're glad you're here. Xpences helps you see where your money goes, so every taka has a job.",
    three: 'Get started in three easy steps:',
    cash: 'Cash',
    s1title: 'Add your accounts',
    s1text: 'Add bKash, Nagad, Rocket, your bank and your cash wallet. See your whole balance in one place.',
    bubble: 'I spent 200 on lunch', card: 'Lunch · Food', confirm: 'Confirm',
    s2title: 'Just tell the AI',
    s2text: 'Type or say what you spent, paste a bKash or Nagad SMS, or snap a receipt. Nothing is saved until you confirm.',
    budget: 'Monthly budget', rent: 'Rent · every 1st', goal: 'Eid trip goal',
    s3title: 'Plan what’s ahead',
    s3text: 'Set a monthly budget, add the bills you pay every month and save toward goals. Xpences warns you before money runs short.',
    button: 'Open Xpences', buttonnote: 'Already on your phone? Just open the app.',
    safe: 'Your money records are private: only you can see them, and only your Google sign-in on an approved phone can open your account.',
    why: 'You got this email because you just created an Xpences account with {email}. We only email you about your account, never ads.',
    privacy: 'Privacy policy',
  },
  bn: {
    subject: 'Xpences-এ স্বাগতম, {name}!',
    preheader: 'তিনটি সহজ ধাপে দেখুন আপনার টাকা কোথায় যায়।',
    tagline: 'আপনার টাকার হিসাব, সহজভাবে',
    hello: 'হ্যালো {name}, Xpences-এ স্বাগতম!',
    intro: 'আপনাকে পেয়ে আমরা খুশি। Xpences দেখায় আপনার টাকা কোথায় যায়, যাতে প্রতিটি টাকার একটা কাজ থাকে।',
    three: 'তিনটি সহজ ধাপে শুরু করুন:',
    cash: 'নগদ',
    s1title: 'আপনার অ্যাকাউন্ট যোগ করুন',
    s1text: 'bKash, Nagad, Rocket, আপনার ব্যাংক আর নগদ টাকার হিসাব যোগ করুন। পুরো ব্যালেন্স এক জায়গায় দেখুন।',
    bubble: 'দুপুরের খাবারে ২০০ খরচ করেছি', card: 'দুপুরের খাবার · খাবার', confirm: 'নিশ্চিত করুন',
    s2title: 'শুধু AI-কে বলুন',
    s2text: 'কত খরচ হলো লিখুন বা বলুন, bKash বা Nagad-এর SMS পেস্ট করুন, বা রসিদের ছবি তুলুন। আপনি নিশ্চিত না করা পর্যন্ত কিছুই সেভ হয় না।',
    budget: 'মাসিক বাজেট', rent: 'বাসা ভাড়া · প্রতি মাসের ১ তারিখ', goal: 'ঈদ ভ্রমণের লক্ষ্য',
    s3title: 'সামনের পরিকল্পনা করুন',
    s3text: 'মাসিক বাজেট ঠিক করুন, প্রতি মাসের বিল যোগ করুন আর লক্ষ্যের জন্য সঞ্চয় করুন। টাকা কম পড়ার আগেই Xpences আপনাকে জানাবে।',
    button: 'Xpences খুলুন', buttonnote: 'ফোনে আগেই আছে? শুধু অ্যাপটি খুলুন।',
    safe: 'আপনার টাকার হিসাব সম্পূর্ণ ব্যক্তিগত: শুধু আপনিই দেখতে পারেন, আর শুধু অনুমোদিত ফোনে আপনার Google সাইন-ইন দিয়েই অ্যাকাউন্ট খোলে।',
    why: 'আপনি এই ইমেইল পেয়েছেন কারণ আপনি এইমাত্র {email} দিয়ে একটি Xpences অ্যাকাউন্ট খুলেছেন। আমরা শুধু আপনার অ্যাকাউন্ট নিয়ে ইমেইল পাঠাই, কোনো বিজ্ঞাপন নয়।',
    privacy: 'গোপনীয়তা নীতি',
  },
} as const;

/** The language to write in: the app's, when it says; otherwise Bangla for a name in Bangla letters */
export function mailLanguage(appLang: unknown, username: string): MailLang {
  if (appLang === 'en' || appLang === 'bn') return appLang;
  return /[ঀ-৿]/.test(username) ? 'bn' : 'en';
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Every line of the email in one language, with the name and address filled in (not yet made safe for HTML) */
export function welcomeText(lang: MailLang, name: string, email: string) {
  const fill = (s: string) => s.replace('{name}', name).replace('{email}', email);
  return Object.fromEntries(Object.entries(TEXT[lang]).map(([k, v]) => [k, fill(v)])) as Record<keyof typeof TEXT.en, string>;
}

/** The email itself: tables and inline styles only, the same design as the approved preview */
export function welcomeHtml(lang: MailLang, name: string, email: string): string {
  const t = Object.fromEntries(Object.entries(welcomeText(lang, name, email)).map(([k, v]) => [k, escapeHtml(v)])) as Record<keyof typeof TEXT.en, string>;
  const chip = 'background:#FFFFFF;border-radius:10px;padding:8px 10px';
  const stepTitle = 'font-size:16px;font-weight:700;color:#C94A1B';
  const stepText = 'font-size:14px;line-height:1.55;color:#5C4B41;margin-top:6px';
  const step = (picture: string, title: string, text: string, top: number) => `
    <tr><td style="padding:${top}px 24px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF4EC;border-radius:16px"><tr>
        <td width="46%" style="padding:16px;vertical-align:middle;font-size:12px">${picture}</td>
        <td style="padding:16px 18px 16px 8px;vertical-align:middle">
          <div style="${stepTitle}">${title}</div>
          <div style="${stepText}">${text}</div>
        </td>
      </tr></table>
    </td></tr>`;
  const amount = (v: string, color = '#2B211C') => `<span style="float:right;font-weight:700;color:${color}">${v}</span>`;
  const accounts = `
    <div style="${chip}"><span style="color:#E2136E">&#9679;</span> bKash &middot;&middot;&middot;811 ${amount('৳500')}</div>
    <div style="${chip};margin-top:6px"><span style="color:#2A6EBB">&#9679;</span> BRAC Bank ${amount('৳536')}</div>
    <div style="${chip};margin-top:6px"><span style="color:#14A06E">&#9679;</span> ${t.cash} ${amount('৳200')}</div>`;
  const chat = `
    <div style="background:#E8602B;color:#FFFFFF;border-radius:14px 14px 4px 14px;padding:8px 10px;margin-left:18px">${t.bubble}</div>
    <div style="${chip};margin-top:8px">${t.card} ${amount('৳200')}
      <div style="margin-top:7px;text-align:right"><span style="background:#FBE7DA;color:#C94A1B;border-radius:999px;padding:3px 10px;font-weight:700">${t.confirm}</span></div>
    </div>`;
  const plan = `
    <div style="${chip}">${t.budget} ${amount('৳5,000')}
      <div style="background:#F3E3D8;border-radius:99px;height:6px;margin-top:7px"><div style="background:#E8602B;width:40%;height:6px;border-radius:99px"></div></div>
    </div>
    <div style="${chip};margin-top:6px">${t.rent} ${amount('৳9,000')}</div>
    <div style="${chip};margin-top:6px">${t.goal} ${amount('60%', '#14A06E')}</div>`;

  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t.subject}</title></head>
<body style="margin:0;padding:0;background:#FBF6F1">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${t.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF6F1"><tr><td style="padding:20px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:20px;font-family:'Hind Siliguri',Arial,Helvetica,sans-serif;color:#2B211C">
  <tr><td style="padding:36px 32px 8px;text-align:center">
    <img src="${LOGO}" width="72" height="72" alt="Xpences" style="display:block;margin:0 auto;border-radius:18px">
    <div style="font-size:28px;font-weight:700;margin-top:14px;letter-spacing:-0.3px"><span style="color:#E8602B">X</span>pences</div>
    <div style="font-size:14px;color:#8A776B;margin-top:2px">${t.tagline}</div>
  </td></tr>
  <tr><td style="padding:20px 40px 4px;text-align:center">
    <div style="font-size:20px;font-weight:700">${t.hello}</div>
    <div style="font-size:15px;line-height:1.6;color:#5C4B41;margin-top:8px">${t.intro}</div>
    <div style="font-size:14px;color:#8A776B;margin-top:18px">${t.three}</div>
  </td></tr>
  ${step(accounts, t.s1title, t.s1text, 18)}
  ${step(chat, t.s2title, t.s2text, 12)}
  ${step(plan, t.s3title, t.s3text, 12)}
  <tr><td style="padding:28px 40px 6px;text-align:center">
    <a href="${SITE}" style="display:inline-block;background:#E8602B;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:15px;padding:13px 30px;border-radius:14px">${t.button}</a>
    <div style="font-size:13px;color:#8A776B;margin-top:10px">${t.buttonnote}</div>
  </td></tr>
  <tr><td style="padding:22px 40px 8px;text-align:center">
    <div style="font-size:14px;line-height:1.6;color:#5C4B41">${t.safe}</div>
  </td></tr>
  <tr><td style="padding:22px 32px 30px">
    <div style="border-top:1px solid #F0E3D9;padding-top:18px;text-align:center;font-size:12px;line-height:1.6;color:#9C8A7E">
      ${t.why}<br><a href="${SITE}/privacy.html" style="color:#C94A1B">${t.privacy}</a>
    </div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/** The plain-text copy for email apps that don't show HTML */
export function welcomePlain(lang: MailLang, name: string, email: string): string {
  const t = welcomeText(lang, name, email);
  return [t.hello, '', t.intro, '', t.three, '',
    `1. ${t.s1title}: ${t.s1text}`, `2. ${t.s2title}: ${t.s2text}`, `3. ${t.s3title}: ${t.s3text}`, '',
    `${t.button}: ${SITE}`, t.buttonnote, '', t.safe, '', t.why, `${t.privacy}: ${SITE}/privacy.html`].join('\r\n');
}

// ---- Packaging for the Gmail API (an RFC 2822 message in base64url) ----

const utf8Base64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
const wrap76 = (s: string) => s.replace(/.{1,76}/g, (line) => `${line}\r\n`).trimEnd();
/** A header word in any language (RFC 2047) */
const encodedWord = (s: string) => `=?UTF-8?B?${utf8Base64(s)}?=`;

export function buildMessage({ fromName, fromAddress, to, subject, html, text, boundary }: {
  fromName: string; fromAddress: string; to: string; subject: string; html: string; text: string; boundary: string;
}): string {
  if (/[\r\n]/.test(to + fromAddress)) throw new Error('Bad address');
  return [
    `From: ${encodedWord(fromName)} <${fromAddress}>`,
    `To: <${to}>`,
    `Subject: ${encodedWord(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(utf8Base64(text)),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(utf8Base64(html)),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

export const base64Url = (s: string) => utf8Base64(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// ---- Sending ----

export interface MailEnv {
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  MAIL_FROM_ADDRESS?: string; // the admin Gmail the token belongs to (wrangler.toml)
}

export const mailReady = (env: MailEnv) =>
  !!(env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN && env.MAIL_FROM_ADDRESS);

/** Sends the welcome email. Does nothing (false) when the mail secrets aren't set. */
export async function sendWelcomeEmail(env: MailEnv, to: string, name: string, lang: MailLang): Promise<boolean> {
  if (!mailReady(env) || !/^[^\s@<>]+@[^\s@<>]+$/.test(to)) return false;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID!, client_secret: env.GMAIL_CLIENT_SECRET!,
      refresh_token: env.GMAIL_REFRESH_TOKEN!, grant_type: 'refresh_token',
    }),
  });
  if (!tokenRes.ok) throw new Error(`Gmail sign-in failed ${tokenRes.status}: ${(await tokenRes.text()).slice(0, 200)}`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const t = welcomeText(lang, name, to);
  const raw = base64Url(buildMessage({
    fromName: 'Xpences', fromAddress: env.MAIL_FROM_ADDRESS!, to, subject: t.subject,
    html: welcomeHtml(lang, name, to), text: welcomePlain(lang, name, to),
    boundary: `xpences-${crypto.randomUUID()}`,
  }));
  const sent = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  if (!sent.ok) throw new Error(`Gmail send failed ${sent.status}: ${(await sent.text()).slice(0, 200)}`);
  return true;
}
