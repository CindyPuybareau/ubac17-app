"use client";

import { useMemo, useState } from "react";
import { CalendarCheck2, CalendarDays, ChevronDown, ChevronUp, Trophy } from "lucide-react";
import { useScrollTopOnChange } from "@/lib/use-scroll-top-on-change";
import { formatPersonName } from "@/lib/names";
import CoachNextMatchCard from "./coach-next-match-card";
import NextConvocationCard from "./next-convocation-card";
import { formatEventTime, styleFor } from "./calendar-view";
import { rolesForEventType } from "./event-tasks";
import SalleBadge from "./salle-badge";
import type { ConvocationCard, RosterPlayer, RsvpCounts, UpcomingEvent } from "./family-data";
import TaskSourceBadge from "./task-source-badge";
import RoleIcon from "./role-icon";
import type {
  CarpoolOffer,
  EventTasksState,
  EventRoleType,
  SeasonTaskTally,
  TaskAssignment,
} from "./event-tasks";
import type { VolunteerNeed } from "./event-volunteer-needs";
import type { AdminUpcomingEvent } from "./page";

const emptyEventTasks: EventTasksState = {};

export type CoachTeamMatchCard = {
  team: { id: string; name: string | null; category: string | null };
  event: UpcomingEvent | null;
  counts: RsvpCounts | null;
  roster: RosterPlayer[];
};

type SubTab = "planning" | "bilan";
// "name" ou le code d un role du catalogue.
type SortKey = string;

