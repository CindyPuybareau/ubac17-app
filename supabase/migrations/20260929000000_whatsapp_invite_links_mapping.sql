-- Mapping complet des liens d'invitation WhatsApp fournis par Cindy, pour
-- chaque équipe et chaque commission du club. La quasi-totalité des lignes
-- whatsapp_groups existent déjà (seed initial du 20260823, team_id déjà
-- rattaché par nom d'équipe) : simple UPDATE de invite_link. Deux équipes
-- récentes n'avaient encore aucun groupe créé (U9 Mixte, Séniors 2 —
-- absentes du seed initial) : INSERT dédié pour elles, protégé par
-- NOT EXISTS pour rester rejouable sans dupliquer si relancé.

-- Équipes jeunes & seniors : team_id déjà posé au seed, retrouvé ici par
-- nom canonique d'équipe (public.teams.name).
update public.whatsapp_groups g
set invite_link = v.invite_link
from (
  values
    ('U13M', 'https://chat.whatsapp.com/BWuqwR0VQuyDEeveAOZOub?s=cl&p=a&ilr=4'),
    ('U13M-1', 'https://chat.whatsapp.com/CmVRjOCWnAgFbQkOAaYM2I?s=cl&p=a&ilr=4'),
    ('U13M-2', 'https://chat.whatsapp.com/DYUDlcM4yBGE9CJR6ibipe?s=cl&p=a&ilr=4'),
    ('U13F', 'https://chat.whatsapp.com/Hw2yDre82y57IBSGpNwO9X?s=cl&p=a&ilr=4'),
    ('Babys', 'https://chat.whatsapp.com/EwRYeJYm4WYGioLEMo4vvZ?s=cl&p=a&ilr=4'),
    ('U11 Mixte', 'https://chat.whatsapp.com/LKLmoyr07xs6oxrbh7RsZr?s=cl&p=a&ilr=4'),
    ('U15M', 'https://chat.whatsapp.com/CihgyPMTqjO5XlmCfZERQz?s=cl&p=a&ilr=4'),
    ('U18M-1', 'https://chat.whatsapp.com/EiLGuYwqKt947jJ3QkMhwy?s=cl&p=a&ilr=4'),
    ('U18M-2', 'https://chat.whatsapp.com/J31tvXPL1z2BxMxvc7cXA5?s=cl&p=a&ilr=4'),
    ('Séniors 1', 'https://chat.whatsapp.com/KywRwh5IVSW8UnEWeh6Jjc?s=cl&p=a&ilr=4'),
    ('Loisirs Mixtes', 'https://chat.whatsapp.com/IJKUXyIqVLOG3iRpDXkPq4?s=cl&p=a&ilr=4'),
    ('Loisirs F', 'https://chat.whatsapp.com/CPWzQTK1NbA9mwsDZTAIKr?s=cl&p=a&ilr=4')
) as v(team_name, invite_link)
join public.teams t on t.name = v.team_name
where g.team_id = t.id
  and g.category = 'EQUIPE';

-- U9 Mixte n'avait encore aucun groupe (absente du seed initial).
insert into public.whatsapp_groups (name, category, team_id, invite_link, sort_order)
select
  'U9 Mixte UBAC 2026/27',
  'EQUIPE',
  t.id,
  'https://chat.whatsapp.com/IYXHr9K8vjO1A124AkD7R5?s=cl&p=a&ilr=4',
  45
from public.teams t
where t.name = 'U9 Mixte'
  and not exists (select 1 from public.whatsapp_groups g where g.team_id = t.id);

-- Séniors 2 n'avait encore aucun groupe (absente du seed initial).
insert into public.whatsapp_groups (name, category, team_id, invite_link, sort_order)
select
  'Séniors M2 UBAC 2026/27',
  'EQUIPE',
  t.id,
  'https://chat.whatsapp.com/LxzmPBMJkJ4Kue89zofUM0?s=cl&p=a&ilr=4',
  95
from public.teams t
where t.name = 'Séniors 2'
  and not exists (select 1 from public.whatsapp_groups g where g.team_id = t.id);

-- Commissions & cadres : retrouvées par nom exact posé au seed initial
-- (category = 'COMMISSION', pas de team_id).
update public.whatsapp_groups g
set invite_link = v.invite_link
from (
  values
    ('Coachs UBAC', 'https://chat.whatsapp.com/GcglAnvGwgOEbm26EAYft4?s=cl&p=a&ilr=4'),
    ('Bureau', 'https://chat.whatsapp.com/LW89DVctGXDLocHlNefK1j?s=cl&p=a&ilr=4'),
    ('Comité directeur 2026/27', 'https://chat.whatsapp.com/KYU10QPariXLvmtjShMab3?s=cl&p=a&ilr=4'),
    ('Team communication', 'https://chat.whatsapp.com/Bu6i9XW12EYLZ5qAn2VPW5?s=cl&p=a&ilr=4'),
    ('Salariés', 'https://chat.whatsapp.com/Ed8PJ2HKY6JJehzyxNM0W0?s=cl&p=a&ilr=4'),
    ('Animations et événements', 'https://chat.whatsapp.com/EwhIP4rGIkj7lm9tetPju8?s=cl&p=a&ilr=4'),
    ('Buvette', 'https://chat.whatsapp.com/EGOuUJ2PF4gK5pTwpbEGMv?s=cl&p=a&ilr=4'),
    ('Calendrier et dates à retenir', 'https://chat.whatsapp.com/BS9tIL3XZ0836NZJtBJaPt?s=cl&p=a&ilr=4'),
    ('Commission sponsors', 'https://chat.whatsapp.com/J3yqsW4Zcr3JNnIG7zCvXD?s=cl&p=a&ilr=4')
) as v(group_name, invite_link)
where g.name = v.group_name
  and g.category = 'COMMISSION';
