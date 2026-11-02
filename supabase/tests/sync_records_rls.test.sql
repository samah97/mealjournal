-- pgTAP tests for device sync: owner isolation, LWW, ordering, storage. Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

-- ---------------------------------------------------------------- user A pushes
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select is(
  (select count(*)::int from public.sync_push('[
    {"collection": "entries", "record_id": "e1", "updated_at": 1000, "data": {"id": "e1", "name": "Breakfast A"}},
    {"collection": "foods",   "record_id": "f1", "updated_at": 1000, "data": {"id": "f1", "name": "Labneh"}}
  ]'::jsonb)),
  0, 'new records are accepted');

select is(
  (select array_agg(distinct owner_id)::text from public.sync_records),
  '{11111111-1111-1111-1111-111111111111}', 'owner_id is set by the server');

select ok(
  (select min(seq) > 0 and count(distinct seq) = 2 from public.sync_records),
  'each write gets its own positive seq');

-- LWW: an older change is rejected and the newer server version returned.
select is(
  (select data->>'name' from public.sync_push('[{"collection": "entries", "record_id": "e1", "updated_at": 500, "data": {"id": "e1", "name": "stale"}}]'::jsonb)),
  'Breakfast A', 'an older change is rejected and the server version returned');
select is(
  (select data->>'name' from public.sync_records where record_id = 'e1'), 'Breakfast A', 'older change did not overwrite');

-- A newer change wins and moves to the end of the change feed.
select is(
  (select count(*)::int from public.sync_push('[{"collection": "entries", "record_id": "e1", "updated_at": 2000, "data": {"id": "e1", "name": "Breakfast A2"}}]'::jsonb)),
  0, 'a newer change is accepted');
select ok(
  (select seq from public.sync_records where record_id = 'e1') > (select seq from public.sync_records where record_id = 'f1'),
  'seq increases monotonically with every write');
select is(
  (select data->>'name' from public.sync_records where record_id = 'e1'), 'Breakfast A2', 'newer change overwrote');

-- Tombstones carry no data.
select is(
  (select count(*)::int from public.sync_push('[{"collection": "foods", "record_id": "f1", "updated_at": 3000, "deleted": true, "data": {"id": "f1", "name": "Labneh"}}]'::jsonb)),
  0, 'a delete is accepted');
select ok(
  (select deleted and data is null from public.sync_records where record_id = 'f1'), 'a tombstone keeps no data');

select throws_ok(
  $$ select * from public.sync_push('[{"collection": "secrets", "record_id": "x", "updated_at": 1, "data": {}}]'::jsonb) $$,
  '23514', null, 'unknown collections are rejected');

select throws_ok(
  $$ delete from public.sync_records $$, '42501', null, 'rows cannot be hard-deleted');

select throws_ok(
  $$ insert into public.sync_records (owner_id, collection, record_id, updated_at, data)
     values ('22222222-2222-2222-2222-222222222222', 'foods', 'planted', 1, '{}') $$,
  '42501', null, 'clients cannot choose the owner');

select throws_ok($$ select * from public.sync_cursor $$, '42501', null, 'the counter table is not readable');

-- Photos in A's folder.
insert into storage.objects (bucket_id, name) values ('sync-photos', '11111111-1111-1111-1111-111111111111/p1.jpg');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'sync-photos'), 1, 'owner can store and see their photo');

-- ---------------------------------------------------------------- user B sees and changes nothing of A's
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select is((select count(*)::int from public.sync_records), 0, 'other users cannot read the records');

-- Same record id from B creates B's own row and leaves A's alone.
select is(
  (select count(*)::int from public.sync_push('[{"collection": "entries", "record_id": "e1", "updated_at": 9999, "data": {"id": "e1", "name": "B was here"}}]'::jsonb)),
  0, 'B can push a record with the same id');
select is(
  (select owner_id::text from public.sync_records where record_id = 'e1'),
  '22222222-2222-2222-2222-222222222222', 'B only sees their own copy');

update public.sync_records set data = '{"name": "hacked"}', updated_at = 99999 where owner_id = '11111111-1111-1111-1111-111111111111';

select is((select count(*)::int from storage.objects where bucket_id = 'sync-photos'), 0, 'other users cannot list the photos');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('sync-photos', '11111111-1111-1111-1111-111111111111/planted.jpg') $$,
  '42501', null, 'other users cannot upload into the owner''s folder');

-- ---------------------------------------------------------------- back to A: untouched
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select is(
  (select data->>'name' from public.sync_records where record_id = 'e1'), 'Breakfast A2', 'other users cannot overwrite the records');

-- ---------------------------------------------------------------- anon gets nothing
reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok($$ select * from public.sync_records $$, '42501', null, 'anon cannot select');
select throws_ok(
  $$ select * from public.sync_push('[{"collection": "foods", "record_id": "x", "updated_at": 1, "data": {}}]'::jsonb) $$,
  '42501', null, 'anon cannot push');
select is((select count(*)::int from storage.objects where bucket_id = 'sync-photos'), 0, 'anon cannot list the photos');

select * from finish();
rollback;
