# MealJournal

A private, mobile-first food diary for recording what you eat and drink (with photos, ingredients, quantities and optional nutrition) and sharing it with a dietitian as a professional PDF or a private read-only link.

MealJournal is a diary, not a calorie counter. It has no targets, no scores, no gamification and no dietary advice. Nutrition is optional, and it is never shown prominently unless you turn it on.

---

## 1. What was built

| Area | What works |
| --- | --- |
| **Diary** | Entries grouped by day on a timeline. Each entry has a name, date, time (24h, Europe/Amsterdam by default), category, multiple photos, description, notes, foods/ingredients with quantities, total amount and preparation method. You can edit, duplicate (with photos), move to another date/time, delete, "log again now", or save an entry as a reusable meal. |
| **Adding food** | One screen with search, Foods / Meals / Previous tabs, favourites and recently used items first, and a free-text entry that needs nothing from the library. Camera capture and gallery selection are both supported. Photos are compressed on the device (1600 px JPEG plus a thumbnail). Date and time default to now and stay editable. A sticky Save bar is reachable with your thumb. |
| **Food library** | Your own foods with brand, photo, description, category, tags, favourite flag, default serving, ingredients and preparation notes. Nutrition is optional and can be given per 100 g, per 100 ml or per serving. **Unit conversions** ("1 piece = 60 g") are defined by you and never assumed. You can search, filter, edit and delete. Optional, clearly labelled starter foods (names only, no invented nutrition) can be removed in one tap. |
| **Meals** | Reusable combinations of saved foods and custom ingredients, with a photo and instructions. Log a whole meal in one action and adjust each quantity or the portion size (½×–2×) without changing the template. You can duplicate templates. |
| **Nutrition** | Calculated proportionally from what you actually ate. **Missing is never zero**: unknown values show as "—", and incomplete totals are marked "≥" and explained ("1 of 3 items has no usable nutrition data"). Optional manual totals per entry, and an opt-in daily summary on Home. |
| **History is preserved** | When you log a food or meal, its full details (name, ingredients, conversions, nutrition) are copied into the entry. Editing or deleting library items never changes past entries. |
| **PDF report** | Pick the period and choose what to include: photos, ingredients and quantities, descriptions and notes, nutrition per entry, daily totals and per-item breakdowns. There's a live in-app preview. The PDF is A4 with professional typography, photos that keep their aspect ratio, automatic page breaks, day headings that stay with their first entry, page numbers and the period in the footer, and photos re-encoded for small files. You can download it or use the Android share sheet. It is generated entirely on the device, works offline, and uploads nothing. |
| **Private share links** | Publishes an immutable snapshot of only the selected report and its photos. Links use 256-bit random tokens; only SHA-256 hashes are stored, and the token sits in the URL fragment so it never reaches server logs or link-preview bots. Optional PIN (PBKDF2, locks for 15 minutes after 10 wrong attempts). Expiry after 7, 30 or 90 days. Revocation is instant and permanent and wipes the uploaded content. Photos live in a private bucket and recipients only ever get 30-minute signed URLs. Recipients need no account. The share page is read-only, has a PDF download, and is marked noindex. You can copy the link, send it by WhatsApp or email, or use the native share sheet. A list shows all your links with status, view count, revoke and delete, plus an owner-only access log per link (time, IP address, browser/device, wrong-PIN attempts; repeat visits within 30 minutes count once; kept 90 days, deleted with the link). |
| **Accounts & device sync** | Self-service sign-up with email one-time codes (no passwords): a new user enters only an email address, accepts a short privacy notice, confirms the code and goes through a skippable onboarding (optional name, time zone, nutrition-on-Home, starter foods). Users can delete their own account in Settings. The diary is written to IndexedDB first (instant, works offline) and synced in the background to the user's own account, so a phone and a laptop show the same diary within about a minute. Per-record last-writer-wins with tombstones; photos sync through a private bucket. Share links sync too (the secret link itself stays on the device that created it). Signing out flushes pending changes and removes the diary from that device. |
| **Privacy & reliability** | Local-first IndexedDB storage, with persistent storage requested. No analytics, ads or trackers. Full JSON backup and restore (photos included). "Delete all my data" (also from the account). An offline indicator. Revocations and edits made while offline are queued and sent when you reconnect. |
| **PWA** | Installable with icon, maskable icon, splash screen, standalone mode and shortcuts ("Add food", "Add drink"). The whole app, including the PDF engine, is precached for offline use. You are prompted when an update is available. |
| **Design** | Calm neutral palette with sage accents, Inter typeface (bundled, no Google Fonts), consistent cards and controls, bottom navigation on phones, a sidebar on desktop, bottom sheets, automatic dark mode. The PDF preview always renders as light "paper". |

