-- Retour de Cindy du 06/09 ("un bénévole peut faire partie de plusieurs
-- groupes, merci de créer des cases à cocher") : remplace la colonne
-- unique whatsapp_group_id (20261031200000) par une vraie relation
-- plusieurs-à-plusieurs, même principe que access_profile_briques.
create table public.benevole_whatsapp_groups (
  benevole_id uuid not null references public.benevoles(id) on delete cascade,
  whatsapp_group_id uuid not null references public.whatsapp_groups(id) on delete cascade,
  primary key (benevole_id, whatsapp_group_id)
);

-- Reprend ce qui a déjà été saisi via l'ancienne colonne, pour ne rien
-- perdre.
insert into public.benevole_whatsapp_groups (benevole_id, whatsapp_group_id)
select id, whatsapp_group_id from public.benevoles where whatsapp_group_id is not null;

alter table public.benevoles drop column whatsapp_group_id;

alter table public.benevole_whatsapp_groups enable row level security;

create policy "admin manage benevole whatsapp groups"
  on public.benevole_whatsapp_groups
  for all
  using (public.is_club_admin())
  with check (public.is_club_admin());

grant select, insert, update, delete on public.benevole_whatsapp_groups to authenticated;
