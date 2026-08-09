"use client";

import { useState } from "react";
import { ClipboardList, Shirt } from "lucide-react";
import { teamLabel } from "@/lib/teams";
import { useScrollTopOnChange } from "@/lib/use-scroll-top-on-change";
import TeamCard from "./team-card";
import type { TeamWithMembers } from "./team-manager";
import type { AdminUpcomingEvent, MemberDetail } from "./page";
import type { SeasonTaskTally } from "./event-tasks";

type Person = { id: string; first_name: string | null; last_name: string | null };

export default function CoachTeams({
  teams,
  allProfiles,
  eventsByTeamId,
  contactPhoneByPlayerId,
  contactEmailByPlayerId,
  memberDetailsByPlayerId,
  taskTallyByTeamId,
  teamRoleByTeamId,
}: {
  teams: TeamWithMembers[];
  allProfiles: Person[];
  eventsByTeamId: Record<string, AdminUpcomingEvent[]>;
  contactPhoneByPlayerId: Record<string, string>;
  contactEmailByPlayerId: Record<string, string>;
  memberDetailsByPlayerId: Record<string, MemberDetail>;
  taskTallyByTeamId: Record<string, SeasonTaskTally>;
  teamRoleByTeamId: Record<string, "COACH" | "PLAYER">;
}) {
  const [activeId, setActiveId] = useState(teams[0]?.id);
  const active = teams.find((t) => t.id === activeId) ?? teams[0];

  useScrollTopOnChange(activeId);

  if (!active) {
    return (
      <p className="text-sm text-zinc-500">
        Aucune équipe ne t&apos;est rattachée pour le moment.
      </p>
    );
  }

  // A team they only play in is consultable, never editable: the club's
  // roster/coach management stays with the team's own coaches and the
  // Bureau (the RLS wouldn't accept the write either).
  const activeRole = teamRoleByTeamId[active.id] ?? "COACH";
  const isPlayerTeam = activeRole === "PLAYER";

  return (
    <div className="flex flex-col gap-4">
      {teams.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {teams.map((t) => {
            const role = teamRoleByTeamId[t.id] ?? "COACH";
            const isActive = active.id === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-navy bg-navy text-white"
                    : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {role === "COACH" ? (
                  <ClipboardList className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <Shirt className="h-3.5 w-3.5 shrink-0" />
                )}
                {teamLabel(t)}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none ${
                    isActive
                      ? "bg-white/20 text-white"
                      : role === "COACH"
                        ? "bg-navy/10 text-navy"
                        : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {role === "COACH" ? "Coach" : "Joueur"}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {isPlayerTeam && (
        <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Tu figures dans cette équipe en tant que joueur : l&apos;effectif est
          consultable, mais sa gestion reste à ses coachs et au Bureau.
        </p>
      )}
      <TeamCard
        // Remount on team change: otherwise a search still typed in the
        // roster filter (or a half-open form) would carry over and make
        // the next team look empty.
        key={active.id}
        team={active}
        allProfiles={allProfiles}
        eventsByTeamId={eventsByTeamId}
        contactPhoneByPlayerId={contactPhoneByPlayerId}
        contactEmailByPlayerId={contactEmailByPlayerId}
        createCotisationOnNewPlayer={false}
        memberDetailsByPlayerId={memberDetailsByPlayerId}
        taskTallyByPlayerId={taskTallyByTeamId[active.id] ?? {}}
        readOnly={isPlayerTeam}
        showRosterSearch
      />
    </div>
  );
}
