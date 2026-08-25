import { Users } from "lucide-react";
import { avatarColor } from "@/lib/avatar-color";
import { formatFirstName, formatPersonName, sortByLastName } from "@/lib/names";
import { computePlayerYearStatus } from "@/lib/season";
import PlayerYearBadge from "@/app/dashboard/player-year-badge";
import { EventRow } from "./child-calendar-tab";
import type { ChildCoach, ChildEvent, ChildTeammate } from "./child-dashboard";

// Trombinoscope et présences : jamais de nom de famille exposé à l'enfant
// (choix de confidentialité délibéré, voir child-dashboard.tsx), donc le
// tri se fait sur le prénom plutôt que sur le nom comme partout ailleurs
// dans l'appli — c'est la seule identité affichée ici.
function sortByFirstName<T>(items: T[], getFirstName: (item: T) => string | null | undefined): T[] {
  return [...items].sort((a, b) =>
    formatFirstName(getFirstName(a)).localeCompare(formatFirstName(getFirstName(b)), "fr")
  );
}

// Retour de Cindy du 2026-08-25 ("l'espace équipe des parents pour les
// enfants... le tableau est pauvre") : même visuel que TeamCard côté
// Bureau/Coach/Parent (dashboard/team-card.tsx) — tableau groupé
// Coachs/Joueurs sur PC, cartes sur mobile — plutôt que la simple liste de
// coachs + liste de présences de l'ancienne version. Colonnes NOM et
// Catégorie retirées : pas de nom de famille exposé à l'enfant, et la
// catégorie est ici toujours la même (celle de sa propre équipe), déjà
// visible ailleurs sur la page — l'afficher sur chaque ligne n'aurait rien
// apporté. Maillot/Poste ajoutés à la place : déjà connus (team_players),
// jamais montrés nulle part côté Enfant jusqu'ici.
export default function ChildTeamTab({
  coaches,
  teammates,
  category,
  nextEvent,
  nextEventAttendance,
}: {
  coaches: ChildCoach[];
  teammates: ChildTeammate[];
  category: string | null;
  nextEvent: ChildEvent | null;
  nextEventAttendance: { name: string | null; status: string }[];
}) {
  const sortedCoaches = sortByLastName(coaches, (c) => c.lastName);
  const sortedTeammates = sortByFirstName(teammates, (t) => t.firstName);

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <Users className="h-3.5 w-3.5 text-navy" />
          Mon équipe
        </p>

        {/* Tableau (≥640px) — même gabarit que TeamCard : deux sections
            groupées (Coachs puis Joueurs), fond teinté sur les lignes
            d'encadrement pour les distinguer d'un coup d'œil. */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[460px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
                <th className="px-3 py-2">Prénom</th>
                <th className="px-3 py-2">Rôle</th>
                <th className="px-3 py-2">Maillot</th>
                <th className="px-3 py-2">Poste</th>
                <th className="px-3 py-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {sortedCoaches.length > 0 && (
                <tr>
                  <td colSpan={5} className="bg-navy/[0.06] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-navy">
                    Coachs ({sortedCoaches.length})
                  </td>
                </tr>
              )}
              {sortedCoaches.map((c) => (
                <tr key={c.id} className="border-b border-zinc-50 bg-navy/[0.04]">
                  <td className="border-l-4 border-l-navy px-3 py-2.5 font-semibold text-zinc-900">
                    {formatPersonName(c.firstName, c.lastName)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-navy/10 px-2 py-0.5 text-xs font-semibold leading-none text-navy">
                      Coach
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-zinc-300">—</td>
                  <td className="px-3 py-2.5 text-zinc-300">—</td>
                  <td className="px-3 py-2.5 text-zinc-300">—</td>
                </tr>
              ))}
              {sortedTeammates.length > 0 && (
                <tr>
                  <td colSpan={5} className="bg-emerald-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-emerald-700">
                    Joueurs ({sortedTeammates.length})
                  </td>
                </tr>
              )}
              {sortedTeammates.map((t) => {
                const yearStatus = computePlayerYearStatus(t.birthDate, category);
                return (
                  <tr
                    key={t.id}
                    className={`border-b border-zinc-50 last:border-0 ${t.isSelf ? "bg-ubac-yellow/10" : ""}`}
                  >
                    <td className="px-3 py-2.5 font-semibold text-zinc-900">
                      <span className="flex items-center gap-1.5">
                        {formatFirstName(t.firstName)}
                        {t.isSelf && (
                          <span className="rounded-full bg-ubac-yellow px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-navy-dark">
                            Toi
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold leading-none text-emerald-700">
                        Joueur
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-zinc-600">
                      {t.jerseyNumber != null ? `#${t.jerseyNumber}` : <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-600">
                      {t.position ?? <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {yearStatus ? (
                        <PlayerYearBadge birthDate={t.birthDate} category={category} />
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Cartes (<640px, retour de Cindy du 2026-08-24 sur le tableau des
            membres, même traitement demandé ici le 2026-08-25) — mêmes
            informations, réagencées verticalement. */}
        <div className="flex flex-col gap-2.5 sm:hidden">
          {sortedCoaches.length > 0 && (
            <p className="text-xs font-bold uppercase tracking-wide text-navy">
              Coachs ({sortedCoaches.length})
            </p>
          )}
          {sortedCoaches.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2.5 rounded-2xl border border-l-4 border-zinc-100 border-l-navy bg-white p-3 shadow-sm"
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${avatarColor(c.id)}`}
              >
                {(c.firstName ?? "?").charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-zinc-900">{formatPersonName(c.firstName, c.lastName)}</p>
                <span className="mt-0.5 inline-flex items-center justify-center whitespace-nowrap rounded-full bg-navy/10 px-2 py-0.5 text-xs font-semibold leading-none text-navy">
                  Coach
                </span>
              </div>
            </div>
          ))}
          {sortedTeammates.length > 0 && (
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
              Joueurs ({sortedTeammates.length})
            </p>
          )}
          {sortedTeammates.map((t) => {
            const yearStatus = computePlayerYearStatus(t.birthDate, category);
            return (
              <div
                key={t.id}
                className={`rounded-2xl border border-l-4 border-zinc-100 border-l-emerald-400 bg-white p-3 shadow-sm ${
                  t.isSelf ? "bg-ubac-yellow/5" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-1.5 truncate font-semibold text-zinc-900">
                    {formatFirstName(t.firstName)}
                    {t.isSelf && (
                      <span className="shrink-0 rounded-full bg-ubac-yellow px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-navy-dark">
                        Toi
                      </span>
                    )}
                  </p>
                  {yearStatus && <PlayerYearBadge birthDate={t.birthDate} category={category} />}
                </div>
                {(t.jerseyNumber != null || t.position) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                    {t.jerseyNumber != null && (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-semibold">#{t.jerseyNumber}</span>
                    )}
                    {t.position && <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-semibold">{t.position}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Retour de Cindy du 2026-08-25 ("préciser les présents ou absents
          dans une carte évènement concerné, que l'on comprenne mieux
          l'évènement dont il s'agit") : la liste de présences n'est plus un
          bloc générique séparé — elle vit maintenant à l'intérieur de la
          carte du prochain événement lui-même (même EventRow que le
          calendrier), avec son titre, sa date et son lieu juste au-dessus. */}
      {nextEvent && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Présences au prochain rendez-vous
          </p>
          <EventRow event={nextEvent} attendance={nextEventAttendance} />
        </div>
      )}
    </div>
  );
}
