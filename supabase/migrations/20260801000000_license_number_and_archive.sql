-- Support for upsert-on-import (match by license number or name+birth date
-- instead of always inserting a new row) and for archiving instead of
-- hard-deleting a member from the Bureau's Membres table.
alter table public.players
  add column if not exists license_number text,
  add column if not exists archived_at timestamptz;

create index if not exists players_archived_at_idx on public.players (archived_at);
