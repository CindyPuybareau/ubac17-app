-- Whitelist of Bureau (ADMIN) email addresses. Row Level Security is enabled
-- with no policies, so the anon/authenticated clients have zero direct access;
-- only the security-definer trigger below can read it.
create table if not exists public.club_administrators (
  email text primary key,
  role text not null default 'ADMIN',
  club_function text,
  created_at timestamptz not null default now()
);

alter table public.club_administrators enable row level security;

-- Test entries — replace/extend once the official Bureau list is provided.
insert into public.club_administrators (email, role, club_function) values
  ('admin@ubac17.fr', 'ADMIN', 'Président'),
  ('compta@ubac17.fr', 'ADMIN', 'Comptable'),
  ('secretaire@ubac17.fr', 'ADMIN', 'Secrétaire')
on conflict (email) do nothing;

-- Signup trigger: the ADMIN role and club_function can ONLY come from this
-- whitelist, matched on the user's verified auth email — never from
-- client-submitted signup data. Anything else falls back to the role chosen
-- in the public form (PARENT or COACH only).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_row public.club_administrators%rowtype;
  requested_role text;
begin
  select * into admin_row
  from public.club_administrators
  where email = new.email;

  if found then
    insert into public.profiles (id, first_name, last_name, phone, role, club_function)
    values (
      new.id,
      new.raw_user_meta_data ->> 'first_name',
      new.raw_user_meta_data ->> 'last_name',
      new.raw_user_meta_data ->> 'phone',
      admin_row.role,
      admin_row.club_function
    );
  else
    requested_role := new.raw_user_meta_data ->> 'role';

    insert into public.profiles (id, first_name, last_name, phone, role, club_function)
    values (
      new.id,
      new.raw_user_meta_data ->> 'first_name',
      new.raw_user_meta_data ->> 'last_name',
      new.raw_user_meta_data ->> 'phone',
      case when requested_role = 'COACH' then 'COACH' else 'PARENT' end,
      null
    );
  end if;

  return new;
end;
$$;
