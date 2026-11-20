# Welcome email setup (one time)

A brand-new account gets one welcome email right after choosing its username (`ai-server/src/welcomeEmail.ts`).
It is sent through the Gmail API **from the admin Gmail**, shown as "Xpences". Until the four values below are
set, the server sends nothing and sign-up works as before.

The permission lives in its **own small Google Cloud project**, so the sign-in screen your users see for Drive and
Sheets never changes.

## 1. Make the project and turn on Gmail
1. Open <https://console.cloud.google.com> signed in as the **admin Gmail**.
2. Click the project picker at the top, then **New project**. Name it `xpences-mail` and click **Create**.
   Make sure `xpences-mail` is selected at the top before going on.
3. Menu > **APIs & Services** > **Library**. Search **Gmail API**, open it, click **Enable**.

## 2. The permission screen
1. Menu > **Google Auth Platform** (older name: **OAuth consent screen**) > **Get started**.
2. App name: `Xpences Mail`. User support email: the admin Gmail. Click **Next**.
3. Audience: **External**. **Next**. Contact email: the admin Gmail. **Next**, tick the agreement, **Create**.
4. **Data access** > **Add or remove scopes**. In "Manually add scopes" paste
   `https://www.googleapis.com/auth/gmail.send`, click **Add to table**, **Update**, then **Save**.
5. **Audience** > **Publish app** > **Confirm**. It must say **In production**: in "Testing" Google stops the
   permission after 7 days and the emails would quietly stop.
   You don't need Google to verify the app: only you sign in to it.

## 3. The app's ID and secret
1. **Clients** > **Create client**. Type: **Web application**. Name: `xpences-mail`.
2. Under **Authorized redirect URIs** click **Add URI** and paste `https://developers.google.com/oauthplayground`
3. **Create**. Copy the **Client ID** and **Client secret** somewhere safe for the next step.

## 4. The permission token (refresh token)
1. Open <https://developers.google.com/oauthplayground>.
2. Click the **gear** (top right), tick **Use your own OAuth credentials**, and paste the Client ID and Client secret.
3. On the left, in the box under the list, paste `https://www.googleapis.com/auth/gmail.send` and click **Authorize APIs**.
4. Sign in with the **admin Gmail**. Google warns "Google hasn't verified this app": click **Advanced** >
   **Go to Xpences Mail (unsafe)**. This is your own app, so it is safe. Click **Continue** / **Allow**.
5. Back in the playground click **Exchange authorization code for tokens**. Copy the **Refresh token**.

## 5. Give the four values to the server
Open `ai-server/.dev.vars` (it is never uploaded to GitHub) and add these lines with your values:

```
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
MAIL_FROM_ADDRESS=your admin Gmail address
```

Then tell Claude. It sends one test welcome email to the admin Gmail, and once that arrives, puts the four values
into Cloudflare (`npx wrangler secret put ...`) so the live server can send.

## If it stops working
- **The admin panel's error list or the server log says "Gmail sign-in failed 400 invalid_grant":** the permission
  was removed or expired. Do step 4 again and replace `GMAIL_REFRESH_TOKEN`.
- **Emails land in spam:** mark one as "Not spam". If it keeps happening, a domain (about $10 a year) with an email
  service such as Resend sends from an address like `hello@xpences.app` and lands better.
- Gmail allows about 500 emails a day from a personal account, far more than new sign-ups need.
