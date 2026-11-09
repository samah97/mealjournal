-- pgTAP: deleting an account (delete-account Edge Function → auth.admin.deleteUser) removes
-- all of that user's server-side rows and nobody else's. Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'leaving@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'staying@example.test');

-- Both users sync a record and publish a report.
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select public.sync_push('[{"collection": "entries", "record_id": "e1", "updated_at": 1000, "data": {"id": "e1"}}]'::jsonb);
insert into public.shared_reports (id, token_hash, title, period_start, period_end, payload, expires_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', repeat('a', 64), 'Week 45', '2026-11-01', '2026-11-07', '{}', now() + interval '7 days');

set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
select public.sync_push('[{"collection": "entries", "record_id": "e2", "updated_at": 1000, "data": {"id": "e2"}}]'::jsonb);
insert into public.shared_reports (id, token_hash, title, period_start, period_end, payload, expires_at)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', repeat('b', 64), 'Week 45', '2026-11-01', '2026-11-07', '{}', now() + interval '7 days');

-- What auth.admin.deleteUser does.
reset role;
select lives_ok($$ delete from auth.users where id = '11111111-1111-1111-1111-111111111111' $$, 'the auth user can be deleted');

select is((select count(*)::int from public.sync_records where owner_id = '11111111-1111-1111-1111-111111111111'), 0, 'their synced records are gone');
select is((select count(*)::int from public.sync_cursor where owner_id = '11111111-1111-1111-1111-111111111111'), 0, 'their sync cursor is gone');
select is((select count(*)::int from public.shared_reports where owner_id = '11111111-1111-1111-1111-111111111111'), 0, 'their shared reports are gone');
select is(
  (select count(*)::int from public.sync_records) + (select count(*)::int from public.shared_reports), 2,
  'other users keep their data');

select * from finish();
rollback;
