-- =====================================================================
-- Lega World — Supabase setup
-- Run this once in your Supabase project:  Dashboard -> SQL Editor ->
-- New query -> paste -> Run.
-- =====================================================================

-- One row per content section (key), holding its data as JSON.
create table if not exists public.site_content (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row Level Security: the public may READ; only signed-in admins may WRITE.
alter table public.site_content enable row level security;

drop policy if exists "site_content public read" on public.site_content;
create policy "site_content public read"
  on public.site_content for select
  using (true);

drop policy if exists "site_content admin write" on public.site_content;
create policy "site_content admin write"
  on public.site_content for all
  to authenticated
  using (true)
  with check (true);

-- =====================================================================
-- After running this:
--   1. Authentication -> Users -> "Add user" -> create your admin
--      (email + password). This is the login for /admin.
--      (Optional: Authentication -> Providers -> Email -> turn OFF
--       "Confirm email" so the admin can sign in immediately.)
--   2. Put your Project URL + anon key into config.js.
--   3. Open /admin, sign in, and click "Seed from defaults" once to
--      load the starting content into this table.
-- =====================================================================
