-- Retour de Cindy du 20/11 (demande du comptable : "U9 Mixte" -> "U9X",
-- longueurs plus homogènes) : renommer une catégorie depuis Cotisations &
-- Licences > Tarifs par catégorie, à côté du tarif, pour que le nouveau
-- nom s'affiche partout. Une seule opération, tout ou rien (une fonction =
-- une transaction) : catégorie des équipes, nom des équipes (y compris
-- leurs déclinaisons numérotées : "U13M-1" -> "U13G-1"), tarif de la
-- catégorie (même montant) et catégorie inscrite sur les fiches joueurs.
-- Réservé au Bureau. Ne fait rien tant que personne ne l'appelle ; ne
-- supprime jamais rien (règle n°1), ne fait que renommer.

create or replace function public.rename_team_category(old_name text, new_name text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  old_trim text := btrim(old_name);
  new_trim text := btrim(new_name);
  teams_count int := 0;
  tariffs_count int := 0;
  players_count int := 0;
begin
  if not public.is_club_admin() then
    raise exception 'Réservé au Bureau.';
  end if;
  if old_trim is null or old_trim = '' or new_trim is null or new_trim = '' then
    raise exception 'Le nom ne peut pas être vide.';
  end if;
  if old_trim = new_trim then
    return json_build_object('teams', 0, 'tariffs', 0, 'players', 0);
  end if;
  -- Jamais fusionner deux catégories par erreur (la casse seule peut changer).
  if lower(old_trim) <> lower(new_trim) and (
    exists (select 1 from public.teams where lower(btrim(category)) = lower(new_trim))
    or exists (select 1 from public.category_tariffs where lower(btrim(category)) = lower(new_trim))
  ) then
    raise exception 'La catégorie « % » existe déjà.', new_trim;
  end if;

  -- Nom des équipes : le nom exact, ou le nom suivi d'un numéro de groupe
  -- ("U13M-1", "U13M 2", "U13M3") -- jamais un autre nom qui commencerait
  -- seulement pareil ("U13" ne touche pas "U13M").
  update public.teams
  set name = new_trim || substr(btrim(name), length(old_trim) + 1)
  where btrim(name) = old_trim
     or (left(btrim(name), length(old_trim)) = old_trim
         and substr(btrim(name), length(old_trim) + 1) ~ '^[[:space:]_-]*[0-9]+$');

  update public.teams set category = new_trim where btrim(category) = old_trim;
  get diagnostics teams_count = row_count;

  update public.category_tariffs set category = new_trim where btrim(category) = old_trim;
  get diagnostics tariffs_count = row_count;

  update public.players set category = new_trim where btrim(category) = old_trim;
  get diagnostics players_count = row_count;

  return json_build_object('teams', teams_count, 'tariffs', tariffs_count, 'players', players_count);
end;
$$;

revoke all on function public.rename_team_category(text, text) from public;
grant execute on function public.rename_team_category(text, text) to authenticated;
