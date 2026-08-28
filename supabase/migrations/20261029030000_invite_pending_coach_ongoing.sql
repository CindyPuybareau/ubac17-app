-- Trouvé lors de l'audit du 28/08 : 20260919000000_invites_from_pending_
-- coach_fiches.sql avait généré les invitations manquantes pour les
-- coachs déjà désignés sans compte (ex. Farid BAHRI) — mais en
-- rattrapage ponctuel, sans déclencheur. Le problème se reproduit à
-- chaque nouvelle désignation : quand le Bureau choisit comme coach
-- quelqu'un qui n'a pas encore de compte (member-detail-modal.tsx,
-- add-member-modal.tsx — la fiche part alors dans team_pending_coaches,
-- jamais dans team_coach_invites), rien ne le promeut le jour où il
-- s'inscrit. Il reste "en attente" indéfiniment, sans effectif ni droits,
-- sans aucun message d'erreur.

-- 1. Rattrapage : reprend exactement la requête du 19/09 pour couvrir ce
--    qui s'est accumulé depuis (idempotent grâce à on conflict).
insert into public.team_coach_invites (team_id, email)
select tpc.team_id, p.registration_email
from public.team_pending_coaches tpc
join public.players p on p.id = tpc.player_id
where p.registration_email is not null
  and trim(p.registration_email) <> ''
  -- Une famille partage une seule adresse : si deux fiches portent
  -- celle-ci, rien ne dit laquelle est le coach. On s'abstient plutôt que
  -- de donner des droits de coach au mauvais compte.
  and (
    select count(*) from public.players p2
    where p2.registration_email is not null
      and trim(lower(p2.registration_email)) = trim(lower(p.registration_email))
  ) = 1
on conflict (team_id, email) do nothing;

-- 2. La règle, pour que ça ne se reproduise pas : chaque nouvelle
--    désignation dans team_pending_coaches génère tout de suite
--    l'invitation par email correspondante, avec le même garde-fou.
create or replace function public.invite_pending_coach_now()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select p.registration_email into v_email
  from public.players p
  where p.id = new.player_id
    and p.registration_email is not null
    and trim(p.registration_email) <> ''
    and (
      select count(*) from public.players p2
      where p2.registration_email is not null
        and trim(lower(p2.registration_email)) = trim(lower(p.registration_email))
    ) = 1;

  if v_email is not null then
    insert into public.team_coach_invites (team_id, email)
    values (new.team_id, v_email)
    on conflict (team_id, email) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists invite_pending_coach_now on public.team_pending_coaches;
create trigger invite_pending_coach_now
  after insert on public.team_pending_coaches
  for each row execute function public.invite_pending_coach_now();
