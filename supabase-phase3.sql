-- =====================================================================
-- Lega World — Phase 3: role login + transfer contracts.
--
-- Flow:
--   Buying coach requests player + fee + player email + seasons.
--   Selling coach accepts/rejects.
--   If accepted, a contract is sent to the player portal.
--   Player accepts/rejects.
--   On player acceptance, the player moves teams and transfer history logs it.
--
-- Safe to re-run.
-- =====================================================================

create table if not exists public.user_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  role       text not null default 'visitor',
  full_name  text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.player_contracts (
  id                  uuid primary key default gen_random_uuid(),
  transfer_request_id uuid references public.transfer_requests(id) on delete cascade,
  player              text not null,
  player_email        text not null,
  from_team           text,
  to_team             text,
  type                text default 'Permanent',
  fee                 numeric default 0,
  seasons_offered     int default 1,
  seasons_accepted    int,
  status              text not null default 'sent', -- sent | accepted | rejected
  created_at          timestamptz default now(),
  responded_at        timestamptz
);

alter table public.transfer_requests add column if not exists fee numeric default 0;
alter table public.transfer_requests add column if not exists player_email text;
alter table public.transfer_requests add column if not exists seasons_requested int default 1;
alter table public.transfer_requests add column if not exists seller_agreed_at timestamptz;
alter table public.transfer_requests add column if not exists contract_id uuid references public.player_contracts(id);

create or replace function public.current_user_email() returns text
  language sql security definer stable set search_path = public as $$
  select email from auth.users where id = auth.uid();
$$;

grant execute on function public.current_user_email() to authenticated;

alter table public.user_profiles enable row level security;
alter table public.player_contracts enable row level security;

drop policy if exists "profiles self read" on public.user_profiles;
create policy "profiles self read" on public.user_profiles
  for select to authenticated using (user_id = auth.uid() or is_admin());

drop policy if exists "profiles self insert" on public.user_profiles;
create policy "profiles self insert" on public.user_profiles
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "profiles self update" on public.user_profiles;
create policy "profiles self update" on public.user_profiles
  for update to authenticated using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid() or is_admin());

drop policy if exists "contracts player read" on public.player_contracts;
create policy "contracts player read" on public.player_contracts
  for select to authenticated using (is_admin() or lower(player_email) = lower(current_user_email()));

drop policy if exists "contracts admin all" on public.player_contracts;
create policy "contracts admin all" on public.player_contracts
  for all to authenticated using (is_admin()) with check (is_admin());

-- Coaches still see only transfer requests involving their team.
drop policy if exists "tr select" on public.transfer_requests;
create policy "tr select" on public.transfer_requests
  for select to authenticated
  using (is_admin() or from_team = current_coach_team() or to_team = current_coach_team());

create or replace function public.upsert_my_profile(p_role text, p_full_name text default null)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into user_profiles(user_id, email, role, full_name, updated_at)
  values (auth.uid(), current_user_email(), coalesce(nullif(p_role,''),'visitor'), p_full_name, now())
  on conflict (user_id) do update
    set role = excluded.role,
        full_name = excluded.full_name,
        email = excluded.email,
        updated_at = now();
end; $$;

grant execute on function public.upsert_my_profile(text, text) to authenticated;

create or replace function public.request_transfer_contract(
  p_player text,
  p_from text,
  p_to text,
  p_type text,
  p_fee numeric,
  p_player_email text,
  p_seasons int
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not (is_admin() or p_to = current_coach_team()) then
    raise exception 'You can only request players for your own team';
  end if;
  if p_player_email is null or length(trim(p_player_email)) < 5 then
    raise exception 'Player email is required so the contract can be sent';
  end if;
  insert into transfer_requests(status, player, from_team, to_team, type, requested_by, fee, player_email, seasons_requested)
  values (
    'requested',
    p_player,
    p_from,
    p_to,
    coalesce(nullif(p_type, ''), 'Permanent'),
    auth.uid(),
    coalesce(p_fee, 0),
    lower(trim(p_player_email)),
    greatest(coalesce(p_seasons, 1), 1)
  )
  returning id into v_id;
  return v_id;
end; $$;

grant execute on function public.request_transfer_contract(text, text, text, text, numeric, text, int) to authenticated;

-- Seller agreement no longer moves the player immediately. It creates a player contract.
create or replace function public.accept_transfer(p_request uuid)
  returns uuid language plpgsql security definer set search_path = public as $$
declare r public.transfer_requests%rowtype;
declare c_id uuid;
begin
  select * into r from transfer_requests where id = p_request;
  if not found then raise exception 'Request not found'; end if;
  if not (is_admin() or r.from_team = current_coach_team()) then
    raise exception 'Only the selling club (or the league office) can accept this transfer';
  end if;
  if r.status = 'seller_accepted' and r.contract_id is not null then
    return r.contract_id;
  end if;
  if r.status not in ('requested', 'pending') then
    raise exception 'This request is already %', r.status;
  end if;
  if r.player_email is null then
    raise exception 'This request has no player email. Ask the buying coach to resubmit through the coach portal.';
  end if;

  insert into player_contracts(transfer_request_id, player, player_email, from_team, to_team, type, fee, seasons_offered, status)
  values (r.id, r.player, lower(trim(r.player_email)), r.from_team, r.to_team, r.type, coalesce(r.fee,0), greatest(coalesce(r.seasons_requested,1),1), 'sent')
  returning id into c_id;

  update transfer_requests
  set status = 'seller_accepted',
      decided_by = auth.uid(),
      decided_at = now(),
      seller_agreed_at = now(),
      contract_id = c_id
  where id = p_request;

  return c_id;
end; $$;

grant execute on function public.accept_transfer(uuid) to authenticated;

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

grant execute on function public.reject_transfer(uuid) to authenticated;

create or replace function public.accept_player_contract(p_contract uuid, p_seasons int)
  returns void language plpgsql security definer set search_path = public as $$
declare c public.player_contracts%rowtype;
begin
  select * into c from player_contracts where id = p_contract;
  if not found then raise exception 'Contract not found'; end if;
  if not (is_admin() or lower(c.player_email) = lower(current_user_email())) then
    raise exception 'This contract is not assigned to this player account';
  end if;
  if c.status <> 'sent' then
    raise exception 'This contract is already %', c.status;
  end if;

  delete from team_players where team = c.from_team and name = c.player;
  if not exists (select 1 from team_players where team = c.to_team and name = c.player) then
    insert into team_players(team, name) values (c.to_team, c.player);
  end if;
  insert into transfers_log(player, from_team, to_team, type)
  values (c.player, c.from_team, c.to_team, c.type);

  update player_contracts
  set status = 'accepted',
      seasons_accepted = greatest(coalesce(p_seasons, c.seasons_offered), 1),
      responded_at = now()
  where id = p_contract;

  update transfer_requests
  set status = 'applied'
  where id = c.transfer_request_id;
end; $$;

create or replace function public.reject_player_contract(p_contract uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare c public.player_contracts%rowtype;
begin
  select * into c from player_contracts where id = p_contract;
  if not found then raise exception 'Contract not found'; end if;
  if not (is_admin() or lower(c.player_email) = lower(current_user_email())) then
    raise exception 'This contract is not assigned to this player account';
  end if;
  update player_contracts set status = 'rejected', responded_at = now() where id = p_contract;
  update transfer_requests set status = 'player_rejected' where id = c.transfer_request_id;
end; $$;

grant execute on function public.accept_player_contract(uuid, int) to authenticated;
grant execute on function public.reject_player_contract(uuid) to authenticated;
