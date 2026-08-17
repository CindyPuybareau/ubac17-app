-- Décidé avec Cindy (audit "check up général") : un coach ne doit pouvoir
-- déplacer un de ses joueurs que vers une équipe de la MÊME famille — U13M
-- vers U13M-1/U13M-2, U18M vers U18M-1/U18M-2, Séniors M vers Séniors
-- M-1/M-2 — jamais vers une équipe sans rapport (ex. Séniors 2) juste
-- parce qu'elle existe dans le club.
--
-- La policy "coach transfer own player to another team" (20260904000000)
-- ne vérifiait que l'équipe D'ORIGINE du joueur (déjà coachée par lui) —
-- rien ne bornait l'équipe DE DESTINATION, avec la portée volontairement
-- large documentée à l'époque ("dépanner une autre catégorie"). Cindy a
-- tranché : ce n'est pas ce qu'elle veut, seule la même famille
-- d'équipes est autorisée.

-- 1. Même règle de regroupement que côté application (src/lib/teams.ts,
--    splitTeamName) : "U13M-1"/"U13M_1"/"U13M1" appartiennent tous au
--    groupe "U13M". Sans séparateur, un chiffre ne compte comme
--    déclinaison que s'il suit déjà une lettre ET que le préfixe contient
--    lui-même un chiffre (sinon "U13" se lirait comme la déclinaison "13"
--    d'un groupe "U", et U09/U11/U13 tomberaient dans la même famille).
create or replace function public.team_group(label text)
returns text
language sql
immutable
set search_path = public
as $$
  select upper(trim(
    case
      when label ~ '^(.*?)[\s_-]+\d+$' then substring(label from '^(.*?)[\s_-]+\d+$')
      when label ~ '^(.*[A-Za-zÀ-ÿ])\d+$'
           and substring(label from '^(.*[A-Za-zÀ-ÿ])\d+$') ~ '\d'
        then substring(label from '^(.*[A-Za-zÀ-ÿ])\d+$')
      else label
    end
  ));
$$;

-- 2. La policy resserrée : en plus de "le joueur est déjà sur une équipe
--    que je coache" (inchangé), il faut désormais que l'équipe cible
--    partage le même groupe qu'AU MOINS une des équipes que je coache.
drop policy if exists "coach transfer own player to another team" on public.team_players;
create policy "coach transfer own player to another team"
  on public.team_players for insert
  with check (
    public.player_on_coached_team(team_players.player_id)
    and exists (
      select 1
      from public.team_coaches tc
      join public.teams coached_team on coached_team.id = tc.team_id
      join public.teams target_team on target_team.id = team_players.team_id
      where tc.coach_id = auth.uid()
        and public.team_group(coalesce(coached_team.category, coached_team.name, ''))
          = public.team_group(coalesce(target_team.category, target_team.name, ''))
    )
  );
