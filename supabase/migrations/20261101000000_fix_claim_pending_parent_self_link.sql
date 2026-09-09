-- claim_pending_parent_now() excluait déjà le cas où le "parent" retrouvé
-- par email est en réalité la même personne que la fiche joueur (jamais
-- vouloir qu'un compte devienne "parent de lui-même"), mais comparait les
-- prénoms/noms sans trim() -- un profil enregistré avec une espace en trop
-- ("Christian " au lieu de "Christian", vu ce soir sur plusieurs comptes :
-- Christian DEVILLERS, Basile LAMOURET, Bettina BOUYER) faisait donc échouer
-- la comparaison, laissait passer l'exclusion, et créait un vrai faux lien
-- parent_player en base. Conséquence concrète repérée le 09/09 : ce faux
-- lien faisait ensuite échouer le rattachement automatique du compte lors de
-- l'assignation d'un rôle de coach (member-detail-modal.tsx, "self-heal"),
-- qui écrivait alors dans team_pending_coaches au lieu de team_coaches --
-- Christian apparaissant deux fois comme coach U13F.
create or replace function public.claim_pending_parent_now()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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
      and trim(lower(pr.first_name)) = trim(lower(new.first_name))
      and trim(lower(pr.last_name)) = trim(lower(new.last_name))
    )
  on conflict do nothing;

  return new;
end;
$function$;
