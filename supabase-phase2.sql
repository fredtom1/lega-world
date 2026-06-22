-- =====================================================================
-- Lega World — Phase 2: roles (admin / coach), per-team squads, and a
-- secure transfer handshake (buying coach requests -> selling coach
-- accepts -> player moves; league office can override).
--
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- ⚠️ FIRST: replace 'YOUR_ADMIN_EMAIL@example.com' below with the email
--    you log into /admin with. (Safe to re-run.)
-- Also: Authentication -> Providers -> Email -> make sure "Enable sign
--    ups" is ON (default). Turning OFF "Confirm email" lets coaches sign
--    in immediately.
-- =====================================================================

-- ---------- 1. tables ----------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists public.coaches (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  team       text,
  status     text not null default 'pending',     -- pending | active | rejected
  created_at timestamptz default now()
);

create table if not exists public.team_players (
  id         uuid primary key default gen_random_uuid(),
  team       text not null,
  name       text not null,
  position   text,
  created_at timestamptz default now()
);
create index if not exists team_players_team_idx on public.team_players(team);

create table if not exists public.transfers_log (
  id         uuid primary key default gen_random_uuid(),
  player     text, from_team text, to_team text, type text,
  created_at timestamptz default now()
);

alter table public.transfer_requests add column if not exists requested_by uuid;
alter table public.transfer_requests add column if not exists decided_by   uuid;
alter table public.transfer_requests add column if not exists decided_at   timestamptz;

-- ---------- 2. helper functions (SECURITY DEFINER, used inside RLS) ----------
create or replace function public.is_admin() returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.current_coach_team() returns text
  language sql security definer stable set search_path = public as $$
  select team from public.coaches
  where user_id = auth.uid() and status = 'active' limit 1;
$$;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.current_coach_team() to anon, authenticated;

-- ---------- 3. RLS ----------
alter table public.admins        enable row level security;
alter table public.coaches       enable row level security;
alter table public.team_players  enable row level security;
alter table public.transfers_log enable row level security;

-- admins: a user may check their own admin row; admins see all
drop policy if exists "admins self" on public.admins;
create policy "admins self" on public.admins
  for select to authenticated using (user_id = auth.uid() or is_admin());

-- coaches: read own row (or admin); insert own pending row; admin manages
drop policy if exists "coaches read" on public.coaches;
create policy "coaches read" on public.coaches
  for select to authenticated using (user_id = auth.uid() or is_admin());
drop policy if exists "coaches self insert" on public.coaches;
create policy "coaches self insert" on public.coaches
  for insert to authenticated with check (user_id = auth.uid() and status = 'pending');
drop policy if exists "coaches admin update" on public.coaches;
create policy "coaches admin update" on public.coaches
  for update to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "coaches admin delete" on public.coaches;
create policy "coaches admin delete" on public.coaches
  for delete to authenticated using (is_admin());

-- team_players: anyone reads; a coach edits ONLY their team; admin edits all
drop policy if exists "team_players read" on public.team_players;
create policy "team_players read" on public.team_players for select using (true);
drop policy if exists "team_players coach insert" on public.team_players;
create policy "team_players coach insert" on public.team_players
  for insert to authenticated with check (team = current_coach_team() or is_admin());
drop policy if exists "team_players coach update" on public.team_players;
create policy "team_players coach update" on public.team_players
  for update to authenticated using (team = current_coach_team() or is_admin())
  with check (team = current_coach_team() or is_admin());
drop policy if exists "team_players coach delete" on public.team_players;
create policy "team_players coach delete" on public.team_players
  for delete to authenticated using (team = current_coach_team() or is_admin());

-- transfers_log: public read; writes happen only inside the RPCs below
drop policy if exists "transfers_log read" on public.transfers_log;
create policy "transfers_log read" on public.transfers_log for select using (true);

-- transfer_requests: tighten Phase-1 policies for the handshake
drop policy if exists "transfers insert"       on public.transfer_requests;
drop policy if exists "transfers admin select"  on public.transfer_requests;
drop policy if exists "transfers admin update"  on public.transfer_requests;
drop policy if exists "transfers admin delete"  on public.transfer_requests;
create policy "tr insert" on public.transfer_requests
  for insert to anon, authenticated with check (true);
