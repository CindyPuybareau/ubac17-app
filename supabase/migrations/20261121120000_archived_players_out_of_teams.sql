-- Retour de Cindy du 18/11 (Alyssa LE MUEY, archivée et remboursée,
-- remise dans U13F par un import) : "elle doit se retirer automatiquement
-- une fois archivée, pour ne pas avoir à faire la manipulation deux fois".
--
-- Un membre archivé ne peut plus être remis dans une équipe, quel que soit
-- le chemin (import du suivi des inscriptions, affectation...) : l'ajout
-- est simplement ignoré. Le retrait des équipes au moment de l'archivage
-- reste fait par l'écran Membres (members-table.tsx, setArchived). Ajout
-- seul : aucune donnée existante modifiée.

create or replace function public.skip_archived_player_team_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.players where id = new.player_id and archived_at is not null) then
    return null;
  end if;
  return new;
end;
$$;

create trigger team_players_skip_archived
  before insert on public.team_players
  for each row execute function public.skip_archived_player_team_link();
