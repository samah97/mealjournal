# MealJournal – guidance for Claude

Private, local-first food diary PWA (React 19 + TS strict + Vite 8 + Tailwind 4 + Dexie). Sign-in is required (self-service Supabase accounts, email one-time codes, no passwords); the diary syncs between a user's devices. Produces PDF reports and optional private share links (Supabase) for a dietitian. User-facing docs, setup and deployment: [README.md](README.md).

## Commands

```bash
npm run dev          # http://localhost:5173 (no service worker in dev)
npm test             # vitest (jsdom; some files opt into node env)
npm run typecheck    # tsc -b — must stay clean (strict, noUncheckedIndexedAccess)
npm run build        # tsc -b && vite build (also generates dist/sw.js)
npm run preview      # production build on :4173 – use for PWA/offline checks
```

`.claude/launch.json` has `dev`, `preview`, and `recipient` (a second dev server on `127.0.0.1:5174`, used as a separate "incognito" origin when testing share links).

## Product rules (from the original brief – do not break)

- **Diary, not calorie counter**: no targets, scores, gamification or dietary advice. Nutrition is optional and never prominent by default (Home summary is opt-in).
- **Missing ≠ zero**: unknown nutrient values are absent keys, shown as "—"; incomplete sums show "≥" (HTML) / "*" (PDF) with an explanation. Never invent or estimate values.
- **Never assume unit weights**: piece/tbsp/cup/etc. only convert via user-defined `UnitConversion`s. Only metric units convert automatically.
- **History is immutable**: logging copies food/meal data into `DiaryEntryItem` snapshots (`src/lib/snapshot.ts`). Library edits/deletes must never change past entries. Shared reports are a further frozen snapshot.
- **Privacy**: the diary is stored on the device (IndexedDB first) and synced to the user's own account in our Supabase project, behind RLS (owner-only), not end-to-end encrypted. A report is shared with others only when explicitly published (and only the fields/photos the user selected). No analytics, no external fonts/CDNs, no diary data in URL query params (use router state). Share tokens live in the URL **fragment**; the raw share URL is never synced (only its hash is on the server).
- **Accounts**: open self-registration with email codes, no passwords. Only the "Create account" flow creates users (`sendSignUpCode`, `shouldCreateUser: true`, records `privacy_version`/`privacy_accepted_at` in user_metadata); "Sign in" keeps `shouldCreateUser: false`. Collect only the email (name optional, stored as `patientName`). Never reveal whether an address has an account, never trust `owner_id` from the client. Users can delete their own account (`delete-account` Edge Function, uid from the JWT only). Sign-out wipes the local diary after flushing the outbox.
- **Never fake features**: if Supabase env vars are missing, the app shows a "not set up" screen (no fake login); never generate a non-functional link.
- Any demo content must be labelled and removable (`isExample` starter foods, no nutrition).
- UI: calm neutral + sage, Inter (bundled), mobile-first, one-hand reachable actions, bottom sheets on phone.

## Architecture

- `src/lib/types.ts` – domain model. `db.ts` – Dexie schema (**add a new `version()` for schema changes; never edit old ones**), settings defaults. `repo.ts` – all writes (transactions, photo ref-counting via `releasePhotos`).
- `nutrition.ts` – pure engine (`nutritionFactor`, `itemNutrition`, `combineSummaries`, `entryNutrition`). `units.ts` – units + `toBaseAmount`.
- `report/buildReport.ts` – pure: entries + options → `ReportData` (only selected fields included; tested). `ReportView.tsx` renders it as HTML (preview + share page); `report/pdf.tsx` renders the PDF (lazy-loaded chunk).
- `share/api.ts` – sign-in codes, publish/revoke/delete + recipient fetch.
- `sync/` – device sync. `merge.ts` pure rules (LWW, serialisation, account binding, backoff); `tracking.ts` Dexie DBCore middleware that queues every write to a synced table in `outbox` (use `skipTracking(tx)` for writes that come from the server); `engine.ts` push → pull → apply → photos, single-flight, `startSync()` scheduling; `account.ts` sign-out + wipe, account deletion. `components/AuthGate.tsx` guards all app routes (not `/shared`): sign-up/sign-in → bind → `Onboarding.tsx` for brand-new accounts only (`lib/onboarding.ts`; `onboarded` is per-device, set with `markOnboarded()` which must not queue a sync). Server: `supabase/migrations/*_sync.sql` (`sync_records`, per-owner `seq` via `sync_cursor`, `sync_push` LWW RPC, private `sync-photos` bucket); pgTAP in `supabase/tests/sync_records_rls.test.sql`. Dexie `version(2)` added `outbox` + `syncMeta`. `share/supabase.ts` – lazy client, `isSharingConfigured()`.
- `supabase/functions/_shared/access.ts` – **single source of truth** for token/PIN hashing and access decisions, imported by the browser, the Edge Function (Deno, `.ts` import extensions) and tests.
- `supabase/migrations/` – `shared_reports` table, RLS, triggers (revocation is permanent and wipes payload), column-level grants, private `report-photos` bucket (`<uid>/<reportId>/<photoId>.jpg`). `supabase/tests/` – pgTAP.
- Pages are one file per route in `src/pages`; routes in `src/router.tsx` (`handle: { hideNav, wide }`). UI kit in `src/components/ui`.
- Time: entries store local `date` (YYYY-MM-DD) + `time` (HH:mm) in the configured zone (default Europe/Amsterdam, 24h). Use `nowInZone`, never `new Date()` formatting.

