# Putting Glimpse online (Render)

This gets your server running at a public **https** address, which the website, the installable app and the
Android app all need. It takes about 20 minutes the first time. You need a GitHub account and a Render account
(both free to create), and a payment card for Render.

**What it costs:** a Render "Starter" instance plus a 5 GB disk, roughly $8 a month at the time of writing.
Check https://render.com/pricing for current prices. The disk is what keeps posts and uploads safe. Render's
free plan has no disk, so everything would vanish whenever the server restarts.

---

## 1. Put the code on GitHub

Render deploys from a GitHub repository. Create one at https://github.com/new: name it `glimpse`, and choose
**Private** if you'd rather nobody sees the code.

Then upload the project. The easiest way is **GitHub Desktop** (https://desktop.github.com):
1. **File → Clone repository** → pick `glimpse` → choose where to put it.
2. Copy everything from the unzipped `glimpse` folder into that cloned folder (including `render.yaml`, `server.js`,
   `package.json`, `package-lock.json`, `public/` and `android-app/`). Don't copy any `node_modules` folders.
3. Back in GitHub Desktop: type a summary like "First version", click **Commit to main**, then **Push origin**.

<details>
<summary>Or with the command line</summary>

```bash
cd glimpse
git init
git add .
git commit -m "First version"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/glimpse.git
git push -u origin main
```
</details>

The `.gitignore` files already keep `node_modules`, `data/` and `uploads/` out of the repository.

## 2. Create the server on Render

1. Sign up at https://render.com with **Sign in with GitHub**, and allow Render to see your `glimpse` repository.
2. Click **New → Blueprint**, choose the `glimpse` repository, and click **Connect**.
3. Render reads `render.yaml` and shows what it will create: a web service called **glimpse** with a 5 GB disk.
   Click **Apply** (add a payment card if asked).
4. Wait for the first deploy to finish (2–4 minutes). The logs end with `Glimpse is running`.

Your address appears at the top of the service page, something like **`https://glimpse-abcd.onrender.com`**.
Open it: you should see the wall.

> **Region:** the Blueprint uses **Frankfurt** (closest to East Africa and Europe). If most of your users are
> elsewhere, change `region` in `render.yaml` to `oregon`, `ohio`, `virginia` or `singapore` **before** step 2;
> it can't be changed afterwards.

## 3. Open your moderation page

1. On Render, open the **glimpse** service → **Environment**.
2. Find **ADMIN_TOKEN**, reveal it and copy it. Render generated it for you; keep it secret.
3. Visit `https://YOUR-ADDRESS/admin.html` and paste it in.

## 4. Finish the privacy policy

Fill in the highlighted blanks in `public/privacy.html` (your name, contact email, date, minimum age), then commit
and push. Render redeploys automatically on every push. Your policy lives at `https://YOUR-ADDRESS/privacy.html`;
that's the link Google Play asks for.

## 5. Connect the Android app

Put your address in `android-app/glimpse.config.json`:
```json
{ "server": "https://glimpse-abcd.onrender.com" }
```
then `cd android-app && npm run sync` and build in Android Studio (see `ANDROID.md`).

## 6. Optional: your own domain

On Render: **glimpse → Settings → Custom Domains → Add**, enter e.g. `glimpse.yourname.com`, and add the DNS
record Render shows at your domain provider. Render sets up the https certificate. If you switch, update the
Android app's `glimpse.config.json` too.

---

## Good to know

- **Backups:** Render snapshots the disk every day and keeps snapshots for at least 7 days (service → **Disks**).
- **Updates:** run `npm test` first, then push to GitHub and Render redeploys. Because the server has a disk, there's a few seconds of
  downtime during each deploy.
- **One server:** with a disk, Glimpse runs as a single instance, which is plenty for a community wall. If it ever
  outgrows that, the next step is a database (Render Postgres) and cloud storage for uploads.
- **Video length check:** the browser and app always check that videos are 30 seconds or less. The server's extra
  check needs `ffmpeg`, which Render's standard Node environment may not include; without it the server trusts
  the length the app reports.
- **Settings** you can change under **Environment** (the server restarts with them):
  `REPORT_HIDE_THRESHOLD` (default 3), `BAN_BY_IP` (`true` to also ban IP addresses), `ALLOWED_ORIGINS`
  (other websites allowed to use the API). Never change `GLIMPSE_SECRET` once people are posting; it would reset
  everyone's anonymous IDs, so existing blocks and bans would stop matching.
- **Something wrong?** Check the service's **Logs** tab, then open `https://YOUR-ADDRESS/api/health`; it should say
  `{"ok":true,…}`.
