// Vacances scolaires zone A 2026-2027 (retour de Cindy du 2026-08-25, dates
// collées depuis le calendrier officiel education.gouv.fr) — sert
// uniquement à teinter les cases du grand calendrier (vue Mois), jamais le
// bandeau "Cette semaine" de l'en-tête.
//
// Chaque plage va du lendemain du dernier jour de cours au jour précédant
// la reprise (bornes incluses) : "fin des cours" et "jour de reprise" sont
// eux-mêmes des jours d'école normaux, pas des jours de vacances.
export const SCHOOL_HOLIDAYS_ZONE_A: { name: string; start: string; end: string }[] = [
  { name: "Vacances de la Toussaint", start: "2026-10-18", end: "2026-11-01" },
  { name: "Vacances de Noël", start: "2026-12-20", end: "2027-01-03" },
  { name: "Vacances d'hiver", start: "2027-02-14", end: "2027-02-28" },
  { name: "Vacances de printemps", start: "2027-04-11", end: "2027-04-25" },
  { name: "Pont de l'Ascension", start: "2027-05-06", end: "2027-05-09" },
  // Fin connue (3 juillet 2027) ; la date de reprise 2027-2028 n'est pas
  // encore publiée à ce jour — 31 août retenu par convention (fin d'année
  // scolaire usuelle), à ajuster une fois la date officielle connue.
  { name: "Grandes vacances", start: "2027-07-04", end: "2027-08-31" },
];

function toKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// null si le jour n'est pas dans une période de vacances zone A, sinon le
// nom de la période (utilisable en title/tooltip).
export function schoolHolidayFor(date: Date): string | null {
  const key = toKey(date);
  const match = SCHOOL_HOLIDAYS_ZONE_A.find((h) => key >= h.start && key <= h.end);
  return match?.name ?? null;
}
