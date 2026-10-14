# Glimpse on Android

There are two ways to get Glimpse onto Android phones. Both need the server online first.

| | Installable website (PWA) | Real Android app (Capacitor) |
| --- | --- | --- |
| How people get it | Open your site in Chrome → menu → **Install app** | Google Play, or an `.apk` file you share |
| Work for you | None, it's already done | Build in Android Studio, publish on Play |
| Cost | Free | $25 one-time Google Play fee |
| Updates | Instant (just update the server) | Rebuild and upload a new version |

You can do both: the website is installable today, and the app lives in `android-app/`.

---

## Step 1: Put the server online (needed for both)

Phones can only share one wall if the server runs at a public **https** address.
**The easy path: follow [DEPLOY.md](DEPLOY.md)** to run it on Render with the included `render.yaml`
(it handles everything below for you). Any other Node.js host works too (Railway, Fly.io, your own server).
What matters:

1. **Start command:** `npm start` (build command: `npm install`).
2. **Persistent storage.** Posts live in `data/` and uploads in `uploads/`. On most hosts the normal disk is wiped
   on every deploy, so attach a persistent disk/volume and point the server at it:
   ```
   DATA_DIR=/var/data/data
   UPLOAD_DIR=/var/data/uploads
   ```
   (Free tiers without a disk will lose posts when the server restarts.)
3. **Optional:** install `ffmpeg` on the host so the server double-checks video lengths.
4. **Optional:** `ADMIN_TOKEN=some-long-secret` to be able to delete any post.

When it's running, open the address in a browser and check the wall loads.

---

## Option A: the installable website (no extra work)

Open your https address in Chrome on Android, tap the menu (⋮) and choose **Install app** (or **Add to Home
screen**). Glimpse gets its own icon, opens full screen, and reopens quickly thanks to `public/sw.js`.

---

## Option B: the Android app

### What you need
- **Node.js 18+**: https://nodejs.org
- **Android Studio** (free; includes the Android SDK and Java): https://developer.android.com/studio
- An Android phone with **USB debugging** on (Settings → About phone → tap *Build number* 7 times →
  Developer options → USB debugging), or the emulator built into Android Studio.

### Build and run it
1. Put your server's address in `android-app/glimpse.config.json`:
   ```json
   { "server": "https://your-glimpse.example.com" }
   ```
2. In a terminal:
   ```bash
   cd android-app
   npm install
   npm run sync      # copies the website into the app and points it at your server
   npm run open      # opens the project in Android Studio
   ```
3. In Android Studio, wait for "Gradle sync" to finish (the first time takes a few minutes), pick your phone
   or an emulator at the top, and press the green **Run ▶** button.

### Share it without the Play Store
**Build → Build App Bundle(s) / APK(s) → Build APK(s)**, then **locate** the file
(`android/app/build/outputs/apk/debug/app-debug.apk`). Send it to friends; they'll need to allow
"install unknown apps" for their browser or file manager.

### Publish on Google Play
1. **Choose your app ID first.** It's `app.glimpse.wall` in `capacitor.config.json` and in
   `android/app/build.gradle` (`applicationId`). Change both to something you own (e.g. `com.yourname.glimpse`);
   it can never change after you publish.
2. **Build → Generate Signed App Bundle / APK → Android App Bundle**, and create a signing key when asked.
   **Back up that key file and its passwords.** Without them you can never update the app.
3. Create a developer account at https://play.google.com/console ($25 once), create the app, and upload the
   `.aab` file.
4. Play needs a **privacy policy** link and the **Data safety** form (you collect names, photos, videos and text
   that people choose to post).

**Important: Google Play's rules for apps with user posts.** Apps where people post content must have:
- **A way to report** objectionable posts, from inside the app.
- **A way to block or remove abusive users.**
- **Terms that forbid objectionable content,** which people accept before posting.
- **A process for acting on reports.**

Glimpse now has all four: rules people accept before posting, a Report button on every post, Block, and an
admin review page (`/admin.html`; see "Moderation" in README.md). Keep an eye on reports after launch, since
Google expects them to be acted on. In the Play listing, use `https://your-server/privacy.html` as the privacy
policy (after filling it in) and mention that users can report and block in the app.

### Updating the app
Change the website in `public/` as usual, then:
```bash
cd android-app && npm run sync
```
and rebuild in Android Studio. For Play updates, raise `versionCode` (1, 2, 3…) and `versionName` in
`android/app/build.gradle` each time.

---

## How the app works

- The app is the same website, packaged with **Capacitor**. Its files live inside the app, and it talks to your
  server over https (the address goes into `www/config.js` during `npm run sync`).
- The server already allows the app to connect (`https://localhost`, `capacitor://localhost`). To let other
  websites use your API, list them in `ALLOWED_ORIGINS` (comma separated).
- The **back button** closes the viewer, the composer, menus and filters before leaving the app.
- If the phone is offline or the server is down, the app says so and keeps new posts on the phone.
- Icons and the splash screen are in `android/app/src/main/res` (`mipmap-*` and `drawable*/splash.png`).
