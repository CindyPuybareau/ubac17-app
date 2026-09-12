-- Retour de Cindy du 12/09 ("ce que j'apporte (optionnel) à supprimer
-- partout pas d'intérêt") : la fonctionnalité est retirée du code (champ de
-- saisie, affichage sur les cartes de présence) -- cette colonne, qui ne
-- servait qu'à ça, n'a plus aucun lecteur ni écrivain. Suppression demandée
-- explicitement par Cindy (informée que les notes déjà saisies seraient
-- perdues définitivement).
alter table public.rsvps
  drop column if exists contribution_note;
