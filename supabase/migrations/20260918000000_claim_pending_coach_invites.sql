-- Une invitation de coach n'etait consommee qu'au moment de l'inscription.
--
-- handle_new_user() promeut team_coach_invites -> team_coaches quand un
-- compte se cree. Mais la liste des coachs 2026-2027 a ete chargee en base
-- APRES que plusieurs coachs se soient deja inscrits : pour eux,
-- l'invitation est arrivee dans une boite aux lettres que plus personne
-- n'ouvre. Le compte existe, l'equipe existe, l'invitation les relie — et
-- rien ne se passe.
--
-- Consequence visible : un coach reellement en poste n'apparait ni dans la
-- carte d'equipe des parents, ni dans la section Coachs de son equipe,
-- alors qu'il est bien dans le fichier du club.

-- 1. Rattrapage : on promeut toutes les invitations dont l'e-mail
--    correspond a un compte existant. Exactement ce que le trigger aurait
--    fait a l'inscription, ni plus ni moins. Aucun role n'est invente :
--    team_coach_invites vient du fichier "MAILS DES COACHS 2026-2027".
insert into public.team_coaches (team_id, coach_id)
select tci.team_id, pr.id
from public.team_coach_invites tci
join public.profiles pr
  on pr.email is not null
 and trim(lower(pr.email)) = trim(lower(tci.email))
on conflict (team_id, coach_id) do nothing;

-- 2. Le badge "en attente de compte" n'a plus lieu d'etre pour ceux qu'on
--    vient de promouvoir : leur fiche joueur pointe vers le compte
--    desormais coach de cette equipe.
delete from public.team_pending_coaches tpc
using public.players p, public.team_coaches tc
where p.id = tpc.player_id
  and p.profile_id is not null
  and tc.team_id = tpc.team_id
  and tc.coach_id = p.profile_id;

-- 3. La regle, pour que ca ne se reproduise pas : une invitation ajoutee
--    pour quelqu'un qui a DEJA un compte se reclame immediatement, au lieu
--    d'attendre une inscription qui n'aura jamais lieu.
create or replace function public.claim_coach_invite_now()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.team_coaches (team_id, coach_id)
  select new.team_id, pr.id
  from public.profiles pr
  where pr.email is not null
    and trim(lower(pr.email)) = trim(lower(new.email))
  on conflict (team_id, coach_id) do nothing;

  delete from public.team_pending_coaches tpc
  using public.players p, public.profiles pr
  where tpc.team_id = new.team_id
    and p.id = tpc.player_id
    and p.profile_id = pr.id
    and pr.email is not null
    and trim(lower(pr.email)) = trim(lower(new.email));

  return new;
end;
$$;

drop trigger if exists claim_coach_invite_now on public.team_coach_invites;
create trigger claim_coach_invite_now
  after insert on public.team_coach_invites
  for each row execute function public.claim_coach_invite_now();

-- 4. Second defaut, independant du premier : un parent n'a le droit de
--    lire AUCUNE fiche de coach.
--
--    Les policies de lecture sur profiles couvrent le Bureau et les coachs
--    entre eux, jamais les parents. La carte d'equipe de l'espace Parent
--    lit team_coaches -> profiles : la jointure est filtree par RLS, le
--    coach disparait sans erreur, et le bouton "Contacter le coach" ne peut
--    structurellement jamais s'afficher. Meme chose pour les coachs sans
--    compte, lus depuis players. Invisible pour toi puisque tu es au
--    Bureau et que la policy admin te laisse tout voir — c'est ce que
--    voient les autres parents.
--
--    Fonctions security definer, comme is_team_coach / is_club_admin :
--    elles interrogent team_coaches et team_players sans repasser par leurs
--    propres policies, ce qui evite la recursion RLS deja rencontree.
create or replace function public.coaches_my_child_team(target uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.team_coaches tc
    join public.team_players tp on tp.team_id = tc.team_id
    join public.parent_player pp on pp.player_id = tp.player_id
    where tc.coach_id = target
      and pp.parent_id = auth.uid()
  );
$$;

create or replace function public.is_pending_coach_of_my_child_team(target uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.team_pending_coaches tpc
    join public.team_players tp on tp.team_id = tpc.team_id
    join public.parent_player pp on pp.player_id = tp.player_id
    where tpc.player_id = target
      and pp.parent_id = auth.uid()
  );
$$;

grant execute on function public.coaches_my_child_team(uuid) to authenticated;
grant execute on function public.is_pending_coach_of_my_child_team(uuid) to authenticated;

drop policy if exists "parent select coach profiles of own child teams" on public.profiles;
create policy "parent select coach profiles of own child teams"
  on public.profiles for select
  using (public.coaches_my_child_team(profiles.id));

drop policy if exists "parent select pending coach fiches of own child teams" on public.players;
create policy "parent select pending coach fiches of own child teams"
  on public.players for select
  using (public.is_pending_coach_of_my_child_team(players.id));
