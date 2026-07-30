-- Correction: puybareaucindy@gmail.com is not the Bureau — it's the parent
-- account for Léonie and Raphaël Lamouret. Undo the earlier whitelist
-- insert and link the account as a parent instead.

delete from public.club_administrators
where email = 'puybareaucindy@gmail.com';

insert into public.parent_player (parent_id, player_id)
select u.id, p.id
from auth.users u
cross join public.players p
where u.email ilike 'puybareaucindy@gmail.com'
  and (
    (p.first_name ilike 'Léonie' and p.last_name ilike 'Lamouret')
    or (p.first_name ilike 'Raphaël' and p.last_name ilike 'Lamouret')
  )
  and not exists (
    select 1 from public.parent_player pp
    where pp.parent_id = u.id and pp.player_id = p.id
  );
