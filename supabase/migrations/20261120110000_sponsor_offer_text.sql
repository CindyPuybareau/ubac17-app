-- Retour de Cindy du 10/11 ("Exclu sponsor") : champ libre pour l'offre/
-- remise membre que chaque sponsor propose déjà (ex. "10€ offerts dès 50€
-- d'achat"), saisi par le Bureau sur la fiche sponsor existante. Purement
-- optionnel : un sponsor sans offre renseignée reste visible partout (nom +
-- logo), seule la ligne d'offre ne s'affiche pas -- jamais de filtrage sur
-- ce champ, ni ici ni côté affichage (sponsors-manager.tsx / exclu-sponsor-
-- card.tsx).
alter table public.sponsors
  add column if not exists offer_text text;

-- Vue publique mise à jour pour inclure offer_text, colonnes existantes
-- inchangées (voir 20261030020000_sponsors_sort_order.sql) -- toujours "un
-- sponsor sans logo n'apparaît pas ici", ce filtre est inchangé et distinct
-- de offer_text (un sponsor SANS offre reste affiché, seule l'absence de
-- LOGO le masque, règle déjà actée).
create or replace view public.sponsor_display as
select id, name, logo_url, website_url, sort_order, offer_text
from public.sponsors
where logo_url is not null;

grant select on public.sponsor_display to anon, authenticated;
