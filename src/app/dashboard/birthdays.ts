export type BirthdaySource = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
};

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
