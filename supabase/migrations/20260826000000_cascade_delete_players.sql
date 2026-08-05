-- Support the Bureau's new "Supprimer définitivement" action on already
-- archived members (members-table.tsx / add-member-modal siblings):
-- `delete from players` must not be blocked by a foreign-key violation
-- in tables that genuinely own rows keyed to that player.
--
-- Every table created inside this migrations folder that references
-- players(id) already declares "on delete cascade" (cotisations,
-- event_tasks, event_carpool_offers, team_pending_coaches,
-- whatsapp_group_members, whatsapp_messages) — nothing to do there.
-- teams.pending_coach_player_id is intentionally "on delete set null"
-- (deleting a player shouldn't delete the whole team) and must stay
-- that way, so it's deliberately left out of this pass.
--
-- team_players, parent_player and rsvps predate this migrations folder
-- (created directly in the Supabase dashboard before migration tracking
-- started), so their original ON DELETE action is unmanaged/unknown here.
-- Force it explicitly to CASCADE rather than assume, for exactly these
-- three (table, column) pairs — never touched blindly/dynamically.
do $$
declare
  target record;
  fk record;
begin
  for target in
    select * from (values
      ('public.team_players', 'player_id'),
      ('public.parent_player', 'player_id'),
      ('public.rsvps', 'player_id')
    ) as t(table_name, column_name)
  loop
    if to_regclass(target.table_name) is null then
      continue;
    end if;

    for fk in
      select con.conname
      from pg_constraint con
      join pg_attribute att
        on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
      where con.contype = 'f'
        and con.conrelid = target.table_name::regclass
        and con.confrelid = 'public.players'::regclass
        and att.attname = target.column_name
        and con.confdeltype <> 'c'
    loop
      execute format(
        'alter table %s drop constraint %I, add constraint %I foreign key (%I) references public.players(id) on delete cascade',
        target.table_name, fk.conname, fk.conname, target.column_name
      );
    end loop;
  end loop;
end $$;
