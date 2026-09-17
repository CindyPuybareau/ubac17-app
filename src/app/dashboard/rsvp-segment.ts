// Habillage commun des réponses de présence. Deux composants les rendent —
// le contrôle complet de l'espace Parent (rsvp-control) et la version
// courte du calendrier (rsvp-buttons) — et ils doivent se ressembler : les
// laisser porter chacun ses classes, c'est les voir diverger au premier
// ajustement.
//
// Les classes sont écrites en toutes lettres : Tailwind v4 ne génère un
// utilitaire que s'il apparaît littéralement dans une source scannée, une
// composition dynamique ne produirait aucun style.

// Retour de Cindy du 17/09 ("responsive bof" sur Présent/Absent/Annuler) :
// ce groupe passe de 2 à 3 boutons dès qu'une réponse existe (Annuler
// n'apparaît qu'alors) -- sans flex-wrap ni max-w-full, rien ne l'empêchait
// de dépasser la largeur de la carte sur un téléphone étroit. flex-wrap
// laisse Annuler retomber sur sa propre ligne plutôt que de déborder.
export const SEGMENT_GROUP =
  "inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-lg border border-slate-200/60 bg-slate-100 p-1";

export const SEGMENT_BUTTON =
  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-60";

export const SEGMENT_OFF = "text-slate-600 hover:bg-slate-200/60";

// Retour de Cindy du 09/09 (phase 1 UX, couleurs sémantiques) : status-*
// (globals.css) plutôt qu'emerald-500/rose-500 codées en dur -- même
// migration que attendance-badges.tsx/rsvp-control.tsx/calendar-view.tsx/
// child-calendar-tab.tsx, pour que "présent"/"absent" porte enfin
// exactement la même couleur partout dans l'appli.
export const SEGMENT_PRESENT_ON = "bg-status-success text-white shadow-sm";

export const SEGMENT_ABSENT_ON = "bg-status-urgent text-white shadow-sm";
