-- Retour de Cindy du 06/09 ("pouvoir sélectionner, lors de la création
-- d'un bénévole, quel groupe whatsapp lui sera attribué") : un bénévole
-- peut être rattaché à l'un des groupes WhatsApp "Commissions &
-- Administration" (jamais un groupe d'équipe, qui n'a pas de sens pour
-- lui) -- simple attribution informative, comme access_profile_id, pas de
-- lien avec whatsapp_group_members (réservé aux joueurs).
alter table public.benevoles
  add column whatsapp_group_id uuid references public.whatsapp_groups(id) on delete set null;
