// Habillage commun des réponses de présence. Deux composants les rendent —
// le contrôle complet de l'espace Parent (rsvp-control) et la version
// courte du calendrier (rsvp-buttons) — et ils doivent se ressembler : les
// laisser porter chacun ses classes, c'est les voir diverger au premier
// ajustement.
//
// Les classes sont écrites en toutes lettres : Tailwind v4 ne génère un
// utilitaire que s'il apparaît littéralement dans une source scannée, une
// composition dynamique ne produirait aucun style.

export const SEGMENT_GROUP =
  "inline-flex w-fit items-center gap-1 rounded-lg border border-slate-200/60 bg-slate-100 p-1";

export const SEGMENT_BUTTON =
  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-60";

export const SEGMENT_OFF = "text-slate-600 hover:bg-slate-200/60";

export const SEGMENT_PRESENT_ON = "bg-emerald-500 text-white shadow-sm";

export const SEGMENT_ABSENT_ON = "bg-rose-500 text-white shadow-sm";
