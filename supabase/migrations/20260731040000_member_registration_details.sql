-- Full registration record on each player, matching the fields collected
-- by the club's official "Suivi des Inscriptions" enrollment form. Feeds
-- the new member detail modal (identity/contacts, parent/emergency
-- contacts, license/membership, medical + charter acknowledgements).
--
-- No RLS changes: "admin manage players" already covers full read/write
-- for the Bureau, and "select roster for own coached teams" already lets a
-- coach read every column (including these) for players on teams they
-- coach — RLS in Postgres is row-level, not column-level. Coaches have no
-- players UPDATE policy, so these stay read-only for them at the DB layer
-- regardless of what the UI shows.
alter table public.players
  add column if not exists sex text,
  add column if not exists registration_email text,
  add column if not exists registration_phone text,
  add column if not exists address text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists secondary_email text,
  add column if not exists mother_phone text,
  add column if not exists father_phone text,
  add column if not exists other_phones text,
  add column if not exists secondary_address text,
  add column if not exists license_type text,
  add column if not exists membership_type text,
  add column if not exists fbi_status text,
  add column if not exists medical_notes text,
  add column if not exists other_notes text,
  add column if not exists image_rights text,
  add column if not exists player_charter_accepted text,
  add column if not exists parent_charter_accepted text;
