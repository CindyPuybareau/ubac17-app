"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Dumbbell, Handshake, Sparkles, Trophy, Users } from "lucide-react";
import { AttendanceHero } from "./attendance-hero";
import { createClient } from "@/lib/supabase/client";
import { getCurrentSeasonWindow } from "@/lib/season";
import { sortTeamsByGroup, teamLabel } from "@/lib/teams";
import SelectDropdown from "./select-dropdown";
import TeamSelectorPills from "./team-selector-pills";
import { ParticipationTable, VolunteerTable } from "./season-bilan-tables";
import { seasonParticipationFromRows } from "./season-bilan";
import type {
  SeasonAttendance,
  SeasonGuestVolunteer,
  SeasonParticipationRow,
  SeasonParticipationTally,
  SeasonVolunteerTally,
} from "./season-bilan";

type TeamParticipation =
  | {
      attendanceByPlayerId: Record<string, SeasonAttendance>;
      participationByPlayerId: Record<string, SeasonParticipationTally>;
    }
  | "error";
import type { RosterPlayer } from "./team-manager";
import type { AdminUpcomingEvent } from "./page";

type SubTab = "joueurs" | "benevoles";

export type BilanTeamRoster = {
  team: { id: string; name: string | null; category: string | null };
  roster: RosterPlayer[];
};