create policy "tr select" on public.transfer_requests
  for select to authenticated
  using (is_admin() or from_team = current_coach_team() or to_team = current_coach_team());
create policy "tr admin update" on public.transfer_requests
  for update to authenticated using (is_admin()) with check (is_admin());
create policy "tr admin delete" on public.transfer_requests
  for delete to authenticated using (is_admin());

-- ---------- 3b. tighten Phase-1 policies (coaches now have accounts) ----------
-- site_content: only the league office may edit (was: any signed-in user)
drop policy if exists "site_content admin write" on public.site_content;
create policy "site_content admin write" on public.site_content
  for all to authenticated using (is_admin()) with check (is_admin());

-- registrations: only the admin may read / change them
drop policy if exists "registrations admin select" on public.registrations;
create policy "registrations admin select" on public.registrations for select to authenticated using (is_admin());
drop policy if exists "registrations admin update" on public.registrations;
create policy "registrations admin update" on public.registrations for update to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "registrations admin delete" on public.registrations;
create policy "registrations admin delete" on public.registrations for delete to authenticated using (is_admin());

-- media (news photos): only the admin uploads/changes
drop policy if exists "media admin insert" on storage.objects;
create policy "media admin insert" on storage.objects for insert to authenticated with check (bucket_id = 'media' and is_admin());
drop policy if exists "media admin update" on storage.objects;
create policy "media admin update" on storage.objects for update to authenticated using (bucket_id = 'media' and is_admin());
drop policy if exists "media admin delete" on storage.objects;
create policy "media admin delete" on storage.objects for delete to authenticated using (bucket_id = 'media' and is_admin());

-- ---------- 4. transfer handshake RPCs ----------
create or replace function public.request_transfer(p_player text, p_from text, p_to text, p_type text)
  returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not (is_admin() or p_to = current_coach_team()) then
    raise exception 'You can only request players for your own team';
  end if;
  insert into transfer_requests(status, player, from_team, to_team, type, requested_by)
  values ('requested', p_player, p_from, p_to, coalesce(nullif(p_type, ''), 'Permanent'), auth.uid())
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.accept_transfer(p_request uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare r public.transfer_requests%rowtype;
begin
  select * into r from transfer_requests where id = p_request;
  if not found then raise exception 'Request not found'; end if;
  if not (is_admin() or r.from_team = current_coach_team()) then
    raise exception 'Only the selling club (or the league office) can accept this transfer';
  end if;
  if r.status not in ('requested', 'pending', 'accepted') then
    raise exception 'This request is already %', r.status;
  end if;
  delete from team_players where team = r.from_team and name = r.player;
  if not exists (select 1 from team_players where team = r.to_team and name = r.player) then
    insert into team_players(team, name) values (r.to_team, r.player);
  end if;
  insert into transfers_log(player, from_team, to_team, type)
  values (r.player, r.from_team, r.to_team, r.type);
  update transfer_requests
  set status = 'applied', decided_by = auth.uid(), decided_at = now()
  where id = p_request;
end; $$;

create or replace function public.reject_transfer(p_request uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare r public.transfer_requests%rowtype;
begin
  select * into r from transfer_requests where id = p_request;
  if not found then raise exception 'Request not found'; end if;
  if not (is_admin() or r.from_team = current_coach_team()) then
    raise exception 'Only the selling club (or the league office) can reject this transfer';
  end if;
  update transfer_requests
  set status = 'rejected', decided_by = auth.uid(), decided_at = now()
  where id = p_request;
end; $$;

grant execute on function public.request_transfer(text, text, text, text) to authenticated;
grant execute on function public.accept_transfer(uuid) to authenticated;
grant execute on function public.reject_transfer(uuid) to authenticated;

-- ---------- 5. seed the league-office admin (EDIT THE EMAIL) ----------
insert into public.admins (user_id)
select id from auth.users where email = 'YOUR_ADMIN_EMAIL@example.com'
on conflict (user_id) do nothing;

-- =====================================================================
-- After running: open /admin -> "Coaches" tab -> "Import squads" once to
-- copy your current squads into team_players. Coaches can then sign up at
-- /coach; approve them under "Coaches".
-- =====================================================================
