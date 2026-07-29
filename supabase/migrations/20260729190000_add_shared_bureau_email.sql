insert into public.club_administrators (email, role, club_function) values
  ('ubac17.basket@gmail.com', 'ADMIN', null)
on conflict (email) do nothing;
