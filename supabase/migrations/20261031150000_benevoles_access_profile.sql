-- Retour de Cindy du 05/09 ("profil et bénévoles doivent être fusionnés") :
-- un bénévole peut désormais recevoir le même profil d'accès sur-mesure
-- qu'un compte Bureau (voir 20261031130000_access_profiles.sql), pour voir
-- en plus de ses événements/besoins habituels les briques que le Bureau
-- choisit de lui ouvrir -- toujours en lecture seule (aucune capacité
-- d'écriture n'est donnée par cette colonne, voir /benevole/view). NULL =
-- comportement actuel inchangé (aucune brique supplémentaire).
alter table public.benevoles
  add column access_profile_id uuid references public.access_profiles(id) on delete set null;
