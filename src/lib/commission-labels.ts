// Extrait de whatsapp-groups-manager.tsx (retour de Cindy du 10/09, "Accès
// Commissions & Administration") : les noms réels des groupes en base
// portent le millésime ("Comité directeur 2026/27"), pas pensés pour tenir
// sur une carte épurée ni pour un message d'accueil ("Bonjour l'équipe
// Comité directeur 2026/27" sonnerait mal). Même liste, même ordre,
// réutilisée par commissions-manager.tsx et /commission/[token] — une
// seule source plutôt que deux copies qui pourraient diverger.
// hideFromCommissionAccess (retour de Cindy du 24/09, "dans accès
// commissions et administration supprimer Bureau/Coachs/Salariés, ils ont
// déjà leur espace") : ces 3 groupes restent des groupes WhatsApp normaux
// (whatsapp-groups-manager.tsx, inchangé) -- seul le lien public "accès en
// lecture seule" (commissions-manager.tsx, /commission/[token]) n'a pas de
// sens pour eux, chaque membre de ces 3 groupes ayant déjà son propre
// compte (Bureau/Coach) ou un accès individuel (Salariés, déjà couvert par
// "Ajouter un accès individuel"). "Comité directeur"/"Team communication"
// gardent volontairement leur lien : pas mentionnés dans sa demande.
export const COMMISSION_LABELS: { match: string; label: string; hideFromCommissionAccess?: boolean }[] = [
  { match: "Bureau", label: "Bureau", hideFromCommissionAccess: true },
  { match: "Comité directeur", label: "Comité Directeur" },
  { match: "Team communication", label: "Team Communication" },
  { match: "Coachs UBAC", label: "Coachs", hideFromCommissionAccess: true },
  { match: "Salariés", label: "Salariés", hideFromCommissionAccess: true },
  { match: "Animations et événements", label: "Animation & Événements" },
  { match: "Buvette", label: "Buvette" },
  { match: "Commission sponsors", label: "Sponsor" },
  { match: "Calendrier et dates à retenir", label: "Calendrier et dates à retenir" },
];

export function commissionMeta(
  name: string
): { label: string; rank: number; hideFromCommissionAccess: boolean } {
  const idx = COMMISSION_LABELS.findIndex((c) => name.startsWith(c.match));
  return {
    label: idx === -1 ? name : COMMISSION_LABELS[idx].label,
    rank: idx === -1 ? COMMISSION_LABELS.length : idx,
    hideFromCommissionAccess: idx === -1 ? false : (COMMISSION_LABELS[idx].hideFromCommissionAccess ?? false),
  };
}
