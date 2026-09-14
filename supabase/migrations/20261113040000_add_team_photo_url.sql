-- Retour de Cindy du 13/09 ("photo d'équipe" dans le nouveau Tableau de
-- bord Coach/Famille) : simple URL publique (bucket Supabase Storage, même
-- principe que players.avatar_url) -- null tant qu'aucune photo n'a été
-- envoyée, repli sur le logo du club côté affichage.
alter table public.teams add column if not exists photo_url text;
