-- MealJournal: sync of the diary between a user's own devices.
--
-- Every synced record (food, meal, entry, photo metadata, settings, share link) is one
-- row, readable and writable only by its owner. Deletes are tombstones (deleted = true,
-- data = null) so other devices learn about them. Photo files live in the private
-- `sync-photos` bucket at <owner uid>/<photo id>.jpg and <photo id>.thumb.jpg.

-- ---------------------------------------------------------------- per-owner change counter

-- Each owner has one counter row. Writing a sync record locks it until commit, so the
-- `seq` values of one owner are handed out (and become visible) strictly in order:
-- a pull of "seq > cursor" can never skip a row that commits later.
create table public.sync_cursor (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  last_seq bigint not null default 0
);

alter table public.sync_cursor enable row level security;
revoke all on public.sync_cursor from anon, authenticated;
-- No policies: only the trigger below (security definer) touches this table.

-- ---------------------------------------------------------------- records

create table public.sync_records (
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  collection  text not null check (collection in ('foods', 'mealTemplates', 'entries', 'photos', 'settings', 'shareLinks')),
  record_id   text not null check (char_length(record_id) between 1 and 100),
  seq         bigint not null default 0,
  -- Client time (ms since epoch) of the last change; the newest change wins.
  updated_at  bigint not null check (updated_at > 0),
  deleted     boolean not null default false,
  data        jsonb,

  primary key (owner_id, collection, record_id),
  constraint sync_records_tombstone check (deleted = (data is null)),
  constraint sync_records_data_size check (data is null or pg_column_size(data) < 1024 * 1024)
);

create index sync_records_owner_seq_idx on public.sync_records (owner_id, seq);

comment on table public.sync_records is
  'Diary records synced between the devices of one user. Owner-only (RLS); deletes are tombstones.';

-- Server controls ownership and ordering; the client never sets owner_id or seq.
create or replace function public.sync_records_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.owner_id := auth.uid();
    end if;
  else
    new.owner_id := old.owner_id;
  end if;

  insert into public.sync_cursor as c (owner_id, last_seq)
  values (new.owner_id, 1)
  on conflict (owner_id) do update set last_seq = c.last_seq + 1
  returning c.last_seq into new.seq;

  if new.deleted then
    new.data := null;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_records_before_write() from public, anon, authenticated;

create trigger sync_records_before_write
  before insert or update on public.sync_records
  for each row execute function public.sync_records_before_write();

-- ---------------------------------------------------------------- privileges & RLS

alter table public.sync_records enable row level security;

revoke all on public.sync_records from anon, authenticated;
grant select on public.sync_records to authenticated;
-- No delete grant: deletes are tombstones. owner_id and seq are server-managed.
grant insert (collection, record_id, updated_at, deleted, data) on public.sync_records to authenticated;
grant update (updated_at, deleted, data) on public.sync_records to authenticated;

create policy "Owners read their own sync records"
  on public.sync_records for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "Owners add their own sync records"
  on public.sync_records for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "Owners change their own sync records"
  on public.sync_records for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- No policy exists for the anon role.

-- ---------------------------------------------------------------- push

-- Upserts a batch of records. A record is only overwritten by a change that is at least
-- as new (last writer wins). Returns the server's version of every rejected record so
-- the client can adopt it. Runs as the caller, so RLS applies.
create or replace function public.sync_push(records jsonb)
returns table (collection text, record_id text, seq bigint, updated_at bigint, deleted boolean, data jsonb)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if jsonb_typeof(records) is distinct from 'array' or jsonb_array_length(records) > 500 then
    raise exception 'records must be an array of at most 500 items' using errcode = '22023';
  end if;

  return query
  with incoming as (
    select distinct on (r.collection, r.record_id)
           r.collection, r.record_id, r.updated_at, coalesce(r.deleted, false) as deleted,
           case when coalesce(r.deleted, false) then null else r.data end as data
      from jsonb_to_recordset(records) as r(collection text, record_id text, updated_at bigint, deleted boolean, data jsonb)
     order by r.collection, r.record_id, r.updated_at desc
  ),
  written as (
    insert into public.sync_records as s (collection, record_id, updated_at, deleted, data)
    select i.collection, i.record_id, i.updated_at, i.deleted, i.data from incoming i
    on conflict on constraint sync_records_pkey do update
      set updated_at = excluded.updated_at, deleted = excluded.deleted, data = excluded.data
      where excluded.updated_at >= s.updated_at
    returning s.collection, s.record_id
  )
  -- Reads the snapshot from before this statement: for rejected rows that is the
  -- (unchanged) newer server version.
  select s.collection, s.record_id, s.seq, s.updated_at, s.deleted, s.data
    from public.sync_records s
    join incoming i on i.collection = s.collection and i.record_id = s.record_id
   where s.owner_id = auth.uid()
     and not exists (select 1 from written w where w.collection = s.collection and w.record_id = s.record_id);
end;
$$;

revoke all on function public.sync_push(jsonb) from public, anon;
grant execute on function public.sync_push(jsonb) to authenticated;

-- ---------------------------------------------------------------- private photo storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sync-photos', 'sync-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Files live at <owner uid>/<photo id>.jpg (+ .thumb.jpg). Photos are immutable, so
-- there is no update policy: they are uploaded once and removed with their tombstone.
create policy "Owners upload sync photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'sync-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owners read sync photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'sync-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owners delete sync photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'sync-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
