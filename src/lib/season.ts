// Single source of truth for "what season is it right now" and the
// per-category age/year status derived from it. Nothing here is
// persisted — every value is computed fresh from the current date (or an
// explicit reference date, for tests/previews), so the club's July 1st
// season rollover and the resulting category reshuffle (U11 -> U13, an
// extra "année" for everyone, etc.) need zero manual intervention: the
// same code just returns different numbers the day after June 30th.

import { parseDateParts } from "./local-date";

// French basketball seasons run September-to-June but the club treats
// July 1st as the hard cutover point (registrations for the new season
// open then), so "the season" for any given date is:
//   Jan-Jun -> started the previous calendar year
//   Jul-Dec -> started this calendar year
export function getCurrentSeasonStartYear(referenceDate: Date = new Date()): number {
  // Lu en Europe/Paris, jamais dans le fuseau du runtime qui exécute ce
  // code (audit du 31/08) : getMonth()/getFullYear() bruts lisent le
  // fuseau LOCAL du process — UTC sur Vercel, où tourne notamment
  // enfant/view/page.tsx (composant serveur, appelle cette fonction sans
  // référence explicite). Dans la fenêtre ~22h-23h59 UTC du 30 juin (déjà
  // le 1er juillet à Paris, CEST = UTC+2), la bascule de saison partait
  // avec un jour de retard côté serveur. Même idiome que cron/bureau-
  // alerts et cron/match-reminders pour ce même problème.
  const parisParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "numeric",
  }).formatToParts(referenceDate);
  const month = Number(parisParts.find((p) => p.type === "month")?.value);
  const year = Number(parisParts.find((p) => p.type === "year")?.value);
  return month >= 7 ? year : year - 1;
}

export function getCurrentSeasonLabel(referenceDate: Date = new Date()): string {
  const start = getCurrentSeasonStartYear(referenceDate);
  return `${start}-${start + 1}`;
}

export type PlayerYearStatus =
  | { kind: "ANNEE"; label: string }
  | { kind: "ROOKIE" }
  | { kind: "SPARRING" }
  | { kind: "OLD_SOLDIER" };

// Each youth category spans a fixed number of birth years ("années"),
// starting at a fixed age on the 1er juillet of the season. Séniors and
// Babys aren't in this table — they're handled separately below.
const AGE_CATEGORIES: { prefix: string; baseAge: number; years: number }[] = [
  { prefix: "u9", baseAge: 7, years: 2 },
  { prefix: "u11", baseAge: 9, years: 2 },
  { prefix: "u13", baseAge: 11, years: 2 },
  { prefix: "u15", baseAge: 13, years: 2 },
  { prefix: "u18", baseAge: 15, years: 3 },
];
const ANNEE_LABELS = ["1ère année", "2ème année", "3ème année"];
const SENIOR_ROOKIE_AGE = 18;
// 40 ans et plus au 1er juillet de la saison — pour 2026/2027 ça revient
// à "né(e) en 1986 ou avant", mais exprimé en âge (pas en année codée en
// dur) pour que le seuil avance tout seul chaque saison, comme le reste
// de ce fichier.
const OLD_SOLDIER_AGE = 40;

// Returns null when there's nothing meaningful to show (missing data,
// Babys, Loisirs, or a "regular" — not brand-new — senior) rather than a
// forced badge, matching the spec's "pas d'affichage" cases.
export function computePlayerYearStatus(
  birthDate: string | null,
  category: string | null,
  referenceDate: Date = new Date()
): PlayerYearStatus | null {
  if (!birthDate || !category) return null;
  const parts = parseDateParts(birthDate);
  if (!parts) return null;
  const birthYear = parts.year;

  const seasonStart = getCurrentSeasonStartYear(referenceDate);
  const age = seasonStart - birthYear;
  const c = category.toLowerCase();

  const ageCategory = AGE_CATEGORIES.find((entry) => c.startsWith(entry.prefix));
  if (ageCategory) {
    const index = age - ageCategory.baseAge;
    if (index >= 0 && index < ageCategory.years) {
      return { kind: "ANNEE", label: ANNEE_LABELS[index] };
    }
    // Birth year falls outside this category's official range (e.g. a
    // 2013-born player registered in U13F, whose range is 2014-2015) —
    // the club plays them up/down anyway, flagged as Sparring Partner
    // rather than silently mislabeled.
    return { kind: "SPARRING" };
  }

  if (c.startsWith("séniors") || c.startsWith("seniors")) {
    if (age === SENIOR_ROOKIE_AGE) return { kind: "ROOKIE" };
    if (age < SENIOR_ROOKIE_AGE) return { kind: "SPARRING" };
    if (age >= OLD_SOLDIER_AGE) return { kind: "OLD_SOLDIER" };
    return null;
  }

  // Babys, Loisirs, and any other category: no year/status badge.
  return null;
}
