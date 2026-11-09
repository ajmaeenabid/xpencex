# Releasing the Xpences Android app

Xpences is shared as an app file (`.apk`) from a download page at **https://xpencex.xpence.workers.dev**.
Opening that address in a browser shows only the download page; the app itself runs only after installing.

Part A is done once. Part B is done for every new version.

---

## Part A: one-time setup

You do this part only once. It has 4 jobs. Take them in order, and tick each one off.

**Where to type commands:** in VS Code, open **Terminal > New Terminal**. A terminal opens at the bottom,
already inside the project folder (`D:\Desktop Files\CSE 412\Project`). Type or paste a command, then press **Enter**.

---

### Job 1: Install Android Studio (about 30 minutes, mostly waiting)

Android Studio is Google's free program for building Android apps. You need it to turn Xpences into an app file.

1. Open https://developer.android.com/studio in your browser.
2. Click **Download Android Studio**, tick the box to accept the terms, and download.
3. Open the downloaded file and click **Next** through the installer. Keep every box ticked.
4. When it finishes, Android Studio opens a **Setup Wizard**:
   - Choose **Don't import settings** if it asks.
   - Choose **Standard** as the install type.
   - Pick any theme you like.
   - Accept all the licences (click each one on the left, then **Accept**), then **Finish**.
   - It now downloads the Android SDK (about 1 to 3 GB). Wait until it says it is done, then click **Finish**.
5. Close Android Studio.
6. In the VS Code terminal, type:
   ```
   npm run android:open
   ```
   Android Studio opens the Xpences `android` folder.
7. Look at the bottom of the Android Studio window. A bar says **Gradle sync** or **Importing**.
   **Wait until it finishes** (the first time can take 5 to 15 minutes, because it downloads build tools).
   - If it asks **"Upgrade Gradle?"** or **"Upgrade Android Gradle Plugin?"**, close that message. Don't upgrade.
   - If it asks to trust the project, click **Trust Project**.
8. **Set Java 21 for building (once).** Capacitor needs Java 21; Android Studio comes with a newer one.
   - Click **File > Settings** (or the gear icon > **Settings**).
   - Go to **Build, Execution, Deployment > Build Tools > Gradle**.
   - Next to **Gradle JDK**, open the list. Pick a **21** version if one is listed. If not, choose
     **Download JDK...**, pick **Version 21** and vendor **Eclipse Temurin**, then **Download**.
   - Click **OK**, then **File > Sync Project with Gradle Files**, and wait for it to finish.
9. You can close Android Studio again. Job 1 is done.

---

### Job 2: Make the signing key (5 minutes)

The signing key is like the app's stamp. Every version of Xpences must carry the **same** stamp, or phones
refuse to install the update. So you make it once, and keep it forever.

1. In the VS Code terminal, paste this and press Enter:
   ```
   keytool -genkeypair -v -keystore android/xpencex-release.jks -alias xpencex -keyalg RSA -keysize 2048 -validity 10000
   ```
2. It asks questions, one at a time. Answer each and press Enter:
   - **Enter keystore password:** make up a strong password. The letters don't show while you type; that's normal.
     **Write the password down now**, on paper or in a password manager.
   - **Re-enter new password:** type it again.
   - **First and last name:** your name.
   - **Organizational unit**, **Organization**, **City**, **State**: anything, or just press Enter.
   - **Two-letter country code:** `BD`
   - **Is CN=... correct?** type `yes`
3. When it finishes, a new file appears: `android\xpencex-release.jks`. That is the key.
4. In VS Code, create a new file in the `android` folder called exactly `keystore.properties`
   (right-click the `android` folder > **New File**). Paste this into it, and replace both
   `YOUR-PASSWORD` parts with the password from step 2:
   ```
   storeFile=xpencex-release.jks
   storePassword=YOUR-PASSWORD
   keyAlias=xpencex
   keyPassword=YOUR-PASSWORD
   ```
   Save the file (**Ctrl + S**).
5. **Back up both files now.** Copy `android\xpencex-release.jks` and `android\keystore.properties` to
   two safe places, for example a private folder in your Google Drive **and** a USB stick.
   - These two files are never put on GitHub (they are in `.gitignore`), so your backup is the only copy.
   - If they are ever lost, you can never update Xpences on people's phones again; everyone would
     have to delete the app and install a new one.

---

### Job 3: Let Google sign-in work inside the app (10 minutes)