function fullName(p: RosterPlayer) {
  return formatPersonName(p.first_name, p.last_name);
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// Un rôle non attribué doit se voir : c'est justement la ligne sur
// laquelle le coach doit agir.
function TaskCell({ assignment }: { assignment: TaskAssignment }) {
  if (!assignment) {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        À attribuer
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-sm text-zinc-700">{assignment.playerName}</span>
      <TaskSourceBadge source={assignment.source} />
    </span>
  );
}

function PlanningTab({
  cards,
  tasksByEventId,
  carpoolByEventId,
  volunteerNeedsByEventId,
  upcomingEvents,
  rsvpStatusByKey,
  rsvpReasonByKey,
  roles,
  ownPlayerId,
  ownPlayerNextEvent,
}: {
  cards: CoachTeamMatchCard[];
  tasksByEventId: Record<string, EventTasksState>;
  carpoolByEventId: Record<string, CarpoolOffer[]>;
  volunteerNeedsByEventId: Record<string, VolunteerNeed[]>;
  upcomingEvents: AdminUpcomingEvent[];
  rsvpStatusByKey: Record<string, string>;
  rsvpReasonByKey: Record<string, string | null>;
  roles: EventRoleType[];
  ownPlayerId: string | null;
  // Le prochain événement du coach lui-même, sur une équipe qu'il ne
  // coache pas (ex. Basile, joueur Séniors 1) — fusionné et trié par date
  // avec les cartes d'équipes coachées ci-dessous, pas relégué à part :
  // retour de Cindy du 2026-08-20, "ça devrait apparaître en premier
  // puisque c'est le prochain événement de son profil".
  ownPlayerNextEvent: ConvocationCard | null;
}) {
  type PlanningCardItem =
    | { kind: "team"; sortDate: string | null; card: CoachTeamMatchCard }
    | { kind: "own"; sortDate: string; card: ConvocationCard };

  const planningItems: PlanningCardItem[] = [
    ...cards.map((c): PlanningCardItem => ({ kind: "team", sortDate: c.event?.start_time ?? null, card: c })),
    ...(ownPlayerNextEvent
      ? [{ kind: "own" as const, sortDate: ownPlayerNextEvent.event.start_time, card: ownPlayerNextEvent }]
      : []),
  ].sort((a, b) => {
    // Sans date (aucun événement à venir pour cette équipe), la carte
    // reste en fin de liste plutôt que de fausser le tri chronologique.
    if (a.sortDate === null && b.sortDate === null) return 0;
    if (a.sortDate === null) return 1;
    if (b.sortDate === null) return -1;
    return a.sortDate.localeCompare(b.sortDate);
  });

  return (
    <div className="flex flex-col gap-4">
      {planningItems.map((item) =>
        item.kind === "team" ? (
          <CoachNextMatchCard
            key={item.card.team.id}
            teamName={`${item.card.team.name ?? "Équipe"}${
              item.card.team.category && item.card.team.category !== item.card.team.name
                ? ` · ${item.card.team.category}`
                : ""
            }`}
            event={item.card.event}
            counts={item.card.counts}
            roster={item.card.roster}
            tasks={item.card.event ? (tasksByEventId[item.card.event.id] ?? emptyEventTasks) : emptyEventTasks}
            carpool={item.card.event ? (carpoolByEventId[item.card.event.id] ?? []) : []}
            volunteerNeeds={item.card.event ? (volunteerNeedsByEventId[item.card.event.id] ?? []) : []}
            rsvpStatusByKey={rsvpStatusByKey}
            rsvpReasonByKey={rsvpReasonByKey}
            roles={roles}
            // Ce coach est-il lui-même sur CETTE équipe précise ? (il peut
            // coacher plusieurs équipes sans jouer dans toutes.)
            selfPlayerId={
              ownPlayerId && item.card.roster.some((p) => p.id === ownPlayerId) ? ownPlayerId : null
            }
          />
        ) : (
          <NextConvocationCard
            key={`own-${item.card.player.id}`}
            playerName={item.card.player.name}
            playerId={item.card.player.id}
            event={item.card.event}
            status={item.card.status}
            // canAssignAnyone reste faux côté NextConvocationCard : ici le
            // coach n'est que joueur, pas gestionnaire de cette équipe —
            // pas besoin du roster complet pour le sélecteur d'attribution
            // qu'il ne verra jamais.
            roster={[]}
            tasks={tasksByEventId[item.card.event.id] ?? emptyEventTasks}
            carpool={carpoolByEventId[item.card.event.id] ?? []}
            roles={roles}
            volunteerNeeds={volunteerNeedsByEventId[item.card.event.id] ?? []}
          />
        )
      )}

      <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm sm:p-5">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <CalendarDays className="h-3.5 w-3.5 text-blue-700" />
          Prochains événements
        </p>
        <p className="mb-3 text-[11px] text-zinc-400">
          Qui lave les maillots, qui apporte le goûter — pour chaque date à venir.
        </p>

        {upcomingEvents.length === 0 ? (
          <p className="text-sm text-zinc-400">Aucun événement à venir.</p>
        ) : (
          <div className="w-full overflow-x-auto rounded-xl border border-zinc-100">
            <table className="w-full table-auto border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  <th className="whitespace-nowrap px-3 py-2.5">Date</th>
                  <th className="whitespace-nowrap px-3 py-2.5">Heure</th>
                  <th className="whitespace-nowrap px-3 py-2.5">Type</th>
                  <th className="w-auto px-3 py-2.5">Équipe &amp; lieu</th>
                  {roles.map((role) => (
                    <th key={role.code} className="whitespace-nowrap px-3 py-2.5">
                      <span className="flex items-center gap-1">
                        <RoleIcon icon={role.icon} className="h-3.5 w-3.5 shrink-0" />
                        {role.label}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {upcomingEvents.map((e) => {
                  const style = styleFor(e.event_type);
                  const tasks = tasksByEventId[e.id] ?? emptyEventTasks;
                  // Un role restreint a certains types ne concerne pas cet
                  // evenement : afficher "A attribuer" y appellerait a une
                  // action impossible.
                  const applicable = new Set(
                    rolesForEventType(roles, e.event_type).map((r) => r.code)
                  );
                  return (
                    <tr key={e.id} className="border-b border-zinc-50 last:border-0">
                      <td className="whitespace-nowrap px-3 py-2.5 font-medium text-zinc-900">
                        {formatDay(e.start_time)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-zinc-600">
                        {formatEventTime(e.start_time, e.end_time)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span
                          className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none ${style.badge}`}
                        >
                          {style.label}
                        </span>
                      </td>
                      <td className="w-auto px-3 py-2.5 text-zinc-600">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-zinc-800">{e.teamName}</span>
                          {e.salle ? (
                            <SalleBadge salle={e.salle} />
                          ) : e.location ? (
                            <span className="truncate text-xs text-zinc-500">{e.location}</span>
                          ) : null}
                        </span>
                      </td>
                      {roles.map((role) => (
                        <td key={role.code} className="whitespace-nowrap px-3 py-2.5">
                          {applicable.has(role.code) ? (
                            <TaskCell assignment={tasks[role.code] ?? null} />
                          ) : (
                            <span className="text-zinc-300">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function BilanTeamTable({
  team,
  roster,
  tally,
  roles,
  events,
  rsvpStatusByKey,
}: {
  team: CoachTeamMatchCard["team"];
  roster: RosterPlayer[];
  tally: SeasonTaskTally;
  roles: EventRoleType[];
  // Pour calculer l'assiduité : les rassemblements passés de cette équipe
  // et qui a répondu quoi. Même source que le reste de l'appli — pas une
  // requête séparée qui pourrait diverger.
  events: AdminUpcomingEvent[];
  rsvpStatusByKey: Record<string, string>;
}) {
  // Par défaut : l'assiduité la plus faible en premier — la vraie question
  // que se pose un coach en ouvrant ce bilan, avant même de savoir qui a
  // lavé les maillots.
  const [sortKey, setSortKey] = useState<SortKey>("attendance");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    setSortDir(key === "name" ? "asc" : "asc");
  }

  // Une réponse "en attente" (jamais répondu) ne compte ni pour ni contre :
  // seule une réponse donnée dit quelque chose sur l'assiduité réelle.
  const pastEvents = useMemo(() => {
    const nowMs = Date.now();
    return events.filter(
      (e) => e.teamId === team.id && new Date(e.start_time).getTime() < nowMs
    );
  }, [events, team.id]);

  const rows = useMemo(() => {
    const list = roster.map((p) => {
      let present = 0;
      let total = 0;
      pastEvents.forEach((e) => {
        const status = rsvpStatusByKey[`${e.id}:${p.id}`];
        if (!status || status === "PENDING") return;
        total += 1;
        if (status === "PRESENT" || status === "LATE") present += 1;
      });
      return {
        id: p.id,
        name: fullName(p),
        counts: tally[p.id] ?? {},
        attendance: { present, total },
      };
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name, "fr") * dir;
      if (sortKey === "attendance") {
        const rateA = a.attendance.total > 0 ? a.attendance.present / a.attendance.total : null;
        const rateB = b.attendance.total > 0 ? b.attendance.present / b.attendance.total : null;
        // Sans historique : ni bon ni mauvais élève, toujours en dernier
        // plutôt que de fausser un classement par manque de données.
        if (rateA === null && rateB === null) return a.name.localeCompare(b.name, "fr");
        if (rateA === null) return 1;
        if (rateB === null) return -1;
        const diff = (rateA - rateB) * dir;
        return diff !== 0 ? diff : a.name.localeCompare(b.name, "fr");
      }
      const diff = ((a.counts[sortKey] ?? 0) - (b.counts[sortKey] ?? 0)) * dir;
      return diff !== 0 ? diff : a.name.localeCompare(b.name, "fr");
    });
  }, [roster, tally, pastEvents, rsvpStatusByKey, sortKey, sortDir]);

  // Un total par rôle du catalogue, y compris les rôles créés par le club.
  const totals = roles.map((role) => ({
    role,
    total: rows.reduce((sum, r) => sum + (r.counts[role.code] ?? 0), 0),
  }));

  // La key vit ici : les colonnes de rôle sont produites par un .map, et
  // sans elle React réutilise mal les <th> quand le catalogue change.
  const header = (key: SortKey, label: string, icon?: React.ReactNode) => (
    <th key={key} className="whitespace-nowrap px-3 py-2.5">
      <button
        onClick={() => toggleSort(key)}
        className="flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-navy"
      >
        {icon}
        {label}
        {sortKey === key &&
          (sortDir === "asc" ? (
            <ChevronUp className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          ))}
      </button>
    </th>
  );

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
          <Trophy className="h-4 w-4 shrink-0 text-ubac-yellow-dark" />
          {team.name ?? "Équipe"}
          {team.category && team.category !== team.name && (
            <span className="text-xs font-medium text-zinc-400">· {team.category}</span>
          )}
        </p>
        <p className="text-xs text-zinc-500">
          {totals.map((t) => `${t.total} ${t.role.label.toLowerCase()}`).join(" · ")}
          {totals.length > 0 ? " sur la saison" : ""}
        </p>
      </div>

      <div className="w-full overflow-x-auto rounded-xl border border-zinc-100">
        <table className="w-full table-auto border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-semibold text-zinc-400">
              {header("name", "Famille / Joueur")}
              {header("attendance", "Assiduité", <CalendarCheck2 className="h-3.5 w-3.5 shrink-0" />)}
              {roles.map((role) =>
                header(role.code, role.label, <RoleIcon icon={role.icon} className="h-3.5 w-3.5 shrink-0" />)
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rate = r.attendance.total > 0 ? r.attendance.present / r.attendance.total : null;
              const rateClass =
                rate === null
                  ? "text-zinc-300"
                  : rate < 0.5
                    ? "text-red-600"
                    : rate < 0.8
                      ? "text-amber-600"
                      : "text-emerald-700";
              return (
              <tr key={r.id} className="border-b border-zinc-50 last:border-0">
                <td className="w-auto px-3 py-2.5 font-semibold text-zinc-800">{r.name}</td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {rate === null ? (
                    <span className="text-zinc-300">—</span>
                  ) : (
                    <span className={`font-semibold tabular-nums ${rateClass}`}>
                      {r.attendance.present}/{r.attendance.total}
                    </span>
                  )}
                </td>
                {roles.map((role) => {
                  const count = r.counts[role.code] ?? 0;
                  return (
                    <td key={role.code} className="whitespace-nowrap px-3 py-2.5">
                      <span
                        className={`font-semibold ${count === 0 ? "text-zinc-300" : "text-zinc-900"}`}
                      >
                        {count}
                      </span>
                    </td>
                  );
                })}
              </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={roles.length + 2}
                  className="px-3 py-4 text-center text-sm text-zinc-400"
                >
                  Aucun joueur dans cette équipe
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CoachOrganisation({
  cards,
  tasksByEventId,
  carpoolByEventId,
  volunteerNeedsByEventId = {},
  events,
  taskTallyByTeamId,
  rsvpStatusByKey,
  rsvpReasonByKey,
  roles,
  ownPlayerId = null,
  ownPlayerNextEvent = null,
  forcedTab,
}: {
  cards: CoachTeamMatchCard[];
  tasksByEventId: Record<string, EventTasksState>;
  carpoolByEventId: Record<string, CarpoolOffer[]>;
  volunteerNeedsByEventId?: Record<string, VolunteerNeed[]>;
  events: AdminUpcomingEvent[];
  taskTallyByTeamId: Record<string, SeasonTaskTally>;
  rsvpStatusByKey: Record<string, string>;
  rsvpReasonByKey: Record<string, string | null>;
  roles: EventRoleType[];
  // La propre fiche joueur du coach (coach qui joue aussi) — permet à
  // MatchTasksPanel de le reconnaître sur ses propres matchs coachés, où
  // il n'était jusqu'ici jamais "lui-même" (voir CoachNextMatchCard).
  ownPlayerId?: string | null;
  // Son propre prochain événement en tant que joueur, sur une équipe qu'il
  // ne coache pas — voir PlanningTab plus haut.
  ownPlayerNextEvent?: ConvocationCard | null;
  // Retour de Cindy du 2026-08-22 : "Organisation et Bilan" éclatée en
  // deux entrées du menu latéral ("Planning & Rôles" / "Bilan de la
  // saison") plutôt qu'un choix d'onglet en haut de page — même
  // convention que `forcedView` sur CalendarView. Non fourni : conserve
  // l'ancien comportement (deux onglets internes, page "Organisation et
  // Bilan" seule dans coach-view.tsx pour compat, non utilisée après ce
  // découpage mais gardée pour ne pas casser un futur appelant simple).
  forcedTab?: SubTab;
}) {
  const [tab, setTab] = useState<SubTab>(forcedTab ?? "planning");
  useScrollTopOnChange(tab);

  // Filtré côté client : Date.now() dans un composant serveur rendrait le
  // rendu impur, et la liste reste juste après un router.refresh().
  const upcomingEvents = useMemo(() => {
    const nowMs = Date.now();
    return events
      .filter((e) => new Date(e.start_time).getTime() >= nowMs)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [events]);

  if (cards.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Aucune équipe ne t&apos;est rattachée pour le moment.
      </p>
    );
  }

  const tabButtonClass = (active: boolean) =>
    `flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
      active ? "bg-navy text-white" : "text-navy hover:bg-blue-50"
    }`;

  const shownTab = forcedTab ?? tab;

  return (
    <div className="flex flex-col gap-4">
      {!forcedTab && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setTab("planning")} className={tabButtonClass(tab === "planning")}>
            <CalendarDays className="h-3.5 w-3.5" />
            Planning &amp; Rôles
          </button>
          <button onClick={() => setTab("bilan")} className={tabButtonClass(tab === "bilan")}>
            <Trophy className="h-3.5 w-3.5" />
            Bilan de la saison
          </button>
        </div>
      )}

      {shownTab === "planning" ? (
        <PlanningTab
          cards={cards}
          tasksByEventId={tasksByEventId}
          carpoolByEventId={carpoolByEventId}
          volunteerNeedsByEventId={volunteerNeedsByEventId}
          upcomingEvents={upcomingEvents}
          rsvpStatusByKey={rsvpStatusByKey}
          rsvpReasonByKey={rsvpReasonByKey}
          roles={roles}
          ownPlayerId={ownPlayerId}
          ownPlayerNextEvent={ownPlayerNextEvent}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-zinc-500">
            Assiduité et rôles cumulés depuis le début de la saison. Cliquez sur une
            colonne pour trier — par défaut, l&apos;assiduité la plus faible apparaît en
            premier.
          </p>
          {cards.map(({ team, roster }) => (
            <BilanTeamTable
              key={team.id}
              team={team}
              roster={roster}
              tally={taskTallyByTeamId[team.id] ?? {}}
              roles={roles}
              events={events}
              rsvpStatusByKey={rsvpStatusByKey}
            />
          ))}
        </div>
      )}
    </div>
  );
}
