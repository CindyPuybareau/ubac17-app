-- Suivi de la dernière connexion, pour le tableau Membres (Bureau) :
-- indicateur "déjà connecté" + date au survol. Alimenté par un trigger sur
-- auth.users plutôt que par du code applicatif dans chaque écran de
-- connexion (mot de passe, lien magique, PWA...) : Supabase met déjà à
-- jour auth.users.last_sign_in_at à chaque authentification réussie, quel
-- que soit le chemin emprunté — un seul point de vérité, jamais oublié
-- dans un futur écran.

alter table public.profiles add column if not exists last_login_at timestamptz;

create or replace function public.sync_last_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at then
    update public.profiles
    set last_login_at = new.last_sign_in_at
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_login on auth.users;
create trigger on_auth_user_login
  after update on auth.users
  for each row
  execute function public.sync_last_login();

-- Rattrapage ponctuel : les comptes déjà connectés avant ce correctif
-- (dont le tien) ont un last_sign_in_at sur auth.users mais rien encore
-- sur profiles.last_login_at — sans ça, le tableau les afficherait comme
-- "jamais connecté" à tort.
update public.profiles p
set last_login_at = u.last_sign_in_at
from auth.users u
where u.id = p.id
  and u.last_sign_in_at is not null
  and p.last_login_at is null;
