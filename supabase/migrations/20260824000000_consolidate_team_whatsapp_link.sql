-- Cindy already typed several teams' invite links into the old
-- per-team quick editor (teams.whatsapp_group_link, in the Équipes tab)
-- before the centralized "Groupes WhatsApp" screen existed. Carry those
-- over into whatsapp_groups.invite_link (only where the new field is
-- still empty, so nothing already entered via the new screen gets
-- overwritten), then drop the now-redundant column — the app no longer
-- reads or writes it (see team-card.tsx, which pointed here instead).
update public.whatsapp_groups g
set invite_link = t.whatsapp_group_link
from public.teams t
where g.team_id = t.id
  and g.invite_link is null
  and t.whatsapp_group_link is not null;

alter table public.teams drop column if exists whatsapp_group_link;
