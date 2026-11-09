-- pgTAP tests for the share access log. Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'other@example.test');

insert into public.shared_reports (id, owner_id, token_hash, title, period_start, period_end, payload, expires_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', repeat('a', 64), 'Week 45',
        '2026-11-01', '2026-11-07', '{"days": []}', now() + interval '7 days');

-- The Edge Function (service role) writes the log.
insert into public.shared_report_views (report_id, owner_id, kind, ip, user_agent, created_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'viewed', '203.0.113.7', 'Mozilla/5.0', now()),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'pin_failed', '2001:db8::1', null, now() - interval '100 days');

set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select is((select count(*)::int from public.shared_report_views), 2, 'owner can read the access log');
select throws_ok(
  $$ insert into public.shared_report_views (report_id, owner_id, kind) values
     ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'viewed') $$,
  '42501', null, 'owner cannot forge log entries');
select throws_ok($$ delete from public.shared_report_views $$, '42501', null, 'owner cannot edit the log');

set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
select is((select count(*)::int from public.shared_report_views), 0, 'other users cannot read the log');

reset role;
set local role anon;
select throws_ok($$ select * from public.shared_report_views $$, '42501', null, 'anon cannot read the log');

reset role;
select is(public.purge_old_share_views(), 1, 'entries older than 90 days are purged');
select is((select count(*)::int from public.shared_report_views), 1, 'recent entries are kept');

delete from public.shared_reports;
select is((select count(*)::int from public.shared_report_views), 0, 'deleting a report deletes its log');

select * from finish();
rollback;
