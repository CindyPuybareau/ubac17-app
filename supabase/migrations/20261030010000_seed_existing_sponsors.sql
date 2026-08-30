-- Reprend les 6 sponsors déjà affichés sur le site public (tableau codé en
-- dur dans src/app/page.tsx, retiré au profit de la vue sponsor_display) —
-- logos déjà présents tels quels dans public/sponsors/, réutilisés sans
-- réupload. Contrat et date de renouvellement laissés vides : à compléter
-- par Cindy depuis l'onglet Sponsors. "where not exists" sur le nom : sûr
-- à recoller sans créer de doublon si déjà exécuté une fois.
insert into public.sponsors (name, logo_url, website_url)
select v.name, v.logo_url, v.website_url
from (values
  ('O2', '/sponsors/o2.png', 'https://www.o2.fr/demander-un-devis#/1-services'),
  ('L''Équipe by Steal', '/sponsors/lequipe-by-steal.jpg', 'https://www.planity.com/lequipe-by-steal-17340-chatelaillon-plage'),
  ('Opticéo', '/sponsors/opticeo.png', 'https://www.opticeo.fr/boutiques/la-rochelle'),
  ('Areas', '/sponsors/areas.jpg', 'https://www.areas.fr/agence-assurance/17088/m.damien-la-rochelle'),
  ('Burgeot Stores', '/sponsors/burgeot-stores.jpg', 'https://www.komilfo.fr/magasins/burgeot-stores-rochelle-17'),
  ('DIN', '/sponsors/din.png', 'https://www.d-i-n.fr/')
) as v(name, logo_url, website_url)
where not exists (
  select 1 from public.sponsors s where s.name = v.name
);