### Data model

Library records (`Food`, `FoodIngredient`, `NutrientProfile`, `UnitConversion`, `MealTemplate`, `MealTemplateItem`) are editable. Diary records (`DiaryEntry`, `DiaryEntryItem`, and photo references to `Photo`) are self-contained snapshots. Shared reports (`SharedReport`, the `shared_reports` table) are a further frozen snapshot. Types are in [`src/lib/types.ts`](src/lib/types.ts). Local schema migrations are versioned in [`src/lib/db.ts`](src/lib/db.ts); server migrations are in [`supabase/migrations`](supabase/migrations).

---

## 2. Technology stack

- **React 19** + **TypeScript 6** (strict) + **Vite 8**
- **Tailwind CSS 4**, with accessible components built on **Radix UI Dialog**, **lucide-react** icons and **sonner** toasts
- **Dexie 4** (IndexedDB) + `dexie-react-hooks` for local-first, live-updating data
- **vite-plugin-pwa 2** (Workbox) for the service worker, manifest and offline precache
- **@react-pdf/renderer 4** for PDF layout, plus **@cantoo/pdf-lib** (the maintained pdf-lib fork) to stamp footers and page numbers. react-pdf 4.7–4.9 silently drops `fixed` elements and page-number render props.
- **Supabase** (Auth with email one-time codes, Postgres with RLS, private Storage, and one Edge Function) for accounts, device sync and sharing, loaded on demand
- **zod** for backup validation
- **Vitest** + **fake-indexeddb** for tests, and **pgTAP** for database permission tests

---

## 3. Run locally

Requirements: Node.js 20.19+ (tested with Node 24) and npm.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. The app requires a Supabase project (section 5); without one it shows a "not set up" screen. The simplest way to develop is the local stack in section 5, step 7.

Other scripts:

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run build
```

```bash
npm run preview
```

`npm run preview` serves the production build, including the service worker, on port 4173. Use it to test install and offline behaviour.

---

## 4. Install on your Samsung Galaxy (S25 Ultra)

A PWA can only be installed from an **HTTPS** address (or `localhost` on the same device). Opening `http://<your-PC-IP>:5173` from your phone shows the app, but Android won't install it or enable offline mode. Deploy first (section 6), then:

**Chrome**
1. Open your MealJournal URL.
2. Tap ⋮ → **Install app** (or **Add to home screen** → **Install**).
3. Launch it from the home screen. It opens full screen with its own splash screen.

**Samsung Internet**
1. Open your MealJournal URL.
2. Tap ☰ → **Add page to** → **Home screen**.

Then:
- Open **Settings → App** inside MealJournal. It shows whether persistent storage has been granted. Installed apps normally get it, which stops Android from clearing your diary under storage pressure.
- The camera button opens the phone camera directly; **Gallery** lets you pick existing photos.
- The diary syncs to your account, so a new device only needs a sign-in. Still export a **backup** now and then (Settings → Backup): it is your safety net against deleting data by mistake.

---

## 5. Supabase setup (required: accounts, sync, share links)

Choose an **EU region** (e.g. Frankfurt) for health-related data.

