# Plan: sync between devices (accounts)

Status: proposal, not implemented. Written 2026-11-02, decisions confirmed the same day.

## Goal

Something logged on the phone shows up on the laptop (and vice versa) within about a minute when both are online, and after reconnecting when one was offline. Works on any number of devices signed into the same account.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Accounts | Reuse the existing Supabase email-code sign-in (`sendSignInCode` / `verifySignInCode`). One account for sharing and sync. | Already built and tested, so no passwords to store. |
| Protection | **Email login + row-level security, no end-to-end encryption** (chosen). Data is stored readable in our own Supabase project (EU region) and only the signed-in owner can access it via the API. The project owner (you) can read it in the dashboard. | Simpler: nothing extra to remember, no lockout risk. E2EE can be layered on later (see "Upgrade path"). |
| Accounts required | **Signing in is required to use the app** (decided 2026-11-02). Each user has their own account, and the diary belongs to it and syncs automatically. There's no sync toggle. Data is still written to IndexedDB first (offline-capable, instant) and synced in the background. Without Supabase env vars the app shows a clear "not configured" screen instead of a fake login. | One simple model and fewer edge cases. No device-only mode to maintain. |
| Invite-only | *Superseded 2026-11-03: open self-registration with email codes, consent recorded, self-service deletion (see CLAUDE.md "Accounts").* Open sign-ups are **disabled**. Accounts are created by the project owner (Supabase dashboard → Authentication → Add/Invite user). The client uses `shouldCreateUser: false`. | Strangers can't create accounts or use your Supabase quota. See "Security". |
| Backend | Our own Supabase project: Postgres table + RPCs + a private storage bucket. No new SaaS. | Dexie Cloud, PowerSync and ElectricSQL each add a vendor. Our data model is small and record-oriented, so a custom engine is manageable. |
| Conflicts | **Last-writer-wins per record**, by the record's `updatedAt`. Deletes win over older edits (tombstones). | It's a single person on 2–3 devices, so true concurrent edits of the same entry are rare. |
| Share links | **Synced** (chosen). Every device lists all links and can revoke any of them. | One place to manage what the dietitian can see. |
| Speed | **Within a minute** (chosen), no Realtime in v1. | Covers the use case. Realtime is a small later addition. |

## How it works

```
Phone (Dexie)                    Supabase (RLS: owner only)                Laptop (Dexie)
 write ─► outbox ─► push ─► sync_records (jsonb) + sync-photos bucket ─► pull ─► apply
```

### Synced data
`foods`, `mealTemplates`, `entries`, `photos`, `settings`, `shareLinks`. All are keyed by random string ids (`uid()`), so records from different devices never collide.

Not synced: the outbox, sync metadata, and `settings.onboarded` (kept per device).

### Server (new migration `supabase/migrations/<ts>_sync.sql`)

- `sync_records(owner_id, collection, record_id, seq bigint, updated_at bigint, deleted bool, data jsonb, primary key (owner_id, collection, record_id))`.
  - `collection` has a check constraint over the six names. `data` is the record without photo blobs. There's a size check (under 1 MB).
  - `seq` is a **per-owner, monotonically increasing** counter assigned by a trigger that locks a `sync_cursor(owner_id, last_seq)` row. This keeps it gap-safe under concurrent pushes, so a pull with `seq > cursor` never skips a row (a global sequence can).
- RPC `sync_push(records jsonb)` (security invoker): an upsert that overwrites only when `incoming.updated_at >= existing.updated_at`. It returns the rejected rows, so the client adopts the newer server version.
- Pull: `select … where seq > $cursor order by seq limit 500`.
- RLS: `owner_id = auth.uid()` for select/insert/update. No delete grant (deletes are tombstones). No access for anon. Column grants follow the `shared_reports` pattern, and the server sets `owner_id`/`seq`.
- Private bucket `sync-photos/<uid>/<photoId>.jpg` and `<photoId>.thumb.jpg`, owner-only storage policies (same shape as `report-photos`). Photos are immutable (id-addressed), so they're uploaded once and removed when their tombstone is pushed.
- Tombstones older than 180 days are pruned by a scheduled `pg_cron` job (or skipped in v1).
- pgTAP: owner isolation, anon denied, LWW in `sync_push`, seq monotonicity, collection check.

