-- Bug signalé (10/09) : "Créer le lien d'accès enfant" appelait
-- regenerate_family_access_code(), qui écrase TOUJOURS le code existant
-- par un nouveau (gen_random_uuid() inconditionnel, voir
-- 20261008000000_child_pin_access.sql) -- un clic sur ce bouton, quelle
-- qu'en soit la raison (parent qui ne retrouve pas facilement son lien
-- déjà créé, double-clic, nouvel appel accidentel...), invalide donc
-- silencieusement le lien déjà transmis à l'enfant.
--
-- Nouvelle fonction idempotente : renvoie le code déjà en place s'il y en
-- a un, n'en génère un nouveau que s'il n'existe pas encore. Devient la
-- fonction appelée par le bouton par défaut (voir child-access-manager.tsx).
-- regenerate_family_access_code() reste inchangée -- elle devient la
-- fonction d'une VRAIE régénération volontaire, désormais séparée dans
-- l'UI derrière une confirmation explicite plutôt que confondue avec la
-- création initiale.
create or replace function public.get_or_create_family_access_code()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_code uuid;
begin
  select family_access_code into v_existing from public.profiles where id = auth.uid();
  if v_existing is not null then
    return v_existing;
  end if;

  v_code := gen_random_uuid();
  update public.profiles set family_access_code = v_code where id = auth.uid();
  return v_code;
end;
$$;

grant execute on function public.get_or_create_family_access_code() to authenticated;
