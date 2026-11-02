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
| **Private share links** | Publishes an immutable snapshot of only the selected report and its photos. Links use 256-bit random tokens; only SHA-256 hashes are stored, and the token sits in the URL fragment so it never reaches server logs or link-preview bots. Optional PIN (PBKDF2, locks for 15 minutes after 10 wrong attempts). Expiry after 7, 30 or 90 days. Revocation is instant and permanent and wipes the uploaded content. Photos live in a private bucket and recipients only ever get 30-minute signed URLs. Recipients need no account. The share page is read-only, has a PDF download, and is marked noindex. You can copy the link, send it by WhatsApp or email, or use the native share sheet. A list shows all your links with status, view count, revoke and delete. |
| **Privacy & reliability** | Local-first IndexedDB storage, with persistent storage requested. No analytics, ads or trackers. Full JSON backup and restore (photos included). "Delete all data". An offline indicator. Revocations made while offline are queued and sent automatically when you reconnect. |
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
- **Supabase** (Auth with email one-time codes, Postgres with RLS, private Storage, and one Edge Function) for sharing only, loaded on demand
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

Open http://localhost:5173. Everything except share links works with no configuration.

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
- Export a **backup** regularly (Settings → Backup). The diary lives only on the phone, so if you clear browser data or uninstall the app, the diary is deleted.

---

## 5. Supabase setup (only needed for share links)

Choose an **EU region** (e.g. Frankfurt) for health-related data.

