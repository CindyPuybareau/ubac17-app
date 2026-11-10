-- Retour de Cindy du 11/11 ("on doit aussi avoir le telephone des sponsors
-- pour le joindre facilement") : contact_phone rejoint la vue publique
-- (nom + logo + lien + offre déjà exposés, voir 20261120110000) -- SEUL le
-- téléphone, jamais contact_name ni contact_email (coordonnées internes
-- Bureau, décision explicite de Cindy : uniquement le numéro).
create or replace view public.sponsor_display as
select id, name, logo_url, website_url, sort_order, offer_text, contact_phone
from public.sponsors
where logo_url is not null;

grant select on public.sponsor_display to anon, authenticated;
