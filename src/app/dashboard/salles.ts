import { parseMatchTitle } from "@/lib/match-display";

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
  title?: string | null;
}) {
  if (event.event_type === "TRAINING") return false;
  // Le coach a explicitement coché domicile ou extérieur : sa réponse prime
  // sur ce qu'on devinerait du nom de la salle. Repli sur le titre du
  // match ("vs "/"@ ", même lecture que isHomeMatch dans calendar-view.tsx)
  // quand isHome reste NULL en base -- retour de Cindy du 24/09 ("le coach
  // des Séniors M... ne voit pas apparaître les besoins en covoiturage pour
  // les matchs extérieur") : is_home n'est renseigné que pour une poignée
  // de matchs, et location/salle valent ici "Domicile"/"Extérieur" (jamais
  // le nom d'une salle) -- l'ancien repli tombait donc systématiquement
  // dans le cas "lieu inconnu = covoiturage proposé", y compris à
  // domicile, masquant l'inverse (repli correct côté extérieur, mais aussi
  // affiché à tort à domicile).
  const resolvedIsHome = event.isHome ?? parseMatchTitle(event.title ?? null).isHome;
  if (resolvedIsHome === true) return false;
  if (resolvedIsHome === false) return true;
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
// match dont la FFBB a livré la vraie adresse de la salle (away_venue_address,
// voir ffbb-sync.ts -- malgré son nom, couvre aussi un match à domicile dont
// la salle n'était pas renseignée) vaut celle-ci ; faute de mieux, un
// déplacement garde le lieu tel que le coach l'a saisi -- mais jamais
// "Domicile"/"Extérieur" seuls (retour de Cindy du 07/11, "les itinéraires
// ne sont pas bons") : ces deux mots-là ne désignent aucun endroit,
// les envoyer tels quels à un GPS n'a jamais eu de sens.
// Lieu réduit à un nom de commune ("La jarrie") pour un événement sportif
// (retour de Cindy du 20/11, "ça va m'envoyer n'importe où à La Jarrie ?") :
// le GPS posait au centre du village. On cherche plutôt "Gymnase La
// jarrie", que Waze / Google Maps résolvent en général vers le gymnase de
// la commune. Filet de sécurité seulement : une adresse précise saisie
// dans l'événement reste toujours prioritaire et n'est jamais modifiée.
// Jamais pour un événement club (repas, soirée...) : une commune n'y
// désigne pas forcément un gymnase.
const SPORT_EVENT_TYPES = new Set(["TRAINING", "MATCH", "FRIENDLY", "TOURNAMENT"]);
const PRECISE_PLACE_PATTERN =
  /d|,|gymnase|salle|complexe|palais|halle|stade|dojo|espace|centre|rue|avenue|av.|boulevard|bd|chemin|route|allée|allee|place|impasse|quai|lieu-dit/i;
function looksLikeBareTown(location: string) {
  const text = location.trim();
  if (!text || text.length > 40) return false;
  if (PRECISE_PLACE_PATTERN.test(text)) return false;
  return text.split(/s+/).length <= 4;
}

export function venueQuery(event: {
  salle: string | null;
  location: string | null;
  awayVenueAddress?: string | null;
  eventType?: string | null;
  event_type?: string | null;
}): string | null {
  if (event.salle) {
    const known = SALLES.find((s) => normalize(s) === normalize(event.salle as string));
    if (known) return SALLE_ADDRESS[known];
  }
  if (event.awayVenueAddress) return event.awayVenueAddress;
  const normalizedLocation = normalize(event.location ?? "");
  if (normalizedLocation === normalize("Extérieur") || normalizedLocation === normalize("Domicile")) {
    return null;
  }
  const type = event.eventType ?? event.event_type ?? null;
  if (!event.salle && event.location && type && SPORT_EVENT_TYPES.has(type) && looksLikeBareTown(event.location)) {
    return `Gymnase ${event.location.trim()}`;
  }
  const parts = [event.salle, event.location].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export const SALLE_META: Record<Salle, { dot: string; badge: string }> = {
  Angoulins: { dot: "#1E4FA8", badge: "bg-[#1E4FA8]/10 text-[#1E4FA8]" },
  Châtelaillon: { dot: "#2E8B57", badge: "bg-[#2E8B57]/10 text-[#2E8B57]" },
  "Saint-Vivien": { dot: "#F4C430", badge: "bg-[#F4C430]/20 text-amber-800" },
};
