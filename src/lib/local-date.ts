// Les colonnes `date` de Postgres (birth_date, etc.) arrivent côté JS
// comme un texte plein "YYYY-MM-DD", sans heure ni fuseau. `new Date("2013-01-07")`
// l'interprète comme minuit UTC — et dès que .getDate()/.getMonth() sont
// relus dans un fuseau derrière l'UTC (les fonctions serverless tournent
// rarement à l'heure de Paris), la date affichée recule d'un jour. Toute
// lecture d'une telle chaîne doit passer par ces helpers, qui ne
// transitent jamais par une interprétation UTC implicite.

export function parseDateParts(dateStr: string): { year: number; month: number; day: number } | null {
  const parts = dateStr.split("-");
  if (parts.length < 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month: month - 1, day }; // month 0-indexé, comme Date
}

// Un Date construit à partir des composants déjà extraits du texte,
// jamais du texte lui-même : la forme (année, mois, jour) du constructeur
// Date est toujours interprétée dans le fuseau de la machine qui
// l'exécute, sans jamais transiter par UTC — contrairement à
// `new Date("YYYY-MM-DD")`. Utile quand un vrai objet Date est nécessaire
// (comparaisons, arithmétique de jours).
export function localDateFromParts(dateStr: string): Date | null {
  const parts = parseDateParts(dateStr);
  if (!parts) return null;
  return new Date(parts.year, parts.month, parts.day);
}

// "7 janvier 2013" / "07/01/2013" — construit directement depuis les
// composants, jamais via toLocaleDateString() sur un Date UTC-parsé (même
// piège que ci-dessus).
export function formatLocalDateFr(dateStr: string): string | null {
  const parts = parseDateParts(dateStr);
  if (!parts) return null;
  const d = String(parts.day).padStart(2, "0");
  const m = String(parts.month + 1).padStart(2, "0");
  return `${d}/${m}/${parts.year}`;
}
