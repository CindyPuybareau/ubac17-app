-- Décidé avec Cindy (audit "check up général") : les notes médicales et le
-- numéro de licence d'un joueur doivent rester réservés au Bureau, même
-- pour un coach qui a par ailleurs le droit de corriger la fiche de ses
-- propres joueurs (policy "coach update roster of own teams",
-- 20260909000000 — dont le commentaire d'origine signalait déjà ce trou,
-- jamais tranché jusqu'ici).
--
-- La RLS s'applique à la LIGNE, pas à la colonne : la policy existante ne
-- peut pas, à elle seule, autoriser un coach à modifier le téléphone d'un
-- joueur tout en lui refusant ses notes médicales sur la MÊME ligne. Un
-- trigger BEFORE UPDATE est le mécanisme standard pour ce genre de
-- restriction par colonne : il laisse passer l'écriture, mais réécrit
-- discrètement les deux colonnes protégées à leur valeur d'origine si
-- l'auteur n'est pas au Bureau — quel que soit le chemin par lequel
-- l'écriture arrive (l'interface actuelle, un futur écran, ou un appel
-- direct à l'API qui contournerait l'interface).
create or replace function public.protect_sensitive_player_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_club_admin() then
    new.medical_notes := old.medical_notes;
    new.license_number := old.license_number;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_sensitive_player_fields on public.players;
create trigger protect_sensitive_player_fields
  before update on public.players
  for each row execute function public.protect_sensitive_player_fields();
