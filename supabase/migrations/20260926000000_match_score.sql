-- Piste n°6 de l'audit parents/joueurs : afficher le score après un match.
--
-- Aller chercher les scores sur le site FFBB serait fragile (page pas
-- faite pour être lue par un programme, casse au moindre changement de
-- mise en page). Version simple et solide : le coach saisit le score à
-- la main juste après le match, en deux clics depuis la carte de
-- l'événement — ni plus ni moins fiable que n'importe quelle autre
-- donnée saisie à la main dans l'appli (présences, cotisations...).
--
-- Deux colonnes plutôt qu'une seule "score" texte libre : UBAC et
-- l'adversaire, jamais domicile/extérieur (déjà couvert par is_home,
-- qui ne dit rien de qui a gagné). Autorisé uniquement sur MATCH/FRIENDLY
-- (les seuls types avec un adversaire identifiable) — pas d'entrave
-- niveau base, la contrainte reste côté UI comme pour is_home.
alter table public.events
  add column if not exists team_score integer,
  add column if not exists opponent_score integer;

-- Écriture : mêmes droits que le reste de l'événement (coach de l'équipe
-- ou Bureau) — les policies "coach update own team events" et
-- "admin manage events" existent déjà et couvrent update sur toutes les
-- colonnes, aucune nouvelle policy nécessaire.
