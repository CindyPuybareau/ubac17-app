export type BirthdaySource = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  category?: string | null;
  // Équipe(s) auxquelles ce membre appartient — seulement renseigné côté
  // Famille, pour filtrer "Anniversaires de la semaine" et les puces du
  // calendrier par enfant sélectionné (family-view.tsx). Absent ailleurs
  // (Bureau, Coach), qui n'ont pas ce filtre à appliquer.
  teamIds?: string[];
};

// Groups members by their birthday's month/day (e.g. "05-12"), ignoring
// year, so a calendar can mark every occurrence of a recurring birthday
// regardless of which month is currently being viewed. birth_date is a
// plain "YYYY-MM-DD" date column — split as a string to sidestep any
// Date-parsing timezone ambiguity entirely.
export function groupBirthdaysByMonthDay<T extends BirthdaySource>(
  members: T[]
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  members.forEach((m) => {
    if (!m.birthDate) return;
    const parts = m.birthDate.split("-");
    if (parts.length < 3) return;
    const key = `${parts[1]}-${parts[2]}`;
    const list = map.get(key) ?? [];
    list.push(m);
    map.set(key, list);
  });
  return map;
}

export type BirthdayEntry<T> = T & { daysUntil: number };

// Plain module-level function (not called inline in a Server Component
// body) so `new Date()` doesn't trip the react-hooks/purity lint rule —
// matches the findNextEventIdByTeamId pattern in page.tsx.
export function upcomingBirthdays<T extends BirthdaySource>(
  members: T[],
  withinDays = 7
): BirthdayEntry<T>[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const msPerDay = 24 * 60 * 60 * 1000;

  const entries: BirthdayEntry<T>[] = [];

  members.forEach((m) => {
    if (!m.birthDate) return;
    const birth = new Date(m.birthDate);
    if (Number.isNaN(birth.getTime())) return;

    const thisYear = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
    let daysUntil = Math.round((thisYear.getTime() - today.getTime()) / msPerDay);
    if (daysUntil < 0) {
      const nextYear = new Date(
        today.getFullYear() + 1,
        birth.getMonth(),
        birth.getDate()
      );
      daysUntil = Math.round((nextYear.getTime() - today.getTime()) / msPerDay);
    }

    if (daysUntil <= withinDays) {
      entries.push({ ...m, daysUntil });
    }
  });

  return entries.sort((a, b) => a.daysUntil - b.daysUntil);
}
