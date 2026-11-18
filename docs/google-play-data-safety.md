# Google Play Data safety form: answers for Xpences

Copy these into Play Console > App content > Data safety. They match `public/privacy.html`. If the app starts collecting something new, update both.

Check each answer against the form's wording when you fill it in, because Google can change the questions.

## Overview questions

| Question | Answer |
| --- | --- |
| Does the app collect or share user data? | Yes |
| Is all data encrypted in transit? | Yes |
| Can users ask for their data to be deleted? | Yes: Profile > Delete my account, and by email |
| Account deletion link (web address) | Needed: a page explaining how to delete an account. Section "Keeping and deleting your data" in the privacy policy can serve as this |

## Data types

"Shared" is marked Yes where data goes to Google's Gemini free service, because Google may use it to improve its own products. Since 2026-11-16 typed messages and voice messages may also go to Groq, Cloudflare Workers AI and OpenRouter's free models (`ai-server/src/providers.ts`). OpenRouter's free models may keep and train on what is sent, which is sharing too. The table already says Shared for these types, so the answers don't change. A company that only works for you wouldn't count as sharing, but that doesn't describe the free service. If you move to the paid Gemini service, review these answers.

| Data type (form category) | Collected | Shared | Optional? | Purpose |
| --- | --- | --- | --- | --- |
| Name (Personal info) | Yes | No | Required | Account management |
| Email address (Personal info) | Yes | No | Required | Account management |
| User IDs (Personal info) | Yes | No | Required | Account management |
| Other financial info (Financial info) | Yes | Yes | Required | App functionality |
| Photos (Photos and videos) | Yes | Yes | Optional | App functionality |
| Files and docs (Files and docs) | Yes | Yes | Optional | App functionality |
| Voice or sound recordings (Audio) | Yes | Yes | Optional | App functionality |
| Other in-app messages (Messages) | Yes | Yes | Optional | App functionality |
| Other user-generated content (App activity) | Yes | Yes | Optional | App functionality |
| Device or other IDs (Device or other IDs) | Yes | No | Required | App functionality, Fraud prevention and security |
| Crash logs (App info and performance) | Yes | No | Required | App functionality |
| Diagnostics (App info and performance) | Yes | No | Required | App functionality |

Notes:

- **Processed only for a moment:** the form lets you mark data as "processed ephemerally" if it's held only in memory. Don't tick this for photos, files or audio, because Google's free service may keep them.
- **Receipts (added 2026-11-11):** Photos and Files and docs are now also *stored* when a person keeps one as a receipt (Cloudflare R2, through our server; optional; up to 100 per person; deleted with the account). The answers in the table don't change: Collected Yes, Optional, App functionality. They are still "Shared" only because of what goes to Gemini.
- **Favourites and month start (added 2026-11-16):** favourites for the Add screen (title, amount, category, account; up to 12, in backups, deleted with the account) and the day the person's month starts. Both are "Financial info" like the expenses they come from, so the answers don't change.
- **Planned payments (added 2026-11-18):** future bills and expected money a person enters (title, amount, category, due date, repeat and account; up to 50, in backups, deleted with the account). These are "Financial info" like the expenses they become, so the answers don't change. Their titles, amounts and dates are sent to the AI with chat messages, as the other money records are.
- **Needs and wants (added 2026-11-18):** whether each spending category counts as a need or a want, stored on the profile, deleted with the account, never sent to the AI. This is a setting about "Financial info" already declared, so the answers don't change.
- **Saved filters (added 2026-11-18):** up to 5 named filters on the Expenses screen (their name and filter settings). In backups, deleted with the account, never sent to the AI. These are app settings made from "Financial info" already declared, so the answers don't change.
- **Warranties (added 2026-11-18):** the date a purchase's warranty ends, stored on the expense, in backups, deleted with the account. Purchase names and warranty dates are sent to the AI with chat messages so it can answer questions about them. This is "Financial info" like the expense itself, so the answers don't change.
- **Shopping lists (added 2026-11-18):** list names, item names, quantities and prices a person enters (up to 20 lists of 100 items, in backups, deleted with the account). List names and items still to buy are sent to the AI with chat messages so it can add to them. These are "Financial info" and "Other user-generated content", already declared, so the answers don't change.
- **Import from a file (added 2026-11-18):** a CSV or Excel file the person picks is read on the phone only. The file itself is never uploaded or sent to the AI; only the rows they confirm are saved, as ordinary expenses and income. These are "Financial info" already declared, so the answers don't change.
- **Category rules (added 2026-11-18):** words from an expense title (usually a shop name) and the category they go in; up to 50, in backups, deleted with the account, and never sent to the AI. These are "Financial info" like the expenses they come from, so the answers don't change.
- **Labels (added 2026-11-18):** up to 3 short words a person adds to an expense or income, such as an event name. Stored on the entry, in backups, deleted with the account, and sent to the AI with the entry's other details. They are "Financial info" like the entry itself, so the answers don't change.
- **Agent space tasks (added 2026-11-16):** the actions the AI prepared in chat (what each would do, its chat, and whether it was confirmed, cancelled or expired). Stored in Firestore, deleted with the account, not in backups (a restored old task could be confirmed again by mistake). Waiting ones expire after 7 days; the newest 100 finished ones are kept. Same data types as the money records and chats they describe ("Financial info" and "Other user-generated content"), so the answers don't change.
- **Your own reminders (added 2026-11-16):** the words, time and repeat of reminders a person writes (Profile > Reminders, or from chat). Stored in Firestore, optional, deleted with the account, included in backups. This is "Other user-generated content" (App activity), already Yes/Optional; no new row needed. They are never sent to the AI after they're made; making one from chat sends that chat message, as any message does.
- **Financial info:** "Required" because the tracker can't work without expense records. Only the parts a user sends to the AI assistant go to Google.
- **Crash logs and Diagnostics (added 2026-11-11):** the app's own error reports (our server, kept 30 days, with the username) and Firebase Crashlytics (Google, not linked to the user). Always on, so Required. Firebase is Google acting for us, so not "Shared".
- **Not collected:** location, contacts, calendar, SMS, browsing history, health, and ads or analytics data.

## Other Play Console items

| Item | Answer |
| --- | --- |
| Privacy policy link | Your deployed address + `/privacy.html` |
| Target audience | 18 and over only. Google's Gemini terms don't allow apps directed at, or likely to be used by, under 18s |
| Countries | Leave out the European Economic Area, Switzerland and the United Kingdom while on the free Gemini service. Google's terms require the paid service for users there |
| Ads | No ads |
| Permissions | Microphone. Don't request SMS |
