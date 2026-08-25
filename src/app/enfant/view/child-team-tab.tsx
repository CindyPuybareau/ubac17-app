import { Users } from "lucide-react";
import { avatarColor } from "@/lib/avatar-color";
import { formatFirstName, formatLastName, formatPersonName, sortByLastName } from "@/lib/names";
import { PlayerYearStatusBadge } from "@/app/dashboard/player-year-badge";
import type { ChildCoach, ChildTeammate } from "./child-dashboard";

// Retour de Cindy du 2026-08-25 ("l'espace équipe des parents pour les
// enfants... le tableau est pauvre", puis "je veux Nom, prénom, rôle,
// statut, catégorie") : même colonnes, même visuel que TeamCard côté
// Bureau/Coach/Parent (dashboard/team-card.tsx) — tableau groupé
// Coachs/Joueurs sur PC, cartes sur mobile. Nom de famille affiché
// (confirmé explicitement le 2026-08-25, question posée vu que c'était
// jusqu'ici délibérément masqué à l'enfant — seule la date de naissance
// reste neutralisée, voir ChildTeammate). Les présences au prochain
// rendez-vous ont quitté cet onglet ("rien à voir dans l'équipe") pour
// rejoindre les cartes d'événement des onglets Événements/Matchs
// officiels — voir child-events-tab.tsx / child-results-tab.tsx.
export default function ChildTeamTab({
  coaches,
  teammates,
}: {
  coaches: ChildCoach[];
  teammates: ChildTeammate[];
}) {
  const sortedCoaches = sortByLastName(coaches, (c) => c.lastName);
  const sortedTeammates = sortByLastName(teammates, (t) => t.lastName);

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <Users className="h-3.5 w-3.5 text-navy" />
        Mon équipe
      </p>

      {/* Tableau (≥640px) — même gabarit que TeamCard : deux sections
          groupées (Coachs puis Joueurs), fond teinté sur les lignes
          d'encadrement pour les distinguer d'un coup d'œil. */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
              <th className="px-3 py-2">Nom</th>
              <th className="px-3 py-2">Prénom</th>
              <th className="px-3 py-2">Rôle</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2">Catégorie</th>
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
                  {formatLastName(c.lastName) || "—"}
                </td>
                <td className="px-3 py-2.5 text-zinc-700">{c.firstName ? formatFirstName(c.firstName) : "—"}</td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-navy/10 px-2 py-0.5 text-xs font-semibold leading-none text-navy">
                    Coach
                  </span>
                </td>
                {/* Pas de statut année/rookie pour un coach : sa propre date
                    de naissance n'est pas récoltée côté Enfant (seule celle
                    des joueurs l'est, pour calculer LEUR statut) — même
                    "—" que côté Bureau quand la donnée manque. */}
                <td className="px-3 py-2.5 text-zinc-300">—</td>
                <td className="px-3 py-2.5">
                  {c.teamCategory ? (
                    <span className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold leading-none text-emerald-700">
                      {c.teamCategory}
                    </span>
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
                </td>
              </tr>
            ))}
            {sortedTeammates.length > 0 && (
              <tr>
                <td colSpan={5} className="bg-emerald-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-emerald-700">
                  Joueurs ({sortedTeammates.length})
                </td>
              </tr>
            )}
            {sortedTeammates.map((t) => (
              <tr
                key={t.id}
                className={`border-b border-zinc-50 last:border-0 ${t.isSelf ? "bg-ubac-yellow/10" : ""}`}
              >
                <td className="px-3 py-2.5 font-semibold text-zinc-900">
                  <span className="flex items-center gap-1.5">
                    {formatLastName(t.lastName) || "—"}
                    {t.isSelf && (
                      <span className="rounded-full bg-ubac-yellow px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-navy-dark">
                        Toi
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-zinc-700">{t.firstName ? formatFirstName(t.firstName) : "—"}</td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold leading-none text-emerald-700">
                    Joueur
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {t.yearStatus ? <PlayerYearStatusBadge status={t.yearStatus} /> : <span className="text-zinc-300">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  {t.teamCategory ? (
                    <span className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold leading-none text-emerald-700">
                      {t.teamCategory}
                    </span>
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cartes (<640px) — mêmes informations, réagencées verticalement. */}
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
              <span className="mt-0.5 flex flex-wrap items-center gap-1">
                <span className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-navy/10 px-2 py-0.5 text-xs font-semibold leading-none text-navy">
                  Coach
                </span>
                {c.teamCategory && (
                  <span className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold leading-none text-emerald-700">
                    {c.teamCategory}
                  </span>
                )}
              </span>
            </div>
          </div>
        ))}
        {sortedTeammates.length > 0 && (
          <p className="mt-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
            Joueurs ({sortedTeammates.length})
          </p>
        )}
        {sortedTeammates.map((t) => (
          <div
            key={t.id}
            className={`rounded-2xl border border-l-4 border-zinc-100 border-l-emerald-400 bg-white p-3 shadow-sm ${
              t.isSelf ? "bg-ubac-yellow/5" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="flex min-w-0 items-center gap-1.5 truncate font-semibold text-zinc-900">
                {formatPersonName(t.firstName, t.lastName)}
                {t.isSelf && (
                  <span className="shrink-0 rounded-full bg-ubac-yellow px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-navy-dark">
                    Toi
                  </span>
                )}
              </p>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {t.yearStatus && <PlayerYearStatusBadge status={t.yearStatus} />}
              {t.teamCategory && (
                <span className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold leading-none text-emerald-700">
                  {t.teamCategory}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
