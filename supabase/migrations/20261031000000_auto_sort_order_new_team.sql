-- Audit du 31/08 (Zone 3) : la création d'équipe depuis l'onglet Équipes du
-- Bureau (team-manager.tsx, handleCreateTeam) n'a jamais renseigné
-- sort_order. Or canonicalTeamRefs (page.tsx) filtre explicitement les
-- équipes sans sort_order — ce filtre alimente le sélecteur d'équipe de
-- Cotisations, Pénalités, Groupes WhatsApp, et le picker "Affecter à une
-- autre équipe" des fiches membres. Une équipe fraîchement créée restait
-- donc invisible dans tous ces écrans tant que personne ne fixait
-- sort_order à la main en base.
--
-- Corrigé au niveau base plutôt que dans le seul formulaire de création
-- (team-manager.tsx) : n'importe quel autre chemin d'insertion (import,
-- SQL manuel, un futur écran) profite de la même garantie sans avoir à s'en
-- souvenir. Ne touche jamais un sort_order déjà fourni.
create or replace function public.assign_team_sort_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sort_order is null then
    select coalesce(max(sort_order), 0) + 1 into new.sort_order from public.teams;
  end if;
  return new;
end;
$$;

drop trigger if exists assign_team_sort_order on public.teams;
create trigger assign_team_sort_order
  before insert on public.teams
  for each row execute function public.assign_team_sort_order();