### Client

New folder `src/lib/sync/`:

- `tracking.ts`: a Dexie **DBCore middleware** that adds `outbox` to every read-write transaction touching a synced table and records `{collection, recordId, op}` for every put/delete. That catches *all* writes, not just `repo.ts` (also `toggleFoodFavourite`, `moveEntry`, `updateSettings`, backup restore, starter foods), without touching each call site. Writes applied from the server run with a flag so they aren't echoed back.
- `merge.ts` (pure, tested): `resolve(local, remote)` LWW with tombstones, plus the record serialisation (strip/restore photo blobs, drop per-device fields).
- `engine.ts`: `syncNow()` = push the outbox (coalesced per record, read the *current* row at push time) → upload pending photos → pull since cursor → apply in one Dexie transaction → download missing photos → advance the cursor. A single-flight lock prevents overlapping runs, and retries use backoff.
- `useSync()` hook: status (`off | syncing | synced | offline | error`) and last-synced time.

Dexie `version(2)` (new block, version 1 untouched): `outbox: '[collection+recordId], queuedAt'` and `syncMeta: 'key'` (cursor, deviceId, enabled, accountId).

When it syncs: on app start, on `visibilitychange` → visible, on the `online` event, 2 s after a local write (debounced), and every 60 s while visible.

### Behaviour details

- **Photos.** An entry can arrive before its photo. `usePhoto` (`src/lib/hooks.ts`) is a live query, so the photo appears once downloaded, and until then a placeholder shows. Remote applies bypass `releasePhotos`, because photo deletes arrive as their own tombstones.
- **Share links.** A `ShareLinkRecord` revoked on the laptop syncs to the phone. The actual revocation already happens server-side via `share/api.ts`. `pendingRevoke` set offline on one device is executed by whichever device comes online first (both call the same idempotent revoke).
- **Usage counters** (`useCount`, `lastUsedAt`) are part of the record, so LWW can lose an increment when two devices log the same food offline. That's acceptable, because they only affect sort order.
- **Starter foods**: each device creates its own copies with different ids. On first link to an account that already has data, drop local `isExample` foods that were never used, so you don't end up with duplicates.
- **Account binding**: the local database is bound to one `accountId` in `syncMeta`. Sign-out wipes it, and if a different account is ever found signed in with leftover local data, that data is wiped before syncing, so diaries never mix.
- **Time zone**: entries already store local `date`/`time`, so nothing changes. `settings.timeZone` syncs too.

## Security

The worry is someone signing in with another person's email address. Here's how each risk is handled:

