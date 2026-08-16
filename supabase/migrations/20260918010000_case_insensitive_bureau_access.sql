-- is_club_admin() comparait l'email de club_administrators à celui du JWT
-- avec une égalité stricte (=), sensible à la casse. Rien n'empêchait
-- jusqu'ici qu'une fiche porte un email en casse mixte (ex. "Cindy@x.com"
-- saisi dans le tableau Membres) alors que la personne se connecte avec
-- "cindy@x.com" — deux emails identiques pour n'importe quel humain, mais
-- différents pour Postgres : l'accès Bureau échouerait silencieusement,
-- sans le moindre message d'erreur (juste "aucun espace n'est rattaché").
-- Avant d'annoncer la connexion à tout le Bureau, on ferme ce cas.

-- 1. Rattrapage : les emails déjà enregistrés passent en minuscules. Le
--    email est en clé primaire — la clause "not exists" évite une erreur
--    de contrainte unique si jamais deux variantes de casse coexistaient
--    déjà pour la même adresse (aucun cas connu, mais coûte rien à parer).
update public.club_administrators a
set email = lower(a.email)
where a.email <> lower(a.email)
  and not exists (
    select 1 from public.club_administrators b
    where b.email = lower(a.email)
  );

-- 2. La règle, pour que la casse ne compte plus jamais dans cette
--    vérification.
create or replace function public.is_club_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.club_administrators
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

-- 3. Même souci sur la policy RLS "select own admin whitelist row"
--    (20260729120000) : elle compare aussi email = auth.jwt() ->> 'email'
--    en casse stricte, indépendamment de is_club_admin() ci-dessus. C'est
--    elle que le dashboard interroge pour savoir en direct si la personne
--    connectée a accès Bureau.
drop policy if exists "select own admin whitelist row" on public.club_administrators;
create policy "select own admin whitelist row"
  on public.club_administrators for select
  using (lower(email) = lower(auth.jwt() ->> 'email'));
