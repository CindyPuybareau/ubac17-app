-- Root cause du "Aucun groupe WhatsApp associé à ta famille" vu par
-- absolument toutes les familles (Raphaël inclus, malgré la migration de
-- la veille qui a bien rempli invite_link pour son équipe) : la policy
-- SELECT sur whatsapp_groups (20260823) n'accorde la lecture à un parent
-- QUE via whatsapp_group_members — une liste de membres à part, curée à
-- la main, jamais alimentée nulle part dans l'app pour les groupes
-- d'équipe. Résultat : is_whatsapp_group_member() renvoie toujours faux,
-- et sans ligne dans whatsapp_group_members, la ligne whatsapp_groups
-- elle-même reste invisible pour un parent/joueur — quel que soit le
-- contenu de invite_link.
--
-- Pour un groupe de catégorie EQUIPE, la bonne source de vérité est
-- l'effectif réel de l'équipe (team_players), pas une liste séparée à
-- entretenir en double : si l'enfant joue dans cette équipe, sa famille
-- doit voir le groupe. is_my_child_team() et is_own_player_team() sont
-- déjà écrites pour exactement cette relation (roster complet, coachs...)
-- — réutilisées ici plutôt que réécrites. whatsapp_group_members garde
-- son rôle tel quel pour les groupes COMMISSION (Buvette, Bureau...), où
-- l'appartenance ne correspond à aucune table de roster existante.
drop policy if exists "select whatsapp groups" on public.whatsapp_groups;
create policy "select whatsapp groups"
  on public.whatsapp_groups for select
  using (
    public.is_club_admin()
    or public.is_whatsapp_group_team_coach(id)
    or public.is_whatsapp_group_member(id)
    or (
      category = 'EQUIPE'
      and team_id is not null
      and (public.is_my_child_team(team_id) or public.is_own_player_team(team_id))
    )
  );
