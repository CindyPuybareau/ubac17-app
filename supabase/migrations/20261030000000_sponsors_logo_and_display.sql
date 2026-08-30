-- Retour de Cindy du 29/08 : unifie les sponsors du site public (jusqu'ici
-- un tableau codé en dur dans src/app/page.tsx, complètement déconnecté de
-- la table sponsors du Bureau) avec le suivi interne — logo, lien du site
-- et contrat ajoutés, affichage repris dans tous les espaces (sauf Enfant)
-- et sur le site public.
alter table public.sponsors
  add column if not exists logo_url text,
  add column if not exists website_url text,
  -- 4 formules fixes uniquement (retour de Cindy) : jamais un montant/durée
  -- libres, pour rester cohérent avec ce qui est réellement proposé.
  add column if not exists contract_type text
    check (contract_type in ('500_1AN', '500_2ANS', '1000_1AN', '1000_2ANS'));

-- Vue publique : nom + logo + lien uniquement, jamais le contrat ni les
-- coordonnées de contact — même principe que family_teammate_roster
-- (20261029000000) pour ne jamais exposer plus large que nécessaire via une
-- policy RLS trop permissive. Un sponsor sans logo n'apparaît pas ici (rien
-- à afficher tant que le Bureau n'a pas fini de le compléter), mais reste
-- géré normalement côté Bureau (table sponsors, RLS inchangée : Bureau
-- uniquement).
create or replace view public.sponsor_display as
select id, name, logo_url, website_url
from public.sponsors
where logo_url is not null;

-- anon en plus d'authenticated : le site public (page d'accueil, avant
-- connexion) lit désormais cette même vue au lieu de son tableau codé en
-- dur, un seul endroit à tenir à jour pour tout le monde.
grant select on public.sponsor_display to anon, authenticated;

-- Bucket public en lecture (logos affichés dans tous les espaces et sur le
-- site public) — écriture réservée au Bureau, même principe que le bucket
-- avatars (20261026000000) mais sans dossier par utilisateur : un seul
-- Bureau gère tous les logos, pas de notion de "propriétaire" du fichier.
insert into storage.buckets (id, name, public)
values ('sponsor-logos', 'sponsor-logos', true)
on conflict (id) do nothing;

update storage.buckets
set
  file_size_limit = 5242880,
  allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png', 'image/gif']
where id = 'sponsor-logos';

create policy "admin manage sponsor logos"
  on storage.objects for all
  using (bucket_id = 'sponsor-logos' and public.is_club_admin())
  with check (bucket_id = 'sponsor-logos' and public.is_club_admin());

create policy "public read sponsor logos"
  on storage.objects for select
  using (bucket_id = 'sponsor-logos');
