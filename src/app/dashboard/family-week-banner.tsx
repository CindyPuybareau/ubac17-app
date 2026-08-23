import { styleFor } from "./event-style";
import type { AdminUpcomingEvent } from "./page";

// Bandeau contextuel au-dessus du calendrier (direction artistique validée
// par Cindy le 2026-08-23, écran prioritaire "Accueil connecté Parent") :
// une phrase qui répond tout de suite à "qu'est-ce qui m'attend cette
// semaine ?", plus une frise des 7 prochains jours qu'on peut ignorer si on
// est pressé. Volontairement léger — pas de bouton Présent/Absent ni de
// détail d'événement ici, ça vit déjà dans le calendrier juste en dessous
// et dans sa propre carte ; dupliquer ça referait exactement le problème de
// la carte "Prochaine convocation" retirée le même jour ("on simplifie le
// visuel").
const DAY_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function weekSummary(events: AdminUpcomingEvent[], today: Date, in7Days: Date): string {
  const upcoming = events.filter((e) => {
    const t = new Date(e.start_time);
    return t >= today && t < in7Days;
  });
  if (upcoming.length === 0) return "Rien de prévu dans les 7 prochains jours.";
  let trainings = 0;
  let matches = 0;
  let others = 0;
  upcoming.forEach((e) => {
    if (e.event_type === "TRAINING") trainings += 1;
    else if (e.event_type === "MATCH" || e.event_type === "FRIENDLY") matches += 1;
    else others += 1;
  });
  const parts: string[] = [];
  if (trainings > 0) parts.push(`${trainings} entraînement${trainings > 1 ? "s" : ""}`);
  if (matches > 0) parts.push(`${matches} match${matches > 1 ? "s" : ""}`);
  if (others > 0) parts.push(`${others} autre${others > 1 ? "s" : ""} événement${others > 1 ? "s" : ""}`);
  return `Cette semaine : ${parts.join(", ")}.`;
}

export default function FamilyWeekBanner({ events }: { events: AdminUpcomingEvent[] }) {
  const today = startOfDay(new Date());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });
  const in7Days = new Date(today);
  in7Days.setDate(in7Days.getDate() + 7);
  const summary = weekSummary(events, today, in7Days);

  // Types d'événements présents chaque jour (pour les pastilles), pas plus
  // d'un même type deux fois — un jour avec 3 entraînements n'a besoin que
  // d'une seule pastille verte.
  const typesByDay = days.map((d) => {
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const types = new Set(
      events
        .filter((e) => {
          const t = new Date(e.start_time);
          return t >= d && t < next;
        })
        .map((e) => e.event_type ?? "OTHER")
    );
    return Array.from(types);
  });

  return (
    <div className="rounded-2xl bg-gradient-to-br from-navy to-navy-dark p-5 text-white shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-ubac-yellow">
        Cette semaine
      </p>
      <p className="mt-1 text-lg font-bold">{summary}</p>
      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {days.map((d, i) => {
          const isToday = i === 0;
          return (
            <div
              key={d.toISOString()}
              className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-center ${
                isToday ? "bg-ubac-yellow text-navy-dark" : "bg-white/10 text-white/70"
              }`}
            >
              <span className="text-[10px] font-semibold uppercase">
                {DAY_LETTERS[(d.getDay() + 6) % 7]}
              </span>
              <span className="text-sm font-bold">{d.getDate()}</span>
              <span className="flex h-1.5 items-center gap-0.5">
                {typesByDay[i].map((type) => (
                  <span
                    key={type}
                    className={`h-1.5 w-1.5 rounded-full ${
                      isToday ? "bg-navy-dark/60" : styleFor(type).pill.split(" ")[0]
                    }`}
                  />
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
