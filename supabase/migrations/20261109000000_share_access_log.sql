-- MealJournal: access log for shared report links.
--
-- Lets an owner see when their link was opened, from which IP address and on what kind of
-- device, so they can spot a link that has been forwarded or leaked. Only the Edge Function
-- (service role) writes here; owners can only read the log of their own reports. Rows are
-- removed together with the report (and so with the account), and purged after 90 days.

create table public.shared_report_views (
  id          bigint generated always as identity primary key,
  report_id   uuid not null references public.shared_reports (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('viewed', 'pin_failed')),
  ip          inet,
  user_agent  text check (user_agent is null or char_length(user_agent) <= 300),
  created_at  timestamptz not null default now()
);

create index shared_report_views_report_idx on public.shared_report_views (report_id, created_at desc);
create index shared_report_views_created_idx on public.shared_report_views (created_at);

comment on table public.shared_report_views is
  'Security access log for shared report links (time, IP, user agent). Visible to the report owner only; purged after 90 days.';

alter table public.shared_report_views enable row level security;

revoke all on public.shared_report_views from anon, authenticated;
grant select on public.shared_report_views to authenticated;

create policy "Owners can read the access log of their own reports"
  on public.shared_report_views for select to authenticated
  using (owner_id = (select auth.uid()));

-- No insert/update/delete for clients: the log cannot be forged or edited from the app.

-- ---------------------------------------------------------------- housekeeping

-- Schedule with pg_cron if desired:
--   select cron.schedule('purge-share-access-log', '27 3 * * *', 'select public.purge_old_share_views()');
create or replace function public.purge_old_share_views()
returns integer
language sql
security definer
set search_path = ''
as $$
  with purged as (
    delete from public.shared_report_views where created_at < now() - interval '90 days' returning 1
  )
  select count(*)::integer from purged;
$$;

revoke all on function public.purge_old_share_views() from public, anon, authenticated;
