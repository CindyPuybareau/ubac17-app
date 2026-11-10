import { ExternalLink, ShoppingBag } from "lucide-react";
import { BOUTIQUE_URL } from "./boutique";

// Retour du Bureau (09/11, relayé par Cindy) : "Boutique en ligne" quitte le
// menu latéral des 3 espaces (Bureau/Coach/Famille) pour devenir une carte
// cliquable dans le Tableau de bord, au même niveau que les futures
// "Affiches" (voir le plan validé avec Cindy). Toujours le même lien
// externe (boutique.ts), jamais dupliqué.
//
// Retour de Cindy du 09/11 ("elle se mélange avec les KPI côté Bureau, je
// la verrais bien en bleu") : fond bleu nuit PLEIN (un simple ton
// translucide, essayé d'abord, restait trop proche du blanc des cartes KPI
// voisines pour vraiment trancher) au lieu du blanc + icône dorée
// d'origine. Conteneur en <div> (pas un seul <a> englobant) : le lien
// "Suivi des ventes" côté Bureau est un second lien distinct, un <a> ne
// peut pas en contenir un autre.
export default function BoutiqueCard({
  // Retour de Cindy du 09/11 : "Suivi des ventes" (espace commerçant,
  // identifiant/mot de passe personnels de Cindy, voir boutique.ts)
  // remplace la légende générique "Lien externe", Bureau uniquement --
  // jamais Coach/Famille, même restriction que le lien existant.
  salesUrl,
}: {
  salesUrl?: string;
}) {
  // Retour de Cindy du 10/11 ("même taille que les KPI du dessus, sur
  // tous les espaces") : plus de taille fixe (carrée) ni de prop
  // Bureau-only -- cette carte vit désormais TOUJOURS dans la grille
  // partagée KPI_GRID_CLASSES (featured-highlights-card.tsx), identique
  // aux 4 espaces, donc toujours calée sur la cellule de grille comme
  // KpiCard (bureau-dashboard.tsx), que de vraies KPI existent ou non à
  // côté (Coach/Famille/Enfant n'en ont pas, la grille reste la même).
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-navy via-navy to-navy-dark px-4 py-4 text-center shadow-sm">
      <a
        href={BOUTIQUE_URL}
        target="_blank"
        rel="noreferrer"
        className="flex flex-col items-center gap-2 transition-opacity hover:opacity-80"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
          <ShoppingBag className="h-5 w-5 shrink-0 text-white" />
        </span>
        <span className="text-sm font-semibold text-white">Boutique en ligne</span>
      </a>
      {/* Retour de Cindy du 09/11 ("lien externe on peut supprimer pour les
          autres espaces, ils s'en rendront compte") : plus de légende du
          tout côté Coach/Famille -- seul le Bureau garde un second lien
          ("Suivi des ventes"), qui a besoin d'être nommé pour se
          distinguer du premier. */}
      {salesUrl && (
        <a
          href={salesUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-[11px] font-medium text-ubac-yellow hover:underline"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          Suivi des ventes
        </a>
      )}
    </div>
  );
}