// "Bilan de la saison" (retour de Cindy du 24/09, refonte "Organisation &
// Bilan") : "Planning & Rôles" a disparu (carte "prochain match" et liste
// "prochains événements" déjà couvertes par Calendrier -- plus rien de
// propre à garder) et l'ancien tableau de rôles Maillots/Table de marque
// (catalogue archivé, 0 rôle actif en base) est remplacé par deux volets
// réellement vivants : la participation aux événements (assiduité + matchs
// officiels/amicaux/tournois/autres) et le bénévolat (besoins classiques,
// rôles officiels, covoiturage proposé) -- voir season-bilan.ts et
// season-bilan-tables.tsx. Un seul composant pour les deux espaces
// concernés (retour de Cindy) : côté Coach, `teams` porte les équipes
// coachées ; côté Bureau (admin-view.tsx), le club entier -- le sélecteur
// de pastilles au-dessus du tableau fonctionne à l'identique dans les deux
// cas (une équipe affichée à la fois), seul le nombre de pastilles change.
export default function SeasonBilanPanel({
  teams,
  events,
  rsvpStatusByKey,
  volunteerTallyByPlayerId,
  volunteerGuestEntries,
  forcedTab,
}: {
  teams: BilanTeamRoster[];
  events: AdminUpcomingEvent[];
  rsvpStatusByKey: Record<string, string>;
  volunteerTallyByPlayerId: Record<string, SeasonVolunteerTally>;
  // Bénévoles qui écrivent leur propre nom (ou choisis par le Bureau/Coach
  // sans compte club) -- retour de Cindy du 24/09 ("Greg Martin a voté pour
  // le goûter... il n'apparaît pas ?") : rattachés à leur équipe ci-dessous
  // via l'event_id de chaque inscription, pas de player_id pour les
  // indexer autrement.
  volunteerGuestEntries: SeasonGuestVolunteer[];
  // Retour de Cindy du 2026-08-22 : "Organisation et Bilan" éclatée en
  // entrées du menu latéral ("Joueurs" / "Bénévoles") plutôt qu'un choix
  // d'onglet en haut de page — même convention que `forcedView` sur
  // CalendarView. Non fourni : conserve un choix d'onglet interne.
  forcedTab?: SubTab;
}) {
  const [tab, setTab] = useState<SubTab>(forcedTab ?? "joueurs");
  const shownTab = forcedTab ?? tab;

  // Retrouver l'équipe d'un bénévole "invité" à partir de l'event_id de son
  // inscription (guestEntries n'a pas de player_id à rattacher à un
  // roster) -- construit une seule fois, réutilisé pour chaque équipe
  // affichée ci-dessous, aucune requête de plus.
  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const sortedTeams = useMemo(() => sortTeamsByGroup(teams.map((t) => t.team)), [teams]);
  const [activeTeamId, setActiveTeamId] = useState<string | undefined>(sortedTeams[0]?.id);
  const activeTeamIdResolved = sortedTeams.some((t) => t.id === activeTeamId)
    ? activeTeamId
    : sortedTeams[0]?.id;
  const visibleTeams =
    sortedTeams.length > 1 ? teams.filter((t) => t.team.id === activeTeamIdResolved) : teams;

  // Participation sur la SAISON (retour de Cindy du 13/11) : calculée en
  // base (season_participation), une requête par équipe affichée, gardée
  // en mémoire par équipe. `events`/`rsvpStatusByKey` changent à chaque
  // rafraîchissement temps réel (router.refresh) : on recalcule alors,
  // pour qu'un "présent" saisi ailleurs se voie ici aussi.
  const supabase = useMemo(() => createClient(), []);
  const [participationByTeamId, setParticipationByTeamId] = useState<Record<string, TeamParticipation>>({});
  // Clés texte plutôt que l'objet équipe : `teams` est reconstruit à chaque
  // rendu du parent, ce qui relancerait la requête pour rien.
  const activeTeamKey = visibleTeams[0]?.team.id ?? "";
  const activeRosterKey = visibleTeams[0]?.roster.map((p) => p.id).join(",") ?? "";
  useEffect(() => {
    if (shownTab !== "joueurs" || !activeTeamKey) return;
    const teamId = activeTeamKey;
    const playerIds = activeRosterKey ? activeRosterKey.split(",") : [];
    let stale = false;
    supabase
      .rpc("season_participation", { p_team_ids: [teamId], p_from: getCurrentSeasonWindow().startIso })
      .then(({ data, error }) => {
        if (stale) return;
        setParticipationByTeamId((prev) => ({
          ...prev,
          [teamId]: error ? "error" : seasonParticipationFromRows((data ?? []) as SeasonParticipationRow[], playerIds),
        }));
      });
    return () => {
      stale = true;
    };
  }, [shownTab, activeTeamKey, activeRosterKey, supabase, events, rsvpStatusByKey]);

  if (teams.length === 0) {
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

  // Bénévoles "invités" de CETTE équipe (retour de Cindy du 24/09) :
  // guestEntries n'a pas de player_id à rattacher à un roster -- on
  // retrouve l'équipe de chaque inscription via son event_id (eventById),
  // puis on regroupe par nom (un même invité peut s'être proposé plusieurs
  // fois cette saison) pour obtenir une ligne par personne, même forme que
  // tallyByPlayerId pour être affichée par le même composant.
  function guestTalliesForTeam(teamId: string): { name: string; tally: SeasonVolunteerTally }[] {
    const byName = new Map<string, SeasonVolunteerTally>();
    volunteerGuestEntries.forEach((entry) => {
      const event = eventById.get(entry.eventId);
      if (!event) return;
      const concerned = event.teamId === teamId || (event.targetTeamIds?.includes(teamId) ?? false);
      if (!concerned) return;
      const tally = byName.get(entry.name) ?? { byRoleCode: {}, byOfficialCode: {}, covoiturage: 0 };
      const bucket = entry.category === "classique" ? tally.byRoleCode : tally.byOfficialCode;
      bucket[entry.code] = (bucket[entry.code] ?? 0) + 1;
      byName.set(entry.name, tally);
    });
    return Array.from(byName, ([name, tally]) => ({ name, tally }));
  }

  return (
    <div className="flex flex-col gap-4">
      {!forcedTab && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setTab("joueurs")} className={tabButtonClass(tab === "joueurs")}>
            Joueurs
          </button>
          <button onClick={() => setTab("benevoles")} className={tabButtonClass(tab === "benevoles")}>
            Bénévoles
          </button>
        </div>
      )}

      {/* Téléphone (retour de Cindy du 13/11) : un menu plutôt que 4-5
          lignes de pastilles avant d'arriver au tableau. */}
      {sortedTeams.length > 1 && (
        <div className="md:hidden">
          <SelectDropdown
            icon={Users}
            options={sortedTeams.map((t) => ({ value: t.id, label: teamLabel(t) }))}
            value={activeTeamIdResolved ?? ""}
            onChange={setActiveTeamId}
          />
        </div>
      )}
      <div className="hidden md:block">
        <TeamSelectorPills teams={sortedTeams} activeId={activeTeamIdResolved} onSelect={setActiveTeamId} />
      </div>

      <p className="text-xs text-zinc-500">
        {shownTab === "joueurs"
          ? "Depuis le début de la saison. Une absence de réponse compte comme une absence."
          : "Bénévolat depuis le début de la saison, classé du plus au moins actif."}
      </p>

      <div className="flex flex-col gap-4">
        {visibleTeams.map(({ team, roster }) => {
          const participation = participationByTeamId[team.id];
          return (
            // Téléphone : pas de cadre blanc autour (retour de Cindy du
            // 13/11) -- les cartes par personne reposent directement sur le
            // fond, comme les cartes du calendrier, et gagnent en largeur.
            <div key={team.id} className="md:rounded-2xl md:border md:border-zinc-100 md:bg-white md:p-5 md:shadow-sm">
              <p className="mb-1 text-sm font-semibold text-zinc-900">
                {team.name ?? "Équipe"}
                {team.category && team.category !== team.name && (
                  <span className="text-xs font-medium text-zinc-400"> · {team.category}</span>
                )}
              </p>
              {shownTab === "joueurs" ? (
                participation === undefined ? (
                  // Formes grises animées plutôt que "Calcul en cours…"
                  // (retour de Cindy du 13/11) : la page garde sa forme
                  // pendant le chargement.
                  <div className="flex flex-col gap-2" aria-label="Chargement du bilan">
                    <div className="h-28 animate-pulse rounded-2xl bg-zinc-200/70 motion-reduce:animate-none" />
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-20 animate-pulse rounded-2xl bg-zinc-200/50 motion-reduce:animate-none" />
                    ))}
                  </div>
                ) : participation === "error" ? (
                  <p className="py-6 text-center text-sm text-red-600">
                    Le bilan n&apos;a pas pu être calculé. Rechargez la page pour réessayer.
                  </p>
                ) : (
                  <>
                    <TeamParticipationSummary
                      roster={roster.map((p) => p.id)}
                      attendanceByPlayerId={participation.attendanceByPlayerId}
                      participationByPlayerId={participation.participationByPlayerId}
                    />
                    <ParticipationTable
                      roster={roster}
                      attendanceByPlayerId={participation.attendanceByPlayerId}
                      tallyByPlayerId={participation.participationByPlayerId}
                    />
                  </>
                )
              ) : (
                <VolunteerTable
                  roster={roster}
                  tallyByPlayerId={volunteerTallyByPlayerId}
                  guestTallies={guestTalliesForTeam(team.id)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Résumé de l'équipe en tête du tableau (retour de Cindy du 13/11) : nombre
// d'entraînements et de matchs de la saison, et présence moyenne aux
// entraînements (même règle que le tableau de bord : présents / effectif x
// entraînements).
function TeamParticipationSummary({
  roster,
  attendanceByPlayerId,
  participationByPlayerId,
}: {
  roster: string[];
  attendanceByPlayerId: Record<string, SeasonAttendance>;
  participationByPlayerId: Record<string, SeasonParticipationTally>;
}) {
  let present = 0;
  let expected = 0;
  let trainings = 0;
  const totals = { official: 0, friendly: 0, tournament: 0, other: 0 };
  roster.forEach((id) => {
    const a = attendanceByPlayerId[id];
    if (a) {
      present += a.present;
      expected += a.total;
      trainings = Math.max(trainings, a.total);
    }
    const t = participationByPlayerId[id];
    if (t) {
      (Object.keys(totals) as (keyof typeof totals)[]).forEach((k) => {
        totals[k] = Math.max(totals[k], t[k].total);
      });
    }
  });  // Retour de Cindy du 13/11 ("plus touchy, plus sexy") : bandeau bleu de
  // l'appli avec un anneau de progression coloré selon le taux (vert / orange
  // / rouge, mêmes seuils que les barres des joueurs), puis le nombre de
  // rendez-vous de la saison en cases à icône de couleur.
  const counts = [
    { key: "training", label: trainings > 1 ? "Entraînements" : "Entraînement", value: trainings, Icon: Dumbbell, tone: "bg-court-green/10 text-court-green" },
    { key: "official", label: totals.official > 1 ? "Officiels" : "Officiel", value: totals.official, Icon: Trophy, tone: "bg-navy/10 text-navy" },
    { key: "friendly", label: totals.friendly > 1 ? "Amicaux" : "Amical", value: totals.friendly, Icon: Handshake, tone: "bg-blue-50 text-blue-600" },
    { key: "tournament", label: totals.tournament > 1 ? "Tournois" : "Tournoi", value: totals.tournament, Icon: Sparkles, tone: "bg-ubac-yellow/20 text-ubac-yellow-dark" },
    { key: "other", label: totals.other > 1 ? "Autres" : "Autre", value: totals.other, Icon: CalendarDays, tone: "bg-zinc-100 text-zinc-600" },
  ].filter((c) => c.key === "training" || c.value > 0);
  const rate = expected > 0 ? (present / expected) * 100 : null;
  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm md:flex md:items-stretch">
      <AttendanceHero title="Entraînements de la saison" rate={rate} className="md:min-w-[18rem]" />
      {/* 4 cases : 2 x 2 plutôt que 3 + 1 seule sur sa ligne. */}
      <div
        className={`grid flex-1 gap-2 p-3 md:flex md:items-center md:gap-3 md:px-4 ${
          counts.length === 1 ? "grid-cols-1" : counts.length === 2 || counts.length === 4 ? "grid-cols-2" : "grid-cols-3"
        }`}
      >
        {counts.map(({ key, label, value, Icon, tone }) => (
          <div
            key={key}
            className="flex flex-col items-center gap-1 rounded-xl bg-zinc-50 px-1.5 py-2 text-center md:min-w-[6.5rem]"
          >
            <span className={`flex h-7 w-7 items-center justify-center rounded-full ${tone}`}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="text-lg font-bold leading-none tabular-nums text-zinc-900">{value}</span>
            <span className="text-[11px] font-medium leading-tight text-zinc-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