## Known pitfalls (learned the hard way)

- **react-pdf 4.x**: `fixed` elements and `render`-prop page numbers silently don't render (tested with React 19.2/19.3, layout 4.7/5.x). Footer + "Page X of Y" are stamped afterwards with `@cantoo/pdf-lib` (`addPageFooters`). Don't reintroduce `fixed`/`render`.
- PDF uses built-in Helvetica (WinAnsi only): all report text goes through `sanitize`/`pdfSafeText`; don't use "≥" or other non-Latin-1 glyphs in static PDF strings. Italic = `fontStyle: 'italic'` with family Helvetica (never `fontFamily: 'Helvetica-Oblique'` + italic – crashes). `minPresenceAhead` is ignored, so a day heading is wrapped together with its first entry. Text inside a column `View` must not have `flex: 1` (collapses to 0 height → overlap).
- Inspect PDFs visually (render pages with PyMuPDF: `python -I -c "import pymupdf ..."`), not just by size.
- Edge Function sees `SUPABASE_URL=http://kong:8000` locally → it returns signed photo URLs **relative**; the client resolves them against `VITE_SUPABASE_URL`.
- Settings load async: initialise form state from `useStoredSettings()` (undefined while loading), not `useSettings()` (returns defaults first and would overwrite saved prefs).
- Grids with truncating text need `minmax(0,1fr)`, not `1fr`, or phones overflow horizontally.
- Service worker: `registerType: 'prompt'` + `clientsClaim: true`. Offline testing requires a controlled page (navigate after SW activation).
- jsdom Blobs don't survive fake-indexeddb cloning → DB tests that read Blobs use `// @vitest-environment node`.
- In the Claude Browser pane, screenshots can lag/stale; verify state via JS/DOM. After toggling viewport emulation, reload before measuring layout.

## Testing sync and sharing end-to-end locally

Needs Docker Desktop running.
```bash
npx -y supabase@2 start                       # applies migrations
npx -y supabase@2 test db                     # pgTAP (shared_reports + sync)
npx -y supabase@2 functions serve --no-verify-jwt
```
Temporary `.env.development.local` with `VITE_SUPABASE_URL=http://127.0.0.1:54321` + the printed publishable key. Register through the app's "Create account" flow, or create a ready-made user with the admin API (`POST /auth/v1/admin/users`, secret key, `email_confirm: true`); codes appear in Mailpit (http://127.0.0.1:54324, API `/api/v1/search?query=to:<email>`; the same address can only be mailed once per 60 s). Use `dev` and `recipient` as two devices (they move to other ports if 5173/5174 are taken); open share links on the `recipient` origin. Simulate offline by overriding `navigator.onLine` in the page. Drive Dexie from the page console with `await import('/src/lib/db.ts')`. Afterwards: delete the env file and `npx supabase stop --no-backup`.

## Conventions

- Match existing style: functional components, Tailwind tokens from `src/index.css` (`bg-surface`, `text-muted`, `bg-accent-soft`, …), `cn()` for classes, lucide icons, `toast` from sonner, `useConfirm()` for destructive actions.
- Keep business logic pure in `src/lib` and cover it with tests in `tests/`.
- Dependencies: maintained, stable versions; check peer compatibility. Production `npm audit --omit=dev` should stay at 0.
