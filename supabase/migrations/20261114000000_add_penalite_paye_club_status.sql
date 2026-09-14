-- Retour de Cindy du 14/09 ("le bureau me demande d'ajouter... Payé par le
-- club, aussi remplacer Payé par Payé par le joueur") : distingue QUI a
-- réglé la pénalité -- le club (avance faite par le Bureau, pas
-- répercutée sur le joueur) ou le joueur lui-même. Les deux comptent
-- comme "payé" partout ailleurs (total restant à encaisser, lien
-- HelloAsso masqué, relance automatique arrêtée) : seul le libellé
-- affiché change.
alter table public.penalites
  drop constraint penalites_statut_check;

alter table public.penalites
  add constraint penalites_statut_check
  check (statut = any (array['EN_ATTENTE', 'PAYE', 'PAYE_CLUB']));
