-- Per-member WhatsApp history: gives the Bureau/Coach a single 360° view
-- of every WhatsApp exchange with a member, whether it was sent from
-- inside the app (auto-logged) or on the phone directly (logged by hand
-- afterwards) — see whatsapp_messages.source below.
create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  direction text not null check (direction in ('ENVOYE', 'RECU')),
  source text not null check (source in ('APP', 'MANUEL')),
  content text not null,
  sent_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_messages_player_id_sent_at_idx
  on public.whatsapp_messages (player_id, sent_at desc);

alter table public.whatsapp_messages enable row level security;

-- Mirrors the existing is_team_coach() helper: is the authenticated user a
-- coach of any team this specific player is on? Used below so a coach can
-- log/read WhatsApp history only for players they actually coach, same
-- scope as everywhere else a coach can act on a member (roster contact
-- button, RSVPs...).
create or replace function public.is_coach_of_player(check_player_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.team_players tp
    join public.team_coaches tc on tc.team_id = tp.team_id
    where tp.player_id = check_player_id and tc.coach_id = auth.uid()
  );
$$;

drop policy if exists "select whatsapp messages" on public.whatsapp_messages;
create policy "select whatsapp messages"
  on public.whatsapp_messages for select
  using (
    public.is_club_admin()
    or public.is_coach_of_player(player_id)
  );

drop policy if exists "insert whatsapp messages" on public.whatsapp_messages;
create policy "insert whatsapp messages"
  on public.whatsapp_messages for insert
  with check (
    public.is_club_admin()
    or public.is_coach_of_player(player_id)
  );

-- Only Bureau, or whoever personally logged a manual entry, can correct or
-- remove it afterwards (e.g. fixing a typo in a manually-entered message).
drop policy if exists "update own whatsapp messages" on public.whatsapp_messages;
create policy "update own whatsapp messages"
  on public.whatsapp_messages for update
  using (public.is_club_admin() or created_by = auth.uid())
  with check (public.is_club_admin() or created_by = auth.uid());

drop policy if exists "delete own whatsapp messages" on public.whatsapp_messages;
create policy "delete own whatsapp messages"
  on public.whatsapp_messages for delete
  using (public.is_club_admin() or created_by = auth.uid());

grant select, insert, update, delete on public.whatsapp_messages to authenticated;

-- 360°-sync: a message logged from one open session should show up live
-- in another, same as every other synced table.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'whatsapp_messages'
  ) then
    alter publication supabase_realtime add table public.whatsapp_messages;
  end if;
end $$;
