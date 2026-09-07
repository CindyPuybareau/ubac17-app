"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays, MapPin, X } from "lucide-react";
import OpponentDisplay from "./opponent-display";
import SalleBadge from "./salle-badge";
import { isMatchType, styleFor } from "./event-style";
import {
  hasDismissedRsvpPopup,
  markRsvpPopupDismissed,
  rsvpPopupKey,
} from "@/lib/dismissed-rsvp-popups";

// Type minimal, volontairement indépendant des types "événement" déjà
// utilisés ailleurs (AdminUpcomingEvent, ChildEvent, BenevoleEvent...) --
// cette popup est partagée entre plusieurs espaces qui n'ont pas tous
// exactement la même forme d'événement. Chaque appelant construit ce
// sous-ensemble commun à partir de son propre type, plutôt que de
// dépendre d'un seul type "maison" qui ne conviendrait pas partout.
export type PendingRsvpEvent = {
  id: string;
  title: string | null;
  event_type: string | null;
  start_time: string;
  location: string | null;
  salle: string | null;
};

// Retour de Cindy du 07/09 ("une sorte de popup de la carte lors de
// l'ouverture de l'application sur l'événement à venir afin que les gens
// n'oublient pas de répondre") : une fenêtre par-dessus l'écran, tant
// qu'une réponse manque pour le tout prochain événement (dans les 2 jours
// -- filtré par chaque appelant, voir family-view.tsx/benevole-view.tsx)
// de la personne concernée.
//
// Fermée avec la croix (ou une fois répondu), elle ne revient plus JAMAIS
// pour ce même événement+personne -- deuxième retour de Cindy le même
// jour, après avoir réalisé qu'un réaffichage à chaque ouverture serait
// épuisant vu la fréquence des matchs/entraînements ("sinon ils auront
// des popup tous le temps"). Mémorisé en localStorage (voir
// dismissed-rsvp-popups.ts), donc par appareil -- un nouvel événement
// (autre id) redéclenchera bien une nouvelle popup.
//
// Volontairement plus léger que NextConvocationCard (pas de covoiturage/
// rôles ici) : le seul but est de répondre vite, pas de gérer
// l'organisation du match -- ça reste accessible comme avant depuis le
// calendrier normal une fois la popup fermée/répondue.
export type PendingRsvpItem = {
  // Identifiant de la personne concernée -- un id joueur côté Famille/
  // Enfant, un id bénévole côté Espace Bénévole. Sert uniquement de clé
  // (React + suivi des réponses données), jamais interprété ici.
  id: string;
  // Prénom (ou "Toi") à afficher au-dessus de la carte -- utile surtout
  // quand plusieurs enfants ont chacun une réponse en attente.
  name: string;
  event: PendingRsvpEvent;
};

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PendingRsvpPopup({
  items,
  renderActions,
}: {
  items: PendingRsvpItem[];
  // Chaque espace répond différemment (RsvpButtons avec un playerId côté
  // Famille/Enfant, BenevoleRsvpButtons sans playerId côté Bénévole) :
  // plutôt qu'un mécanisme unique qui ne conviendrait à personne, l'appelant
  // fournit ses propres boutons pour CET item précis -- `onAnswered` doit
  // être appelé une fois la réponse donnée, pour que la carte disparaisse
  // de la popup à l'instant (et que la popup se ferme d'elle-même une fois
  // tout le monde répondu).
  renderActions: (item: PendingRsvpItem, onAnswered: () => void) => ReactNode;
}) {
  // Une personne qui vient de répondre disparaît de la popup à l'instant
  // (retour immédiat, plutôt que d'attendre que toute la page se
  // recharge) -- la popup se ferme d'elle-même une fois tout le monde
  // répondu.
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  // Éléments déjà fermés/répondus lors d'une ouverture précédente (lu
  // depuis localStorage). État démarré vide des deux côtés (serveur ET
  // client) pour ne jamais provoquer de décalage d'hydratation -- même
  // raisonnement que match-result-celebration.tsx : localStorage n'existe
  // pas côté serveur, le vrai calcul n'a lieu qu'après montage, dans
  // l'effet.
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  // Fermeture manuelle (croix) pour CETTE session -- distincte du suivi
  // localStorage ci-dessus : la croix marque aussi chaque item affiché
  // comme définitivement vu (voir handleClose).
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    // requestAnimationFrame plutôt qu'un setState direct dans le corps de
    // l'effet (react-hooks/set-state-in-effect) -- même traitement que
    // match-result-celebration.tsx pour une lecture localStorage.
    const raf = requestAnimationFrame(() => {
      setDismissedKeys(
        new Set(
          items
            .filter((item) =>
              hasDismissedRsvpPopup(rsvpPopupKey(item.event.id, item.id))
            )
            .map((item) => rsvpPopupKey(item.event.id, item.id))
        )
      );
    });
    return () => cancelAnimationFrame(raf);
    // items change de référence à chaque rendu du parent (recréé à partir
    // des props) -- comparer son contenu sérialisé évite une boucle
    // d'effets qui ne changerait jamais réellement dismissedKeys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => rsvpPopupKey(i.event.id, i.id)).join(",")]);

  const visibleItems = items.filter(
    (item) =>
      !answeredIds.has(item.id) &&
      !dismissedKeys.has(rsvpPopupKey(item.event.id, item.id))
  );

  function handleClose() {
    // Fermer la croix marque TOUT ce qui est affiché à cet instant comme
    // vu pour de bon -- pas seulement masqué pour cette session.
    for (const item of visibleItems) {
      markRsvpPopupDismissed(rsvpPopupKey(item.event.id, item.id));
    }
    setClosed(true);
  }

  function handleAnswered(item: PendingRsvpItem) {
    markRsvpPopupDismissed(rsvpPopupKey(item.event.id, item.id));
    setAnsweredIds((cur) => new Set(cur).add(item.id));
  }

  if (closed || visibleItems.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-bold text-zinc-900">
            N&apos;oublie pas de répondre !
          </p>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-3">
          {visibleItems.map((item) => {
            const lieu = item.event.salle || item.event.location;
            const style = styleFor(item.event.event_type);
            const isTournament = item.event.event_type === "TOURNAMENT";
            const isOfficialMatch = item.event.event_type === "MATCH";
            // Même habillage que les cartes riches du calendrier (retour
            // de Cindy du 07/09 : "le rendre aussi joli que la carte
            // evenement concerné") -- liseré coloré par type d'événement
            // + badge, repris de week-strip-banner.tsx/child-calendar-tab.tsx.
            const shellClass = isTournament
              ? "relative rounded-xl border-2 border-dashed border-ubac-yellow bg-white p-3"
              : isOfficialMatch
                ? `rounded-xl border border-navy/15 bg-white p-3 border-l-8 ${style.border}`
                : `rounded-xl border border-zinc-100 bg-white p-3 border-l-4 ${style.border}`;
            return (
              <div key={`${item.event.id}-${item.id}`} className={shellClass}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {item.name}
                  </p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}
                  >
                    {style.label}
                  </span>
                </div>
                <div className="mt-1">
                  {isMatchType(item.event.event_type) ? (
                    <OpponentDisplay title={item.event.title} size="sm" />
                  ) : (
                    <p className="font-bold text-zinc-900">
                      {item.event.title ?? "Entraînement"}
                    </p>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0 text-navy" />
                    {formatEventDate(item.event.start_time)}
                  </span>
                  {lieu && (
                    <span className="flex items-center gap-1 truncate">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {item.event.salle ? <SalleBadge salle={item.event.salle} /> : item.event.location}
                    </span>
                  )}
                </div>
                <div className="mt-2.5">
                  {renderActions(item, () => handleAnswered(item))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
