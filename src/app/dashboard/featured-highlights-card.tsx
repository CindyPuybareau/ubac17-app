"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Megaphone, X } from "lucide-react";
import type { FeaturedHighlight } from "@/lib/featured-highlights";
import { ACTION_CARD_ITEM_CLASSES, HIGHLIGHTS_GRID_CLASSES } from "./kpi-grid-classes";

// Retour de Cindy du 10/11 ("2 côte à côte", puis "il serait bien de
// toutes les voir avec des flèches à partir de la 3ème") : jusqu'à 2
// affiches actives montrées en même temps (même gabarit que
// BoutiqueCard, boutique-card.tsx), avec des flèches gauche/droite —
// visibles seulement à partir de la 3ème affiche.
//
// Retour de Cindy du 11/11 ("au clic il y en a qu'une seule affiche qui
// apparait") : l'ancienne pagination PAR PAGES DE 2 (page 0 = [0,1],
// page 1 = [2,3]...) laissait une DERNIÈRE PAGE INCOMPLÈTE dès que le
// total n'était pas un multiple de 2 (ex. 3 affiches -> page 0 = les 2
// premières, page 1 = la 3e TOUTE SEULE, case vide à côté) -- la flèche
// "suivant" y menait tout droit. Remplacé par une fenêtre GLISSANTE
// (rotation d'1 cran, pas de page de 2) : chaque position montre TOUJOURS
// exactement min(2, total) affiches RÉELLES (ex. [0,1], puis [1,2], puis
// [2,0]...), jamais de case vide ni d'affiche seule -- "fait tourner les
// affiches existantes" plutôt que de buter sur un reliquat.
const VISIBLE_COUNT = 2;

