-- =====================================================================
-- Lega World — Phase 1 add-on
-- Public submissions (team registrations + transfer requests) and a
-- storage bucket for news photos.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- (Safe to re-run.)
-- =====================================================================

-- ---------- Team registrations (submitted from the public site) ----------
create table if not exists public.registrations (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  status      text not null default 'pending',   -- pending | approved | rejected
  team        text,
  manager     text,
  state       text,
  email       text,
  colours     text,
  comp        text,
  squad       text,
  players     jsonb not null default '[]'::jsonb, -- ["Name", ...]
  note        text
);
alter table public.registrations enable row level security;

drop policy if exists "registrations insert" on public.registrations;
create policy "registrations insert" on public.registrations
  for insert to anon, authenticated with check (true);
drop policy if exists "registrations admin select" on public.registrations;
create policy "registrations admin select" on public.registrations
  for select to authenticated using (true);
drop policy if exists "registrations admin update" on public.registrations;
create policy "registrations admin update" on public.registrations
  for update to authenticated using (true) with check (true);
drop policy if exists "registrations admin delete" on public.registrations;
create policy "registrations admin delete" on public.registrations
  for delete to authenticated using (true);

-- ---------- Transfer requests (submitted from the public site) ----------
create table if not exists public.transfer_requests (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  status      text not null default 'pending',   -- pending | approved | rejected
  player      text,
  from_team   text,
  to_team     text,
  type        text,                               -- Permanent | Loan | Free
  window_date text,
  note        text
);
alter table public.transfer_requests enable row level security;

drop policy if exists "transfers insert" on public.transfer_requests;
create policy "transfers insert" on public.transfer_requests
  for insert to anon, authenticated with check (true);
drop policy if exists "transfers admin select" on public.transfer_requests;
create policy "transfers admin select" on public.transfer_requests
  for select to authenticated using (true);
drop policy if exists "transfers admin update" on public.transfer_requests;
create policy "transfers admin update" on public.transfer_requests
  for update to authenticated using (true) with check (true);
drop policy if exists "transfers admin delete" on public.transfer_requests;
create policy "transfers admin delete" on public.transfer_requests
  for delete to authenticated using (true);

-- ---------- Storage bucket for news photos ----------
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

drop policy if exists "media public read" on storage.objects;
create policy "media public read" on storage.objects
  for select using (bucket_id = 'media');
drop policy if exists "media admin insert" on storage.objects;
create policy "media admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'media');
drop policy if exists "media admin update" on storage.objects;
create policy "media admin update" on storage.objects
  for update to authenticated using (bucket_id = 'media');
drop policy if exists "media admin delete" on storage.objects;
create policy "media admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'media');