Google only lets an app use "Sign in with Google" if you register the app with its stamp (from Job 2).

**Part 1: get the stamp's fingerprint**

1. In the VS Code terminal, paste this and press Enter:
   ```
   keytool -list -v -keystore android/xpencex-release.jks -alias xpencex
   ```
2. Type your key password from Job 2 and press Enter.
3. In what it prints, find the line that starts with **`SHA1:`**. It looks like
   `SHA1: 3A:4B:5C:...` (20 pairs of letters and numbers).
4. Select only the part after `SHA1:` and copy it (in the VS Code terminal, select it and press **Ctrl + C**).

**Part 2: register the app with Google**

1. Open https://console.cloud.google.com and make sure the project at the top says **xpensex-abid**
   (click it to switch if it says something else).
2. Click **☰ menu > APIs & Services > Credentials**.
3. Click **+ Create credentials** at the top, then **OAuth client ID**.
4. For **Application type**, choose **Android**.
5. Fill in:
   - **Name:** `Xpences Android` (any name works; it's only for you)
   - **Package name:** `com.xpence.app` (exactly like this)
   - **SHA-1 certificate fingerprint:** paste what you copied in Part 1
6. Click **Create**. You can close the window that appears; there is nothing to copy from it.

You now have two clients in the list: the **Web client** (the app still uses its ID) and the new
**Android** one. Don't delete either.

**Optional, only if you test with Android Studio's green Run button:** that kind of test uses a
different, automatic key. Repeat Part 1 with this command instead (no password needed), and create a
second Android client named `Xpences Android (testing)` with the same package name:
```
keytool -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -storepass android
```

---

### Job 4: Put the AI server online (10 minutes)

Right now the AI server only runs on your computer, so the app would stop working whenever your computer
is off. This job puts it on Cloudflare (free), so it runs all the time.

1. In the VS Code terminal, go into the server's folder:
   ```
   cd ai-server
   ```
2. Sign in to Cloudflare:
   ```
   npx wrangler login
   ```
   Your browser opens. Sign in to Cloudflare (or create a free account), then click **Allow**.
   When the browser says you can close it, go back to VS Code.
3. Send the server to Cloudflare:
   ```
   npm run deploy
   ```
   - If it asks you to register a **workers.dev subdomain**, type a short name (for example `xpencex`)
     and press Enter.
   - At the end it prints an address like **`https://xpensex-ai.xpencex.workers.dev`**.
     **Copy that address.**
4. Give the online server its secret keys. This one command copies all 4 of them
   (Gemini key, Firebase key, Google client secret and token key) from your `.dev.vars` file:
   ```
   npx wrangler secret bulk .dev.vars
   ```
   It should say that 4 secrets were uploaded.
5. Go back to the project folder:
   ```
   cd ..
   ```
6. Open the file `.env.production` in the project folder. In the line
   `VITE_AI_WORKER_URL="https://xpensex-ai.CHANGE-ME.workers.dev"`, replace the whole address with the
   one you copied in step 3. It should look like:
   ```
   VITE_AI_WORKER_URL="https://xpensex-ai.xpencex.workers.dev"
   ```
   Save the file (**Ctrl + S**).
7. Check it works: open your address followed by `/limits` in the browser, for example
   `https://xpensex-ai.xpencex.workers.dev/limits`. It should show a short message like
   `{"error":"Method not allowed"}`. That means the server is online (it only answers the app).

**Part A is finished.** Go on to Part B to build the app file.

**Later, when you change the AI server's code:** run `cd ai-server` then `npm run deploy` again.
The secrets stay; you only need `secret bulk` again if you change a value in `.dev.vars`.

---

## Part B: every release

Do this for the first release, and again every time you want to give people a new version.
Each step says **where** to do it: the **VS Code terminal**, **Android Studio**, or **your phone**.

---

### Step 1: Check the server address (VS Code, 10 seconds)

Open `.env.production` in the project folder. The `VITE_AI_WORKER_URL` line must have your real
Cloudflare address from Part A, Job 4 (not `CHANGE-ME`). If it still says `CHANGE-ME`, do Job 4 first.

### Step 2: Raise the version number (VS Code, 1 minute)

**Skip this step for the very first release.** Version 1 is already set.

For every later release, change the numbers in **two files**, to the **same** values:

1. `android/app/build.gradle`: find these two lines and raise them:
   ```
   versionCode 2
   versionName "1.0.1"
   ```
   - `versionCode` goes up by 1 every release (1, 2, 3...). Phones use it to know it's newer.
   - `versionName` is what people see. Use any sensible number ("1.0.1", "1.1.0"...).
2. `public/download/version.json`: put the same two values, and a short note of what's new:
   ```json
   {
     "versionCode": 2,
     "versionName": "1.0.1",
     "notes": {
       "en": "Faster Home screen and a few fixes.",
       "bn": "হোম স্ক্রিন আরও দ্রুত, আর কিছু সমস্যার সমাধান।"
     }
   }
   ```
3. Save both files (**Ctrl + S**).

### Step 3: Build the app file (VS Code terminal, 2 to 5 minutes)

```
npm run android:release
```

This one command does everything:
- checks that the version numbers in `build.gradle` and `version.json` match (if not, it stops and tells you),
- builds Xpences and the signed app file, using Java 21 by itself,
- copies it to `public\download\xpencex.apk` and writes its size into `version.json`.

Wait until it says **Done**. If it stops with a red message, see "If the build fails" at the end of this guide.

**The Android Studio way still works** if you prefer it: run `npm run android:sync`, then in Android Studio use
**Build > Generate Signed App Bundle or APK...** (APK, your `android\xpencex-release.jks` key, alias `xpencex`,
**release**). Copy `android\app\release\app-release.apk` to `public\download\xpencex.apk`, and put its size in
`version.json`.

### Step 4: Test it on your own phone first (your phone, 10 minutes)

1. Send `public\download\xpencex.apk` to your phone (USB cable, Google Drive, or WhatsApp to yourself).
2. On the phone, tap the file. If Android asks, allow **Install unknown apps** for that app, then tap **Install**.
   If Play Protect warns about an unknown developer, tap **Install anyway**.
3. Open Xpences and sign in with Google.
4. Your phone counts as a **new device**, so it waits for approval. On your computer, open the admin
   panel and approve it.
5. Try the important things: add an expense, open Home, link Google Drive, send feedback.

Only continue when everything works on your phone.

### Step 5: Publish the download page (VS Code terminal, 2 minutes)

```
npm run release:site
```

Wait until it says **Deploy complete!**

### Step 6: Share the link

Send people this link: **https://xpencex.xpence.workers.dev**

- New people open the link, tap **Download for Android**, and follow the install steps on the page.
- People who already have Xpences see **"A new version is ready"** the next time they open the app.
  Installing the new file over the old one keeps all their data.

---

## If the build fails

**"Can't use Java ..." or "Unsupported class file major version" or "requires Java 21"**

Capacitor needs **Java 21** to build (not 17, not 25). Tell Android Studio to use Java 21, once:

1. In Android Studio: **File > Settings** (or the gear icon > **Settings**).
2. Go to **Build, Execution, Deployment > Build Tools > Gradle**.
3. Next to **Gradle JDK**, open the list:
   - If a **21** version is listed (for example "jbr-21" or "temurin-21"), pick it.
   - If not, choose **Download JDK...**, pick **Version 21**, vendor **Eclipse Temurin**, and click **Download**.
4. Click **OK**, then **File > Sync Project with Gradle Files**, and try again.

`npm run android:release` finds Java 21 by itself (the one Android Studio downloads goes in
`C:\Users\<you>\.jdks`). If it says Java 21 was not found, download it as above, then run the command again.

**Android Studio offers to "Upgrade Gradle" or "Upgrade Android Gradle Plugin"**: close the message. Don't upgrade.

**Anything else:** take a screenshot of the red message and ask for help.

---

## Good to know

- **"Install unknown apps":** Android asks people to allow installing from their browser once.
  Google Play Protect may also say the app is from an unknown developer; they tap **Install anyway**.
  Both go away once the app is on Google Play.
- **Where the download page lives:** on Cloudflare (`download-site/wrangler.jsonc`), free, with no download limit. Firebase's free plan refuses app files, so it only keeps the database. Cloudflare allows files up to 25 MB.
- **The website is not the app:** the AI server only accepts the installed app (`https://localhost`)
  and `localhost:3000` for development (`ALLOWED_ORIGINS` in `ai-server/wrangler.toml`).
- **The logo** is drawn once in `src/shared/brand/logoSvg.ts`. After changing it, run `npm run icons` to remake every
  icon (web, Android launcher and opening screen), then build a new version so phones get it.
- **Development** is unchanged: `npm run dev` still runs the app in your browser on this computer.