export default function FeaturedHighlightsCard({
  highlights,
  calendarSectionKey,
}: {
  highlights: FeaturedHighlight[];
  // Clé de section du calendrier dans CET espace ("home" Bureau,
  // "calendar" Coach/Enfant, "planning" Famille) -- diffère par espace,
  // voir admin-view.tsx/coach-view.tsx/family-view.tsx/child-dashboard.tsx.
  calendarSectionKey: string;
}) {
  const [start, setStart] = useState(0);

  if (highlights.length === 0) return null;

  const total = highlights.length;
  const visibleCount = Math.min(VISIBLE_COUNT, total);
  // Flèches seulement s'il reste au moins une affiche à découvrir par
  // rotation -- avec 1 ou 2 affiches au total, tout est déjà visible en
  // permanence, rien à faire tourner.
  const canRotate = total > visibleCount;
  const safeStart = start % total;
  const visible = Array.from(
    { length: visibleCount },
    (_, i) => highlights[(safeStart + i) % total]
  );

  function go(delta: number) {
    setStart((prev) => (prev + delta + total) % total);
  }

  // Retour de Cindy du 10/11 ("meme taille que les KPI... le diaporama
  // egalement") : les affiches visibles deviennent des cellules de la
  // grille partagée KPI_GRID_CLASSES (kpi-grid-classes.ts), exactement
  // comme BoutiqueCard -- même largeur de carte que les KPI à chaque
  // palier, plutôt que la largeur fixe précédente (w-40/48/56). Les
  // flèches restent DANS la largeur de la grille (overlay sur le bord
  // de la 1ère/dernière carte, jamais hors-cadre) : une première tentative
  // les faisait déborder (-left-2/-right-2) et elles se faisaient
  // couper net par le bord de l'écran sur mobile, sans marge pour les
  // accueillir. Fix du bug "le responsive ne va pas" du 10/11
  // (flèches+cartes vivaient comme enfants flex séparés, flex-wrap les
  // repliait n'importe où) : un seul conteneur relatif regroupe tout,
  // la grille ne replie plus jamais au milieu d'une carte.
  //
  // Retour de Cindy du 11/11 ("fleches du diaporama blanches pour plus de
  // visibilité") : fond navy (bg-navy/80) remplacé par un disque blanc
  // (bg-white/90) + icône navy -- se détachait mal sur les affiches/fonds
  // sombres, le blanc tranche sur n'importe quelle image.
  //
  // Retour de Cindy du 11/11 ("aligné sur PC... sur une même ligne", puis
  // "le diaporama... ne prend plus toute la largeur des autres cartes en
  // haut et en bas, c'est moche") : w-full/sm:w-auto, comme
  // HIGHLIGHTS_GRID_CLASSES juste en dessous -- sur téléphone, ce
  // composant prend toute la largeur de sa ligne (replié sous Boutique/
  // Exclu sponsor par flex-wrap, voir admin-view.tsx) ; à partir de sm,
  // il se redimensionne à son seul contenu pour tenir sur la même ligne
  // que Boutique/Exclu sponsor.
  return (
    <div className="relative w-full sm:w-auto">
      {canRotate && (
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Affiches précédentes"
          className="absolute left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-navy shadow-md backdrop-blur-sm transition-colors hover:bg-white"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      <div className={HIGHLIGHTS_GRID_CLASSES}>
        {visible.map((h, i) => (
          // Clé composite (id + position) : en fenêtre glissante, la MÊME
          // affiche peut réapparaître à une position différente d'un cran
          // sur l'autre (ex. [2,0] -> [0,1], l'affiche 0 change de côté) --
          // une clé sur le seul id ferait croire à React que la carte n'a
          // pas bougé et sauterait l'animation/état de la carte voisine.
          <SingleHighlightCard
            key={`${h.id}:${i}`}
            highlight={h}
            calendarSectionKey={calendarSectionKey}
          />
        ))}
      </div>
      {canRotate && (
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Affiches suivantes"
          className="absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-navy shadow-md backdrop-blur-sm transition-colors hover:bg-white"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// Clic sur la carte :
// - `linkUrl` renseigné -> ouvre ce lien externe (ex. HelloAsso).
// - sinon `eventId` renseigné -> navigue vers le mois de l'événement
//   dans le calendrier (`?section=<calendarSectionKey>&month=YYYY-MM`,
//   déjà lu par calendar-view.tsx -- pas une fiche ouverte directement,
//   portée volontairement limitée, voir le plan).
// - sinon, avec une image (cas "Nouveaux créneaux d'entraînement", pure
//   affiche sans lien ni événement) -> retour de Cindy du 10/11 ("au
//   clic rien ne se passe, elle pourrait apparaître plus grosse en
//   popup si pas de lien ?") : s'agrandit en plein écran plutôt que de
//   rester inerte -- même fond semi-transparent que PendingRsvpPopup
//   (pending-rsvp-popup.tsx), pas une nouvelle convention de popup.
// - sinon (aucune image non plus) -> aucune action, juste visuel.
function SingleHighlightCard({
  highlight,
  calendarSectionKey,
}: {
  highlight: FeaturedHighlight;
  calendarSectionKey: string;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const href = highlight.linkUrl
    ? highlight.linkUrl
    : highlight.eventId && highlight.eventStartTime
      ? `?section=${calendarSectionKey}&month=${highlight.eventStartTime.slice(0, 7)}`
      : null;
  const external = Boolean(highlight.linkUrl);
  const canEnlarge = !href && Boolean(highlight.imageUrl);

  // Retour de Cindy du 10/11 ("le titre... cache l'affiche, le rendre
  // obligatoire ok, mais non visible sur le tableau de bord") : titre
  // toujours obligatoire côté formulaire (featured-highlights-
  // manager.tsx, pour identifier l'affiche dans la liste de gestion),
  // mais jamais superposé ici -- l'image porte déjà son propre texte.
  const content = (
    <div className="relative h-full w-full overflow-hidden rounded-2xl">
      {highlight.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={highlight.imageUrl}
          alt={highlight.title}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-navy via-navy to-navy-dark">
          <Megaphone className="h-8 w-8 text-white/70" />
        </div>
      )}
    </div>
  );

  // Retour de Cindy du 11/11 ("boutique et exclu sponsor même taille que
  // les diapo sur PC et tablette", "non sur téléphone on laisse comme
  // avant") : ACTION_CARD_ITEM_CLASSES (kpi-grid-classes.ts), aucune
  // largeur sur téléphone (la grille 2 colonnes du parent dicte la
  // taille, comme BureauKpiGrid), largeur fixe identique à Boutique/
  // Exclu sponsor à partir de sm.
  return (
    <div className={`relative aspect-[3/4] rounded-2xl shadow-sm ${ACTION_CARD_ITEM_CLASSES}`}>
      {href ? (
        <a
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer" : undefined}
          className="block h-full w-full transition-opacity hover:opacity-90"
        >
          {content}
        </a>
      ) : canEnlarge ? (
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          aria-label="Agrandir l'affiche"
          className="block h-full w-full text-left transition-opacity hover:opacity-90"
        >
          {content}
        </button>
      ) : (
        content
      )}

      {lightboxOpen && highlight.imageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            aria-label="Fermer"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={highlight.imageUrl}
            alt={highlight.title}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
