-- pgTAP tests for shared report permissions. Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'other@example.test');

-- Owner publishes a report.
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

insert into public.shared_reports (id, token_hash, title, period_start, period_end, payload, expires_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', repeat('a', 64), 'Week 45', '2026-11-01', '2026-11-07',
        '{"days": []}', now() + interval '7 days');

select is((select count(*)::int from public.shared_reports), 1, 'owner can read their own report');
select is((select view_count from public.shared_reports), 0, 'counters are server-controlled');

select throws_ok(
  $$ update public.shared_reports set payload = '{"tampered": true}' $$,
  '42501', null, 'owner cannot rewrite a published snapshot');

select throws_ok(
  $$ insert into public.shared_reports (id, token_hash, title, period_start, period_end, payload, expires_at)
     values (gen_random_uuid(), repeat('b', 64), 'Too long', '2026-11-01', '2026-11-07', '{}', now() + interval '120 days') $$,
  '23514', null, 'expiry beyond 90 days is rejected');

-- Another signed-in user sees and changes nothing.
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
select is((select count(*)::int from public.shared_reports), 0, 'other users cannot read the report');
update public.shared_reports set revoked_at = now();
delete from public.shared_reports;

-- Back to the owner: report untouched, then revoke.
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select is((select revoked_at from public.shared_reports), null, 'other users cannot revoke the report');

update public.shared_reports set revoked_at = now();
select is((select payload from public.shared_reports), '{"revoked": true}'::jsonb, 'revoking wipes the report contents');

select throws_ok(
  $$ update public.shared_reports set revoked_at = null $$,
  'P0001', 'A revoked report cannot be re-activated', 'revocation is permanent');

-- Anonymous visitors have no table access at all.
reset role;
set local role anon;
select throws_ok($$ select * from public.shared_reports $$, '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.shared_reports (id, token_hash, title, period_start, period_end, payload, expires_at)
     values (gen_random_uuid(), repeat('c', 64), 'x', '2026-11-01', '2026-11-01', '{}', now() + interval '1 day') $$,
  '42501', null, 'anon cannot insert');

select * from finish();
rollback;