- **Typing someone else's email gets you nothing.** Sign-in is a one-time code sent *to that inbox*. Without access to the inbox, you can't complete the sign-in. Typing another person's address only sends them an unexpected email.
- **Code guessing**: 6-digit codes, expiry lowered to **10 minutes** (`otp_expiry = 600`), single use. Supabase rate-limits verify attempts per IP and sends per address (`[auth.rate_limit]` in `supabase/config.toml` and the hosted dashboard; set `email_sent`, `token_verifications`, `sign_in_sign_ups` conservatively).
- **Invite-only**: `enable_signup = false` (config.toml and the hosted dashboard) plus `shouldCreateUser: false` in `sendSignInCode`. An unknown email gets the *same* generic message as a known one ("If this address has an account, a code is on its way"), so the app doesn't reveal who has an account.
- **Data isolation**: every table and bucket is RLS `owner_id = auth.uid()`. `owner_id` is set server-side by a trigger and never trusted from the client. pgTAP proves user A can neither read nor overwrite user B's rows/photos, and anon gets nothing.
- **Sessions**: supabase-js keeps a refresh token in localStorage on that device. **Sign out wipes the local diary** (after flushing the outbox; if there are unsynced changes and you're offline, it warns first), so a shared or lent device keeps nothing. "Sign out everywhere" uses `signOut({ scope: 'global' })`.
- **Email delivery**: production needs a **custom SMTP** provider (Supabase's built-in sender is rate-limited and meant for testing). SPF/DKIM must be set up, so codes don't land in spam and the sender can't be spoofed.
- **Not added**: a CAPTCHA (would load a third-party script, against the no-external-CDN rule; rate limits + invite-only cover the risk). MFA is a possible later addition (Supabase TOTP).
- **Account deletion**: deleting the user in the dashboard cascades to `sync_records`/`sync_cursor`. An Edge Function deletes their storage folders.

## User flows

1. **First launch**: sign-in screen (email → 6-digit code). After sign-in, a new account starts empty. If this browser already has a local diary from before accounts existed, a one-time step asks "Move this device's diary into your account?" (default yes) and uploads it with a progress bar.
2. **Another device**: sign in → the diary downloads (progress shown, entries usable as they arrive).
3. **Status**: a small "Synced 2 min ago" / "Offline – changes will sync later" line in Settings and an unobtrusive icon in the header. No badges, nothing nagging.
4. **Sign out**: flushes pending changes, then removes the local diary from this device.
5. **Delete account data**: deletes all `sync_records` and photos for the account (and signs out).

Existing actions that need an account-aware confirm:
- *Restore backup*: "This replaces your diary **on all your devices**."
- *Delete all data*: deletes the account's data everywhere (same as 5).
- The Sharing page reuses the app session. Its own sign-in form goes away.

## Implementation phases

1. **Server**: migration, RPC, bucket policies, pgTAP tests. Local Supabase.
2. **Core logic**: `merge.ts` + unit tests (LWW cases, tombstones, serialisation, starter-food dedupe).
3. **Change tracking**: Dexie v2, middleware, outbox coalescing. Tests with fake-indexeddb (node env for Blob tests).
4. **Engine**: push/pull/apply, photo upload/download, cursor, single-flight, backoff.
5. **UI**: auth gate (route guard + sign-in page), one-time "move local diary into account", status, account-aware confirms, Sharing page uses the app session, auth config hardening (`supabase/config.toml`).
6. **E2E on local Supabase**: use the `dev` (5173) and `recipient` (5174) origins as two devices. Log on one, see it on the other; offline edit then reconnect; conflicting edit (LWW); delete; photo; share-link revoke from the other device; second user can't see the first user's data; unknown email can't sign in; sign-out wipes local data.
7. **Docs**: update CLAUDE.md product rules ("diary stays in IndexedDB" becomes "the diary is stored on the device and synced to the user's account in our Supabase project, behind RLS"), README (setup, invite-only user creation, custom SMTP), and the in-app privacy text.

Rough size: phases 1–4 are the bulk, about 1,000–1,300 lines including tests.

## Prerequisites and limits

- Needs the **hosted Supabase project** (EU region), which is still pending. Sync can't work across your real phone and laptop until it's deployed.
- Free tier: 500 MB database / 1 GB storage. With compressed photos of about 150–250 KB, storage holds roughly 4,000–6,000 photos before an upgrade is needed.
- What's exposed: anyone with admin access to the Supabase project (you, or Supabase staff under their policies) can read the diary. The API only serves it to the signed-in owner.

## Upgrade path (later, optional)

- **Realtime**: subscribe to `sync_records` inserts for the owner and call `syncNow()` on change.
- **E2EE**: swap `data jsonb` for `iv + ciphertext` and add a passphrase-wrapped data key. LWW would then use the plaintext `updated_at` column already present, and a one-time re-upload migrates existing rows.
