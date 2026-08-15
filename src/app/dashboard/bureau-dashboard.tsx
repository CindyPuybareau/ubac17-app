import { CalendarDays, MapPin, ShieldAlert, Users, Wallet } from "lucide-react";
import { teamLabel } from "@/lib/teams";
import { balanceDue, computeStatus, formatAmount } from "./cotisation-participants-table";
import { formatEventTime, isMatchType, styleFor } from "./event-style";
import OpponentDisplay from "./opponent-display";
import SalleBadge from "./salle-badge";
import type { AdminCotisation, AdminMember, AdminUpcomingEvent } from "./page";
import type { TeamWithMembers } from "./team-manager";

function KpiCard({
  icon: Icon,
  iconClass,
  value,
  label,
}: {
  icon: typeof Wallet;
  iconClass: string;
  value: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
      <Icon className={`h-5 w-5 shrink-0 ${iconClass}`} />
      <p className="text-xl font-bold text-zinc-900 sm:text-2xl">{value}</p>
      <p className="text-xs font-medium leading-tight text-zinc-500">{label}</p>
    </div>
  );
}

// Vue d'ensemble condensée, pensée pour répondre en un coup d'œil à "quoi
// de neuf, où est-ce que ça coince ?" sans avoir à ouvrir 3 onglets —
// jusqu'ici le Bureau atterrissait directement sur Calendrier, sans aucun
// résumé. Entièrement dérivée des données déjà chargées pour les autres
// onglets (cotisations, membres, équipes, calendrier) : aucune requête
// supplémentaire pour cette première version.
export default function BureauDashboard({
  cotisations,
  members,
  teams,
  events,
}: {
  cotisations: AdminCotisation[];
  members: AdminMember[];
  teams: TeamWithMembers[];
  events: AdminUpcomingEvent[];
}) {
  // Même périmètre que l'onglet Cotisations & Licences (KpiHeader) : les
  // stages/événements/boutique (collecteId non nul) ont leur propre suivi
  // dans l'onglet Collectes, pas la peine de les mélanger ici.
  const seasonCotisations = cotisations.filter((c) => !c.collecteId);
  const pending = seasonCotisations.filter((c) => {
    const status = computeStatus(c);
    return status === "EN_ATTENTE" || status === "PARTIEL";
  });
  const pendingAmount = pending.reduce((sum, c) => sum + balanceDue(c), 0);

  const activeMembers = members.filter((m) => !m.archivedAt).length;

  const teamsWithoutCoach = teams.filter(
    (t) => t.coaches.length === 0 && t.pendingCoaches.length === 0
  );

  // Seuil "aujourd'hui à minuit", même logique que calendar-view.tsx : un
  // match du matin ne doit pas disparaître du tableau de bord l'après-midi
  // même.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const nextEvent = [...events]
    .filter((e) => new Date(e.start_time).getTime() >= startOfToday.getTime())
    .sort((a, b) => a.start_time.localeCompare(b.start_time))[0];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Bienvenue</h2>
        <p className="text-sm text-zinc-500">Vue d&apos;ensemble du club, en un coup d&apos;œil.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          icon={Wallet}
          iconClass="text-rose-600"
          value={String(pending.length)}
          label="Cotisations en attente"
        />
        <KpiCard
          icon={Wallet}
          iconClass="text-amber-700"
          value={formatAmount(pendingAmount)}
          label="Montant en attente"
        />
        <KpiCard
          icon={ShieldAlert}
          iconClass="text-amber-600"
          value={String(teamsWithoutCoach.length)}
          label="Équipes sans coach"
        />
        <KpiCard
          icon={Users}
          iconClass="text-navy"
          value={String(activeMembers)}
          label="Membres actifs"
        />
      </div>

      {nextEvent &&
        (() => {
          const style = styleFor(nextEvent.event_type);
          return (
            <div
              className={`rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm border-l-4 ${style.border}`}
            >
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                Prochain événement
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}
                >
                  {style.label}
                </span>
                <span className="text-xs font-semibold text-zinc-500">{nextEvent.teamName}</span>
              </div>
              <p className="mt-1 font-semibold text-zinc-900">
                {isMatchType(nextEvent.event_type) ? (
                  <OpponentDisplay title={nextEvent.title} size="sm" />
                ) : (
                  nextEvent.title ?? style.label
                )}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
                <span>
                  {new Date(nextEvent.start_time).toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                  , {formatEventTime(nextEvent.start_time, nextEvent.end_time)}
                </span>
                {nextEvent.salle ? (
                  <SalleBadge salle={nextEvent.salle} />
                ) : (
                  nextEvent.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {nextEvent.location}
                    </span>
                  )
                )}
              </div>
            </div>
          );
        })()}

      {teamsWithoutCoach.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
            Équipes sans coach assigné
          </p>
          <div className="flex flex-wrap gap-1.5">
            {teamsWithoutCoach.map((t) => (
              <span
                key={t.id}
                className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 shadow-sm"
              >
                {teamLabel(t)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
