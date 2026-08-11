// Matches ubac17.fr's "Légende des lieux" exactly (colors pulled from the
// site's own legend dots) so the app's salle badges look consistent with
// the public planning page.
export const SALLES = ["Angoulins", "Châtelaillon", "Saint-Vivien"] as const;
export type Salle = (typeof SALLES)[number];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

// Le covoiturage ne concerne que les déplacements : pas d'entraînement, et
// pas de match joué dans l'une des trois salles du club. Salle et lieu sont
// interchangeables (le club renseigne l'un ou l'autre), donc les deux sont
// examinés. Lieu inconnu = on propose quand même le covoiturage : mieux vaut
// une proposition inutile qu'un déplacement sans solution.
export function shouldOfferCarpool(event: {
  event_type: string | null;
  salle: string | null;
  location: string | null;
}) {
  if (event.event_type === "TRAINING") return false;
  const venue = normalize(`${event.salle ?? ""} ${event.location ?? ""}`);
  if (!venue.trim()) return true;
  return !SALLES.some((s) => venue.includes(normalize(s)));
}

export const SALLE_META: Record<Salle, { dot: string; badge: string }> = {
  Angoulins: { dot: "#1E4FA8", badge: "bg-[#1E4FA8]/10 text-[#1E4FA8]" },
  Châtelaillon: { dot: "#2E8B57", badge: "bg-[#2E8B57]/10 text-[#2E8B57]" },
  "Saint-Vivien": { dot: "#F4C430", badge: "bg-[#F4C430]/20 text-amber-800" },
};