1. **Create a project** at [supabase.com](https://supabase.com/dashboard). Note the **project ref**, the **Project URL**, and the **Publishable key** (Project Settings → API Keys; the legacy "anon" key also works).
   Never put the secret/service-role key in the app or in `.env` files used by Vite.

2. **Apply the database migrations.** They create the `shared_reports` table (share links), the `sync_records` / `sync_cursor` tables and `sync_push` function (device sync), their RLS policies and triggers, and the private `report-photos` and `sync-photos` buckets.
   ```bash
   npx supabase login
   ```
   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```
   ```bash
   npx supabase db push
   ```
   Alternatively, paste each file in [`supabase/migrations`](supabase/migrations) (in filename order) into **SQL Editor** and run it.

3. **Deploy the Edge Function.** Recipients have no account, so JWT verification is disabled for this one function; it authorises access itself using the share token.
   ```bash
   npx supabase functions deploy get-shared-report --no-verify-jwt
   ```
   It uses the built-in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secrets, which only exist server-side. You don't need to set anything.

   Also deploy `delete-account` (Settings → Delete my account). It keeps JWT verification **on** and deletes only the caller's own account: their photos in both buckets, then the auth user, which cascades to all their rows.
   ```bash
   npx supabase functions deploy delete-account
   ```

4. **Configure sign-in** (Authentication). Anyone can create an account with an email code; these settings keep that safe. `supabase/config.toml` holds them for the local stack (`npx supabase config push` can apply most to the hosted project); **check each one in the dashboard**:
   - **Sign In / Providers → Email**: enabled. **Allow new users to sign up: ON** (`enable_signup = true`). Leave anonymous sign-ins off. Only the app's "Create account" flow creates users; "Sign in" with an unknown address sends nothing and shows the same "If this address has an account…" message.
   - **Email OTP expiration**: 600 seconds (10 minutes), length 6. **Minimum interval between emails per user**: 60 s.
   - **Rate Limits**: keep them conservative (config.toml uses 10 sign-in requests and 10 code verifications per 5 minutes per IP). Wrong-code guessing is limited by these.
   - **URL Configuration**: set **Site URL** to your deployed URL and add `https://YOUR-DOMAIN` and `http://localhost:5173` as **Redirect URLs**.
   - **Users**: no manual work needed. A new account stores the accepted privacy-notice version and time in its user metadata (`privacy_version`, `privacy_accepted_at`). Addresses that requested a code but never confirmed it stay as unconfirmed users; delete those periodically (Authentication → Users).
   - **Email Templates → Confirm signup** and **Magic Link**: include the one-time code so people can sign up and sign in inside the installed app without leaving it. A new address gets *Confirm signup*, an existing one *Magic Link*. Ready-made templates are in [`supabase/templates/confirmation.html`](supabase/templates/confirmation.html) and [`supabase/templates/magic_link.html`](supabase/templates/magic_link.html); paste them in, or run `npx supabase config push` after updating `site_url` and `additional_redirect_urls` in [`supabase/config.toml`](supabase/config.toml).
   - **Custom SMTP is required for real use** (Authentication → Emails → SMTP Settings). The built-in mailer is heavily rate-limited and meant for testing. Use a provider with SPF and DKIM set up for your sending domain so codes don't land in spam and the sender can't be spoofed.

5. **Configure the app.** Copy `.env.example` to `.env.local` (and set the same variables on your host):
   ```
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
   Rebuild or restart the dev server. The app now opens with the sign-in screen.

6. *(Optional)* Wipe the contents of expired reports nightly with `pg_cron`, using the SQL comment in the migration (`purge_expired_shared_reports`). Expired links stop working regardless; this only removes their stored content sooner. Photos of a link are deleted when you revoke or delete it in the app.

7. *(Optional)* Try sharing entirely on your machine first (needs Docker Desktop). This runs Postgres, Auth, Storage and the function locally; sign-in emails go to Mailpit at http://127.0.0.1:54324 instead of being sent.
   ```bash
   npx supabase start
   ```
   ```bash
   npx supabase test db
   ```
   ```bash
   npx supabase functions serve --no-verify-jwt
   ```
   Then put the printed `API_URL` and `PUBLISHABLE_KEY` into `.env.local` as `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`, create a test user (Studio at http://127.0.0.1:54323 → Authentication → Add user, or the admin API with the printed secret key) and run `npm run dev`. Stop everything with `npx supabase stop --no-backup`.

---

## 6. Deploy

The app is a static site (`dist/`) and needs **HTTPS** plus an SPA fallback to `index.html`. Config files for common hosts are included.

**Cloudflare (Workers, the dashboard default)**: connect the GitHub repo, build command `npm run build`, deploy command `npx wrangler deploy`. `wrangler.jsonc` serves `dist` with SPA fallback; `public/_headers` adds `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`, etc. Don't add a `/* /index.html 200` rule to `_redirects`: Workers rejects it as an infinite loop.

**Cloudflare Pages / Netlify**: build command `npm run build`, output directory `dist`. Pages falls back to `index.html` automatically; Netlify uses `netlify.toml`. Both apply `public/_headers`.

**Vercel**: framework "Vite". `vercel.json` provides the rewrites and headers.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as build-time environment variables on the host if you want share links. Then add the deployed URL to Supabase's Site URL and Redirect URLs (step 5.4).

---

## 7. What needs configuration, and what was and wasn't verified

**Not dependent on accounts** (these features don't call the server; they were verified in a browser during development): creating foods with and without nutrition, unit conversions, meals from saved foods, logging a meal with changed quantities while the template stays unchanged, gallery photo upload and compression, free-text entries with notes, moving entries, reusing entries on another day, the diary history, 7-day PDFs with and without photos (pages inspected visually), backup → wipe → restore, data surviving server restarts and reloads, and the installable manifest with an active service worker. With the server stopped, the app shell loaded from cache, an entry could be recorded and a PDF generated.

**Accounts and device sync** were verified end-to-end on a local Supabase stack, using two browser origins as two devices (see the Device sync section below).

**Share links** require the Supabase setup above. They were **verified end-to-end on a local Supabase stack** (same Postgres, Auth, Storage and Edge Runtime as hosted):
- The migrations apply cleanly, and all pgTAP permission tests pass (`npx supabase test db`).
- Email-code sign-in works, using the custom template.
- Publishing uploads only the 3 photos in the period. The server stores only the token hash, never the raw token, and an entry outside the period never reaches the server.
- The link opens on a separate origin with no session and no diary (the equivalent of incognito). Wrong PIN → "9 attempts left"; correct PIN → report, photos via signed URLs, and a PDF download with photos.
- Isolation: anonymous clients and a second signed-in user can't read, revoke, list, download or upload anything. Public photo URLs, tampered signed URLs and near-miss tokens are all refused.
- Editing the diary after publishing doesn't change the shared report.
- Revoking makes the link unavailable at once, wipes its content and deletes its photos. An expired link becomes unavailable, and the purge function wipes it. Deleting a link removes everything server-side.

**Still to do on a hosted project** (your steps; nothing here was run against hosted Supabase): create the project, run the migrations, set every auth setting listed in section 5.4 and add **custom SMTP**, create your users, deploy and sign in on your real phone and laptop, then do one real publish, open it on another phone, and revoke it. The PIN lockout after 10 attempts and the offline revocation queue are covered by unit tests only.

**Needs your phone:** camera capture (the code path is standard `<input capture>` and was only tested with gallery-style file input on desktop), installing on Android, and the Android share sheet for PDFs.

### Known limitations
- The PDF uses the built-in Helvetica font, which covers Latin script (English, Dutch, French, German, etc.). Characters it can't draw are mapped to the nearest equivalent ("ł" → "l"), and other scripts such as **Arabic appear as "?" in the PDF**. The in-app preview and the share page display all scripts correctly.
- Conflicts are resolved per record, last writer wins. Two devices editing the *same* entry offline keeps only the later edit. Usage counters (`useCount`, `lastUsedAt`) can lose an increment the same way (they only affect sort order).
- Sync is polling-based (on start, on focus, on reconnect, 2 s after a change and every 60 s), not live. Realtime is a small later addition.
- Synced data is **not end-to-end encrypted**: it sits readable in your Supabase project, behind row-level security. Whoever has admin access to that project can read it.
- A share link's secret URL is only available on the device that created it. Other devices list it and can revoke it.
- Tombstones (deleted-record markers, no content) are kept forever in v1.
- Signed photo URLs on a shared page last 30 minutes. The page fetches fresh ones when the recipient downloads the PDF; after that, a page left open needs a reload to show photos.
- `npm audit` reports moderate advisories in **dev-only** build tooling (workbox-build's dependency chain); production dependencies report 0 vulnerabilities.

---

## Device sync

How it works, in short (full design: [`docs/plans/device-sync.md`](docs/plans/device-sync.md)):

- Every write to IndexedDB is recorded in an `outbox` by a Dexie middleware (`src/lib/sync/tracking.ts`), so no call site can forget. The engine (`engine.ts`) pushes the outbox through the `sync_push` function, pulls changes with `seq > cursor`, applies them in one transaction, then downloads missing photo files.
- Records live in `sync_records` (one jsonb row per record, owner-only RLS, `owner_id` and `seq` set by the server). Photos live in the private `sync-photos` bucket at `<user id>/<photo id>.jpg`.
- Signing out flushes the outbox and then wipes the diary from the device. If another account ever signs in on a device holding leftovers, those are wiped first, so diaries never mix.

Verified on the local stack with two origins as two devices: sign-in with an invited address, an unknown address (identical message, no email), log on one device and see it on the other (with photo), edit, delete (photo file removed), offline edits on both devices with a conflict (later one wins on both), share-link visibility and revoke from the second device, sign-out wiping every table and the session, a second user on the same device seeing nothing of the first, leftovers of another account wiped on sign-in, and moving a pre-account diary into an account that already has data. pgTAP proves user B can't read or write user A's rows or photos and that anon gets nothing; the same attacks were repeated over HTTP with a real token.

**Not verified:** hosted Supabase, custom SMTP deliverability, a cold start while offline with an expired access token, and real phones.

---

## Privacy and GDPR

MealJournal is built to minimise data: no analytics or trackers, and a report is shared only when you publish it. The diary itself is synced to your own account in your own Supabase project, protected by row-level security (not end-to-end encrypted). **These safeguards alone don't make a deployment GDPR-compliant.** Food diaries can reveal health information (a special category under Art. 9 GDPR). Before using share links with real data, consider:

- Hosting Supabase in the EU, and reviewing Supabase's DPA and sub-processors. The whole diary (not just shared reports) is stored there.
- Diaries can reveal health information, so sign-up asks for explicit consent (recorded with the account), collects only an email address, and users can delete their account and all its data themselves. Give the dashboard to as few people as possible, and clean up unconfirmed users regularly.
- With open sign-ups, anyone can use your Supabase quota: keep the rate limits conservative and use custom SMTP with its own sending limits.
- Your email provider (SMTP) as a processor.
- Expiry periods and revoking links once your dietitian has what they need.
- The share access log (`shared_report_views`) stores recipients' IP addresses, which are personal data. The share page does not tell recipients about it, so consider mentioning it when you send a link; the legitimate interest is detecting a leaked link. Schedule `purge_old_share_views()` with pg_cron to enforce the 90-day retention.
- Your web host's access logs. They don't contain tokens, because tokens are in the URL fragment, but they do contain IP addresses.
- If anyone other than yourself will use the app: a privacy notice, a lawful basis and explicit consent for health data, and a process for data-subject requests.

---

## Project structure

```
src/
  lib/            domain logic (types, units, nutrition engine, snapshots, Dexie DB, backup)
  lib/report/     report builder, HTML/PDF formatting, PDF document, export helpers
  lib/share/      Supabase client (lazy) and the sign-in/publish/revoke/fetch API
  lib/sync/       device sync: pure merge rules, Dexie change tracking, engine, account helpers
  components/     UI kit (components/ui) and app components (timeline, editors, photos, ReportView)
  pages/          one file per screen
supabase/
  migrations/     SQL schema, RLS, triggers, sync RPC, storage buckets and policies
  functions/      get-shared-report Edge Function + shared access rules
  tests/          pgTAP permission tests
tests/            Vitest unit/integration tests
```
