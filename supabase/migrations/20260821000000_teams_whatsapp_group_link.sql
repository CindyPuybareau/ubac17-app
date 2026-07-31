-- Optional real WhatsApp group invite link for a team, so "Contacter
-- l'équipe" can open the actual group instead of falling back to a list
-- of individual wa.me links. Editable by the Bureau (existing "admin
-- manage teams" policy) and the team's own coach (existing "coach update
-- own teams" policy) — both already grant full-row UPDATE, so no new RLS
-- is needed for this column.
alter table public.teams
  add column if not exists whatsapp_group_link text;