1. **Create a project** at [supabase.com](https://supabase.com/dashboard). Note the **project ref**, the **Project URL**, and the **Publishable key** (Project Settings → API Keys; the legacy "anon" key also works).
   Never put the secret/service-role key in the app or in `.env` files used by Vite.

2. **Apply the database migration.** This creates the `shared_reports` table, its RLS policies, its triggers and the private `report-photos` bucket.
   ```bash
   npx supabase login
   ```
   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```
   ```bash
   npx supabase db push
   ```
   Alternatively, paste [`supabase/migrations/20261102000000_shared_reports.sql`](supabase/migrations/20261102000000_shared_reports.sql) into **SQL Editor** and run it.

3. **Deploy the Edge Function.** Recipients have no account, so JWT verification is disabled for this one function; it authorises access itself using the share token.
   ```bash
   npx supabase functions deploy get-shared-report --no-verify-jwt
   ```
   It uses the built-in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secrets, which only exist server-side. You don't need to set anything.

4. **Configure sign-in** (Authentication):
   - **Sign In / Providers → Email**: enabled.
   - **URL Configuration**: set **Site URL** to your deployed URL. Add these **Redirect URLs**: `https://YOUR-DOMAIN/sharing` and `http://localhost:5173/sharing`.
   - **Email Templates → Magic Link**: include the one-time code so you can sign in inside the installed app without leaving it. A ready-made template is in [`supabase/templates/magic_link.html`](supabase/templates/magic_link.html); paste it in, or run `npx supabase config push` after updating `site_url` and `additional_redirect_urls` in [`supabase/config.toml`](supabase/config.toml).
   - For real use, configure **custom SMTP** (Authentication → Emails). The built-in mailer is heavily rate-limited.

5. **Configure the app.** Copy `.env.example` to `.env.local` (and set the same variables on your host):
   ```
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
   Rebuild or restart the dev server. **Settings → Shared links** now offers sign-in.

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
   Then put the printed `API_URL` and `PUBLISHABLE_KEY` into `.env.local` as `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` and run `npm run dev`. Stop everything with `npx supabase stop --no-backup`.

---

## 6. Deploy

The app is a static site (`dist/`) and needs **HTTPS** plus an SPA fallback to `index.html`. Config files for common hosts are included.

**Cloudflare (Workers, the dashboard default)**: connect the GitHub repo, build command `npm run build`, deploy command `npx wrangler deploy`. `wrangler.jsonc` serves `dist` with SPA fallback; `public/_headers` adds `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`, etc. Don't add a `/* /index.html 200` rule to `_redirects`: Workers rejects it as an infinite loop.

**Cloudflare Pages / Netlify**: build command `npm run build`, output directory `dist`. Pages falls back to `index.html` automatically; Netlify uses `netlify.toml`. Both apply `public/_headers`.

**Vercel**: framework "Vite". `vercel.json` provides the rewrites and headers.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as build-time environment variables on the host if you want share links. Then add the deployed URL to Supabase's Site URL and Redirect URLs (step 5.4).

---

## 7. What needs configuration, and what was and wasn't verified

**Works with zero configuration** (verified in a browser during development): creating foods with and without nutrition, unit conversions, meals from saved foods, logging a meal with changed quantities while the template stays unchanged, gallery photo upload and compression, free-text entries with notes, moving entries, reusing entries on another day, the diary history, 7-day PDFs with and without photos (pages inspected visually), backup → wipe → restore, data surviving server restarts and reloads, and the installable manifest with an active service worker. With the server stopped, the app shell loaded from cache, an entry could be recorded and a PDF generated.

**Requires the Supabase setup above:** sign-in, publishing links, the link list, and revocation. All of this was **verified end-to-end on a local Supabase stack** (same Postgres, Auth, Storage and Edge Runtime as hosted):
- The migration applies cleanly, and the 10 pgTAP permission tests pass.
- Email-code sign-in works, using the custom template.
- Publishing uploads only the 3 photos in the period. The server stores only the token hash, never the raw token, and an entry outside the period never reaches the server.
- The link opens on a separate origin with no session and no diary (the equivalent of incognito). Wrong PIN → "9 attempts left"; correct PIN → report, photos via signed URLs, and a PDF download with photos.
- Isolation: anonymous clients and a second signed-in user can't read, revoke, list, download or upload anything. Public photo URLs, tampered signed URLs and near-miss tokens are all refused.
- Editing the diary after publishing doesn't change the shared report.
- Revoking makes the link unavailable at once, wipes its content and deletes its photos. An expired link becomes unavailable, and the purge function wipes it. Deleting a link removes everything server-side.

**Still to do on a hosted project:** one real publish, open on another phone, then revoke, after deploying (section 5). The PIN lockout after 10 attempts and the offline revocation queue are covered by unit tests only.

**Needs your phone:** camera capture (the code path is standard `<input capture>` and was only tested with gallery-style file input on desktop), installing on Android, and the Android share sheet for PDFs.

### Known limitations
- The PDF uses the built-in Helvetica font, which covers Latin script (English, Dutch, French, German, etc.). Characters it can't draw are mapped to the nearest equivalent ("ł" → "l"), and other scripts such as **Arabic appear as "?" in the PDF**. The in-app preview and the share page display all scripts correctly.
- The diary lives on one device. There is no multi-device sync by design (privacy). Use backup and restore to move devices.
- Signed photo URLs on a shared page last 30 minutes. The page fetches fresh ones when the recipient downloads the PDF; after that, a page left open needs a reload to show photos.
- `npm audit` reports moderate advisories in **dev-only** build tooling (workbox-build's dependency chain); production dependencies report 0 vulnerabilities.

---

## Privacy and GDPR

MealJournal is built to minimise data: the diary never leaves the device unless you publish a specific report. **These safeguards alone don't make a deployment GDPR-compliant.** Food diaries can reveal health information (a special category under Art. 9 GDPR). Before using share links with real data, consider:

- Hosting Supabase in the EU, and reviewing Supabase's DPA and sub-processors.
- Your email provider (SMTP) as a processor.
- Expiry periods and revoking links once your dietitian has what they need.
- Your web host's access logs. They don't contain tokens, because tokens are in the URL fragment, but they do contain IP addresses.
- If anyone other than yourself will use the app: a privacy notice, a lawful basis and explicit consent for health data, and a process for data-subject requests.

---

## Project structure

```
src/
  lib/            domain logic (types, units, nutrition engine, snapshots, Dexie DB, backup)
  lib/report/     report builder, HTML/PDF formatting, PDF document, export helpers
  lib/share/      Supabase client (lazy) and the publish/revoke/fetch API
  components/     UI kit (components/ui) and app components (timeline, editors, photos, ReportView)
  pages/          one file per screen
supabase/
  migrations/     SQL schema, RLS, triggers, storage bucket and policies
  functions/      get-shared-report Edge Function + shared access rules
  tests/          pgTAP permission tests
tests/            Vitest unit/integration tests
```
