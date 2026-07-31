// Matches ubac17.fr's "Légende des lieux" exactly (colors pulled from the
// site's own legend dots) so the app's salle badges look consistent with
// the public planning page.
export const SALLES = ["Angoulins", "Châtelaillon", "Saint-Vivien"] as const;
export type Salle = (typeof SALLES)[number];

export const SALLE_META: Record<Salle, { dot: string; badge: string }> = {
  Angoulins: { dot: "#1E4FA8", badge: "bg-[#1E4FA8]/10 text-[#1E4FA8]" },
  Châtelaillon: { dot: "#2E8B57", badge: "bg-[#2E8B57]/10 text-[#2E8B57]" },
  "Saint-Vivien": { dot: "#F4C430", badge: "bg-[#F4C430]/20 text-amber-800" },
};
