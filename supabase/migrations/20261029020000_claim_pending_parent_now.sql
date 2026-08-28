-- Trouvé lors de l'audit du 28/08, même classe de bug que
-- claim_coach_invite_now (20260918000000) côté coachs : parent_player
-- n'était rempli qu'à l'inscription du parent (handle_new_user). Un
-- parent qui a DÉJÀ un compte (créé pour un premier enfant), pour qui le
-- Bureau inscrit ensuite un 2ᵉ enfant : rien ne relie jamais ce nouvel
-- enfant au compte existant, et aucun bouton dans l'appli ne permet de le
-- faire à la main. Conséquence : l'enfant n'apparaît simplement jamais
-- dans l'espace Famille de ce parent, sans erreur ni message.
--
-- Correctif du même ordre que pour les coachs : relier un parent à un
-- enfant est une relation plusieurs-à-plusieurs sans ambiguïté (un lien de
-- trop ne casse rien, contrairement à l'attribution d'un profile_id) —
-- l'automatique seul suffit ici, pas besoin d'un bouton de secours.

-- 1. Rattrapage : relie tout de suite les fiches déjà orphelines dont
--    l'email de contact correspond à un compte existant. Même garde-fou
--    que handle_new_user() (ne jamais relier une fiche à elle-même si son
--    propre nom correspond au compte trouvé).
insert into public.parent_player (parent_id, player_id)
select pr.id, p.id
from public.players p
join public.profiles pr
  on pr.email is not null
 and trim(lower(pr.email)) = trim(lower(p.pending_parent_email))
where p.pending_parent_email is not null
  and not (
    pr.first_name is not null
    and pr.last_name is not null
    and lower(pr.first_name) = lower(p.first_name)
    and lower(pr.last_name) = lower(p.last_name)
  )
on conflict do nothing;

-- 2. La règle, pour que ça ne se reproduise pas : une fiche Membre créée
--    (ou dont l'email de contact change) pour quelqu'un qui a DÉJÀ un
--    compte se relie immédiatement, au lieu d'attendre une inscription
--    qui n'aura jamais lieu.
create or replace function public.claim_pending_parent_now()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pending_parent_email is null then
    return new;
  end if;

  insert into public.parent_player (parent_id, player_id)
  select pr.id, new.id
  from public.profiles pr
  where pr.email is not null
    and trim(lower(pr.email)) = trim(lower(new.pending_parent_email))
    and not (
      pr.first_name is not null
      and pr.last_name is not null
      and lower(pr.first_name) = lower(new.first_name)
      and lower(pr.last_name) = lower(new.last_name)
    )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists claim_pending_parent_now on public.players;
create trigger claim_pending_parent_now
  after insert or update of pending_parent_email on public.players
  for each row execute function public.claim_pending_parent_now();
