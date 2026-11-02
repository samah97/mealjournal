-- MealJournal: private, read-only shared food-diary reports.
--
-- Only explicitly published report snapshots live here. The personal diary stays
-- on the user's device. Recipients never query this table: they go through the
-- `get-shared-report` Edge Function, which looks a report up by token hash.

create table public.shared_reports (
  id                  uuid primary key,
  owner_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token_hash          text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  title               text not null check (char_length(title) between 1 and 200),
  period_start        date not null,
  period_end          date not null,
  options             jsonb not null default '{}'::jsonb,
  payload             jsonb not null,
  photo_paths         text[] not null default '{}',
  pin_hash            text check (pin_hash is null or pin_hash ~ '^[0-9a-f]{64}$'),
  pin_salt            text check (pin_salt is null or pin_salt ~ '^[0-9a-f]{32}$'),
  pin_iterations      integer check (pin_iterations is null or pin_iterations between 100000 and 2000000),
  failed_pin_attempts integer not null default 0,
  last_failed_pin_at  timestamptz,
  expires_at          timestamptz not null,
  revoked_at          timestamptz,
  view_count          integer not null default 0,
  last_viewed_at      timestamptz,
  created_at          timestamptz not null default now(),

  constraint shared_reports_period_valid check (period_end >= period_start and period_end - period_start <= 366),
  constraint shared_reports_expiry_window check (expires_at > created_at and expires_at <= created_at + interval '91 days'),
  constraint shared_reports_pin_complete check ((pin_hash is null) = (pin_salt is null) and (pin_hash is null) = (pin_iterations is null)),
  constraint shared_reports_payload_size check (pg_column_size(payload) < 5 * 1024 * 1024),
  constraint shared_reports_photo_count check (cardinality(photo_paths) <= 500)
);

create index shared_reports_owner_idx on public.shared_reports (owner_id, created_at desc);

comment on table public.shared_reports is
  'Read-only food-diary report snapshots published by their owner. Raw share tokens are never stored, only SHA-256 hashes.';

-- ---------------------------------------------------------------- integrity triggers

-- On insert: server controls ownership, timestamps and counters.
create or replace function public.shared_reports_before_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.owner_id := auth.uid();
  end if;
  new.created_at := now();
  new.revoked_at := null;
  new.view_count := 0;
  new.last_viewed_at := null;
  new.failed_pin_attempts := 0;
  new.last_failed_pin_at := null;
  return new;
end;
$$;

create trigger shared_reports_before_insert
  before insert on public.shared_reports
  for each row execute function public.shared_reports_before_insert();

-- On update: revocation is permanent, and revoking wipes the report contents.
create or replace function public.shared_reports_before_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.revoked_at is not null and new.revoked_at is null then
    raise exception 'A revoked report cannot be re-activated';
  end if;
  if old.revoked_at is null and new.revoked_at is not null then
    new.revoked_at := now();
    new.payload := '{"revoked": true}'::jsonb;
  end if;
  return new;
end;
$$;

create trigger shared_reports_before_update
  before update on public.shared_reports
  for each row execute function public.shared_reports_before_update();

-- ---------------------------------------------------------------- privileges & RLS

alter table public.shared_reports enable row level security;

revoke all on public.shared_reports from anon, authenticated;
grant select, insert, delete on public.shared_reports to authenticated;
-- Owners may only change the revocation timestamp; counters are server-managed.
grant update (revoked_at) on public.shared_reports to authenticated;

create policy "Owners can read their own reports"
  on public.shared_reports for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "Owners can publish their own reports"
  on public.shared_reports for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "Owners can revoke their own reports"
  on public.shared_reports for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Owners can delete their own reports"
  on public.shared_reports for delete to authenticated
  using (owner_id = (select auth.uid()));

-- No policy exists for the anon role: unauthenticated clients cannot read this table at all.

-- ---------------------------------------------------------------- private photo storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Files live at <owner uid>/<report id>/<photo id>.jpg. Owners manage their own
-- folder; recipients only ever receive short-lived signed URLs from the Edge Function.
create policy "Owners upload report photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'report-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owners read report photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'report-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owners delete report photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'report-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------- housekeeping

-- Wipes the contents of expired reports (photos must be removed via the Storage API,
-- which the app does when the owner deletes a link). Schedule with pg_cron if desired:
--   select cron.schedule('purge-expired-reports', '17 3 * * *', 'select public.purge_expired_shared_reports()');
create or replace function public.purge_expired_shared_reports()
returns integer
language sql
security definer
set search_path = ''
as $$
  with purged as (
    update public.shared_reports
       set payload = '{"expired": true}'::jsonb
     where expires_at < now()
       and payload <> '{"expired": true}'::jsonb
    returning 1
  )
  select count(*)::integer from purged;
$$;

revoke all on function public.purge_expired_shared_reports() from public, anon, authenticated;
