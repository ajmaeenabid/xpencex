# Xpences

Expense tracker PWA (React 19 + TypeScript + Vite + Tailwind v4), Firebase Auth/Firestore, Gemini via a Cloudflare Worker.

## Commands
- `npm run dev` (app, :3000) · `npm run lint` (tsc) · `npm test` (Vitest) · `npm run build`
- AI server: `cd ai-server && npm run dev` (:8787); key in `ai-server/.dev.vars`, never in the app

## Layout
- `src/app/` shell (App.tsx owns tabs + auth context) · `src/features/<feature>/` screens + logic per feature
- `src/shared/` cross-feature UI, `lib/` (smsParser, sensitiveData), firebase, types, constants
- The logo lives only in `src/shared/brand/logoSvg.ts`; `npm run icons` renders every PNG icon and splash from it.
- Tests sit next to their file as `*.test.ts`. Keep logic in plain `.ts` files so it can be tested.

## Rules
- Every Firestore write must match `firestore.rules`; update the rules when adding fields or collections.
- A save the user waits on goes through `saved()` in `src/shared/lib/offlineSave.ts`, never a bare `await` on the write: Firestore's promise never finishes offline, so the screen would hang.
- Sign-in is Google only, and all of it stays in `src/features/auth/googleSignIn.ts` so the phone app can swap in a native plugin. Google alone shows no data: `isAuthenticated()` in `firestore.rules` and the AI server need the device pass from `ai-server/src/devices.ts`. Never re-sign in on the main `auth` for confirmations, as that drops the pass; use `freshGoogleToken`.
- Admins get no data access in `firestore.rules`. Admin actions (devices, suspend, delete) live only in `ai-server/src/admin.ts`, gated by `ADMIN_UIDS`, and return login details only. A new user collection must be added to `USER_COLLECTIONS` in `ai-server/src/google.ts` so delete removes it.
- Loan installments are taken only by the AI server (`ai-server/src/loans.ts`: hourly cron + `/loans/process` on app open). Date logic lives in `ai-server/src/loanDates.ts` and the app imports it, so both agree (Bangladesh time).
- User text goes through `containsSecret` (block) and `maskSensitive` (mask) before it is shown, saved or sent to the AI.
- Theme colours come from CSS variables in `src/app/index.css` (`indigo-*` = peach); never hard-code new palettes.
- The app is headed for Google Play: never ask for the SMS read permission, and any new kind of personal data must go in the privacy policy and Data safety form.
- UI text: plain, friendly sentence case; no em dashes.
