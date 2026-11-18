-- Retour de Cindy du 18/11 (page Cotisations, liste "À vérifier") : une
-- cotisation qui sort de l'ordinaire (offerte mais avec un montant réglé,
-- remise plus grande que le tarif) est signalée au Bureau, qui la corrige
-- à la main ou indique "C'est normal" -- cette date retient ce choix pour
-- que la ligne ne revienne pas dans la liste. Ajout seul, aucune donnée
-- existante modifiée (règle n°1).
alter table public.cotisations
  add column if not exists verifiee_le timestamptz;
