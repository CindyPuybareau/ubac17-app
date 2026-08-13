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
  isHome?: boolean | null;
}) {
  if (event.event_type === "TRAINING") return false;
  // Le coach a explicitement coché domicile ou extérieur : sa réponse prime
  // sur ce qu'on devinerait du nom de la salle.
  if (event.isHome === true) return false;
  if (event.isHome === false) return true;
  const venue = normalize(`${event.salle ?? ""} ${event.location ?? ""}`);
  if (!venue.trim()) return true;
  return !SALLES.some((s) => venue.includes(normalize(s)));
}

// Adresses postales des trois gymnases du club. "Angoulins" seul envoie
// un GPS au centre du village ; l'adresse complète le pose devant la
// bonne porte, ce qui est tout l'intérêt d'un itinéraire un samedi matin.
export const SALLE_ADDRESS: Record<Salle, string> = {
  Angoulins: "Chemin des Marais, 17690 Angoulins",
  Châtelaillon: "Allée du Stade, 17340 Châtelaillon-Plage",
  "Saint-Vivien": "Complexe sportif, 17220 Saint-Vivien",
};

// Ce qu'on donne au GPS. Une salle du club vaut son adresse postale ; un
// déplacement garde le lieu tel que le coach l'a saisi, faute de mieux.
export function venueQuery(event: {
  salle: string | null;
  location: string | null;
}): string | null {
  if (event.salle) {
    const known = SALLES.find((s) => normalize(s) === normalize(event.salle as string));
    if (known) return SALLE_ADDRESS[known];
  }
  const parts = [event.salle, event.location].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export const SALLE_META: Record<Salle, { dot: string; badge: string }> = {
  Angoulins: { dot: "#1E4FA8", badge: "bg-[#1E4FA8]/10 text-[#1E4FA8]" },
  Châtelaillon: { dot: "#2E8B57", badge: "bg-[#2E8B57]/10 text-[#2E8B57]" },
  "Saint-Vivien": { dot: "#F4C430", badge: "bg-[#F4C430]/20 text-amber-800" },
};
