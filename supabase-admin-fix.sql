-- Lega World admin repair.
-- Run this in Supabase SQL Editor if /admin opens but coach approval stays pending.
-- It makes fredtom02@gmail.com a league admin and activates that coach row for Barnet FC.

insert into public.admins (user_id)
select id from auth.users
where lower(email) = lower('fredtom02@gmail.com')
on conflict (user_id) do nothing;

update public.coaches
set status = 'active',
    team = 'Barnet FC'
where lower(email) = lower('fredtom02@gmail.com');

select email, team, status
from public.coaches
where lower(email) = lower('fredtom02@gmail.com');
