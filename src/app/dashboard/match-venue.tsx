import { MapPin } from "lucide-react";
import SalleBadge from "./salle-badge";
import { homeAwayColorClass, homeAwayLabel } from "./event-style";

// Retour de Cindy du 19/10 ("le DOM/EXT se cherche dans la carte, et
// l'info est en double") : avant ce composant, Domicile/Extérieur vivait
// sur TROIS lignes différentes de la même carte (badge abrégé à côté de
// l'adversaire, pastille grise dans l'en-tête, et encore une fois en toutes
// lettres sur la ligne du lieu) -- jamais toutes les trois en même temps
// selon la carte, mais toujours au moins deux, jamais au même endroit que
// le gymnase. Un seul composant partagé, fusionné sur LA ligne du lieu :
// plus de recherche, plus de doublon. Pas de "use client" -- aucun hook,
// utilisable tel quel par les composants serveur (coach-next-match-card.tsx,
// next-convocation-card.tsx) comme par les composants client.
export default function MatchVenue({
  isHome,
  salle,
  location,
  size = "md",
}: {
  // Toujours résolu par l'appelant via resolveIsHome (lib/match-display.ts)
  // -- ce composant se contente d'afficher, jamais de deviner.
  isHome: boolean | null;
  salle: string | null;
  location: string | null;
  size?: "sm" | "md";
}) {
  const iconClass = size === "sm" ? "h-3 w-3 shrink-0" : "h-4 w-4 shrink-0";
  const textClass = size === "sm" ? "text-xs" : "text-sm";

  if (isHome === null) {
    // Statut inconnu : un événement créé à la main sans "vs "/"@ " dans son
    // titre (jamais le cas d'un match synchronisé FFBB, voir ffbb-sync.ts).
    // Rendu neutre, identique à l'ancien comportement -- aucune couleur
    // puisqu'on ne sait justement pas si c'est à domicile ou non.
    if (!salle && !location) return null;
    return (
      <span className={`flex items-center gap-1 text-zinc-500 ${textClass}`}>
        <MapPin className={iconClass} />
        {salle ? <SalleBadge salle={salle} /> : location}
      </span>
    );
  }

  const label = homeAwayLabel(isHome);
  // Retour de Cindy du 19/10 ("le symbole domicile et extérieur le même,
  // localisation en symbole") : un seul pictogramme pour les deux statuts,
  // seules la couleur et la lettre distinguent -- pas une icône différente
  // par statut.
  // Côté synchro FFBB, `location` ne vaut jamais que "Domicile"/"Extérieur"
  // tel quel (voir ffbb-sync.ts) -- déjà dit par `label` juste avant, pas la
  // peine de l'écrire une seconde fois sur la même ligne. Seul un lieu
  // VRAIMENT saisi (texte libre d'un événement créé à la main) s'ajoute.
  const extraLocation = !salle && location && location !== label ? location : null;

  return (
    <span
      className={`flex flex-wrap items-center gap-1 font-semibold ${homeAwayColorClass(isHome)} ${textClass}`}
    >
      <MapPin className={iconClass} />
      {label}
      {salle && <SalleBadge salle={salle} />}
      {extraLocation && <span className="font-normal text-zinc-500">· {extraLocation}</span>}
    </span>
  );
}
