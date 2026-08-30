-- Retour de Cindy du 29/08 : pouvoir choisir l'ordre d'affichage des
-- sponsors (Bureau/Coach/Famille + site public), au lieu de l'ordre de
-- création — deux flèches "monter/descendre" côté Bureau (sponsors-
-- manager.tsx) échangent le sort_order de deux sponsors voisins.
alter table public.sponsors add column if not exists sort_order integer;

-- Rattrapage : donne un ordre de départ (celui de création) à tout sponsor
-- existant qui n'en a pas encore — sûr à recoller, ne touche jamais une
-- ligne qui a déjà un sort_order.
update public.sponsors s
set sort_order = t.rn
from (
  select id, row_number() over (order by created_at) as rn
  from public.sponsors
) t
where t.id = s.id and s.sort_order is null;

alter table public.sponsors alter column sort_order set default 0;
alter table public.sponsors alter column sort_order set not null;

-- sort_order ajouté à la vue publique : nécessaire pour que l'affichage
-- (sponsors-display.tsx, site public) puisse trier dans le même ordre que
-- l'onglet Bureau, jamais montré à l'écran (juste utilisé pour le tri).
create or replace view public.sponsor_display as
select id, name, logo_url, website_url, sort_order
from public.sponsors
where logo_url is not null;

grant select on public.sponsor_display to anon, authenticated;
