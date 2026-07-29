-- URL de la fiche équipe sur competitions.ffbb.com, pour la synchro directe
-- (en complément du lien iCal générique et de l'import Excel).
alter table public.teams
  add column if not exists ffbb_url text;

-- Test réel : équipe Seniors engagée en RM3 (Poule B).
update public.teams
set ffbb_url = 'https://competitions.ffbb.com/ligues/naq/comites/0017/clubs/naq0017005/equipes/200000005334333'
where category = 'Seniors G1 /RM3';
