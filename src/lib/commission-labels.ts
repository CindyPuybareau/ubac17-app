// Extrait de whatsapp-groups-manager.tsx (retour de Cindy du 10/09, "Accès
// Commissions & Administration") : les noms réels des groupes en base
// portent le millésime ("Comité directeur 2026/27"), pas pensés pour tenir
// sur une carte épurée ni pour un message d'accueil ("Bonjour l'équipe
// Comité directeur 2026/27" sonnerait mal). Même liste, même ordre,
// réutilisée par commissions-manager.tsx et /commission/[token] — une
// seule source plutôt que deux copies qui pourraient diverger.
export const COMMISSION_LABELS: { match: string; label: string }[] = [
  { match: "Bureau", label: "Bureau" },
  { match: "Comité directeur", label: "Comité Directeur" },
  { match: "Team communication", label: "Team Communication" },
  { match: "Coachs UBAC", label: "Coachs" },
  { match: "Salariés", label: "Salariés" },
  { match: "Animations et événements", label: "Animation & Événements" },
  { match: "Buvette", label: "Buvette" },
  { match: "Commission sponsors", label: "Sponsor" },
  { match: "Calendrier et dates à retenir", label: "Calendrier et dates à retenir" },
];

export function commissionMeta(name: string): { label: string; rank: number } {
  const idx = COMMISSION_LABELS.findIndex((c) => name.startsWith(c.match));
  return {
    label: idx === -1 ? name : COMMISSION_LABELS[idx].label,
    rank: idx === -1 ? COMMISSION_LABELS.length : idx,
  };
}
