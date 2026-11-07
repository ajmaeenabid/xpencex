# XpenceX: AI-Powered Personal Expense Tracker

XpenceX is a mobile-first expense tracker built for the CSE 412 (Software Engineering) course. Besides manual entry, you can log expenses by **chatting in Bangla, English or Banglish**, by **voice**, by **photographing a receipt**, or by **pasting/sharing a bKash, Nagad, Rocket or bank SMS**. You confirm every entry before it is saved.

## Features

- **Home**: monthly budget progress, today's and this week's totals, account balances, smart insights, recent activity
- **Accounts**: bank, bKash, Nagad and Rocket accounts with balances; optional automatic monthly deposits (e.g. salary); expenses deduct from the account they were paid from
- **Transactions**: search, filter, edit, delete, export to CSV; recurring expenses; bill splitting
- **AI assistant**: chat with saved history, budget advice and plans based on your real spending. It answers in the English or Bangla you use, whatever the app's language, and tells you when a language isn't supported
- **Message actions**: copy, resend or edit a prompt, and move between its versions with arrows. Copy or share an AI reply; a reply with a table is shared as a picture so it keeps its shape
- **Chat history**: keeps 20 chats, and removes the oldest unpinned one when full. Pinned chats stay and are listed first. The assistant remembers up to the last 10 messages from the past 10 days, including voice messages
- **Calculator and converter**: a calculator with history and optional scientific keys, a currency converter, loan and investment calculators with a month-by-month table, and discount, VAT or tip, bill split and savings goal tools. A calculated loan can be added to your loans in one step
- **Attachments**: take a photo, or pick from the gallery or files (JPG, PNG, WEBP, PDF, CSV, Excel .xlsx; 5 MB each). Only the file's name stays in the chat
- **Voice messages**: up to 30 seconds, with pause and resume
- **Live chat**: talk back and forth with the assistant by voice, up to 1 minute. Expenses you mention appear as cards to confirm
- **Fair use limits**: per chat, 2 voice messages, 2 live chats and 1 file; per day, 5 voice messages, 3 live chats, 3 files and 30 AI messages, reset at midnight Bangladesh time. The daily numbers can be changed in `ai-server/wrangler.toml`
- **SMS reading on the device**: money in and out from wallet and bank SMS, duplicate protection, no AI call needed
- **Privacy guard**: account, card and phone numbers are masked; messages containing OTPs, PINs, passwords, NID numbers or recovery phrases are deleted before they are shown, saved or sent anywhere
- **Reports**: spending analysis (category, account, pace, weekday, month-over-month), money in vs out per account, printable monthly PDF
- **Google sign-in**: no passwords to remember, a username chosen at first sign-in, and an optional 6-digit PIN lock on each device
- **Device approval**: each new device waits for the admin before it can open an account
- **Admin panel**: approve or remove devices, suspend or delete users; no access to anyone's data
- **Installable app (PWA)**: add to home screen, works offline, "Share to XpenceX" for SMS on Android

## Tech stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · Motion · Recharts · Firebase Auth + Cloud Firestore · Cloudflare Workers (AI server) · Google Gemini 3.1 Flash-Lite and Gemini 3.8 Live

## Getting started

**Prerequisites:** Node.js 20+

The app needs two programs running: the AI server and the app itself.

```bash
# 1. AI server (holds the Gemini key)
cd ai-server
npm install
echo GEMINI_API_KEY=your-key > .dev.vars   # get a key at https://aistudio.google.com/apikey
npm run dev                                 # http://localhost:8787

# 2. The app (in a second terminal, from the project root)
npm install
cp .env.example .env.local                  # points the app at the AI server
npm run dev                                 # http://localhost:3000
```

### Using your own Firebase project

1. Create a Firebase project and enable **Google** sign-in and **Cloud Firestore** (`(default)` database).
2. Put your web-app config in `firebase-config.json`.
3. Publish `firestore.rules` (Firebase Console → Firestore → Rules, or `npx firebase-tools deploy --only firestore`).
4. Set `FIREBASE_PROJECT_ID` in `ai-server/wrangler.toml` to your project ID.

### Admin panel (optional)

A device that isn't approved shows no data, even after a Google sign-in: `firestore.rules` and the AI server both check. Requests wait in the admin panel, where the admin can approve a device (optionally replacing an old one), refuse it, or remove an approved one, which signs it out straight away. `REQUIRE_FIRST_DEVICE_APPROVAL` in `ai-server/wrangler.toml` decides whether a new account's first device also waits. The admin can also suspend, restore or delete a user with all their data, and sees login details only, never anyone's expenses, accounts, chats or settings.

If the admin loses their only device, delete their documents from the `devices` collection in Firebase Console. Their next sign-in is then let straight in.

1. Firebase Console → Project settings → Service accounts → **Generate new private key**. Keep the downloaded file outside the project folder and never share it.
2. Give it to the AI server:
   - Online: `Get-Content path\to\key.json -Raw | npx wrangler secret put FIREBASE_SERVICE_ACCOUNT` (PowerShell, inside `ai-server`)
   - Locally: add one line to `ai-server/.dev.vars`: `FIREBASE_SERVICE_ACCOUNT='<the whole JSON on one line>'`
3. Put your own User UID (Firebase Console → Authentication → Users) in `ADMIN_UIDS` in `ai-server/wrangler.toml`.
4. Restart or redeploy the AI server and publish `firestore.rules`. An **Admin panel** row then appears in your Profile.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the app |
| `npm run build` | Production build to `dist/` |
| `npm run lint` | Type-check with `tsc` |
| `npm test` | Run unit tests (Vitest) |
| `cd ai-server && npm run dev` | Start the AI server locally |
| `cd ai-server && npm run deploy` | Deploy the AI server to Cloudflare |

## Project structure

```
src/
  app/          App shell: App.tsx (tabs, auth state), main.tsx, global styles
  features/     One folder per feature: its screens, parts and logic together
    accounts/   bank & wallet accounts, balances, monthly deposits
    auth/       Google sign-in, username, device approval
    chat/       AI chat, chat history, AI service and response handling
    expenses/   expense list, add/edit form, recurring expenses
    home/       home screen and smart insights
    profile/    settings, budgets, categories
    reports/    reports page, charts, PDF/CSV export
  shared/       Used across features: UI parts (BottomNav, Select, ErrorBoundary),
                SMS reader, sensitive-data guard, Firebase setup, types, constants
ai-server/      Cloudflare Worker: checks login, limits daily AI use per user, calls Gemini
public/         PWA manifest, icons, service worker
firestore.rules Security rules (each user can only reach their own data)
```

Tests sit next to the code they test (`*.test.ts`).

## Deploying

```bash
npm run build
npx firebase-tools deploy        # hosting + Firestore rules + indexes
cd ai-server && npx wrangler secret put GEMINI_API_KEY && npm run deploy
```

Then add the app's address to `ALLOWED_ORIGINS` in `ai-server/wrangler.toml` and set `VITE_AI_WORKER_URL` to the AI server's address before building.

## Known limitations

- The Gemini free tier allows only a small number of requests per day, shared by all users.
- Cash has no balance, so cash withdrawals and bKash Cash Out count as spending.
- A browser has no hardware ID, so clearing the app's data or using another browser counts as a new device.
- Web apps can't read SMS automatically; users paste or share them.

## Team

CSE 412 project.
