insert into public.club_administrators (email, role, club_function) values
  ('puybareaucindy@gmail.com', 'ADMIN', null)
on conflict (email) do nothing;
