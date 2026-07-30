"use client";

import { useState } from "react";
import TeamCard from "./team-card";
import type { TeamWithMembers } from "./team-manager";
import type { AdminUpcomingEvent, MemberDetail } from "./page";

type Person = { id: string; first_name: string | null; last_name: string | null };

export default function CoachTeams({
  teams,
  allProfiles,
  eventsByTeamId,
  contactPhoneByPlayerId,
  memberDetailsByPlayerId,
}: {
  teams: TeamWithMembers[];
  allProfiles: Person[];
  eventsByTeamId: Record<string, AdminUpcomingEvent[]>;
  contactPhoneByPlayerId: Record<string, string>;
  memberDetailsByPlayerId: Record<string, MemberDetail>;
}) {
  const [activeId, setActiveId] = useState(teams[0]?.id);
  const active = teams.find((t) => t.id === activeId) ?? teams[0];

  if (!active) {
    return (
      <p className="text-sm text-zinc-500">
        Aucune équipe ne t&apos;est rattachée pour le moment.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {teams.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {teams.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                active.id === t.id
                  ? "border-navy bg-navy text-white"
                  : "border-zinc-200 text-zinc-600"
              }`}
            >
              {t.name}
              {t.category ? ` · ${t.category}` : ""}
            </button>
          ))}
        </div>
      )}
      <TeamCard
        team={active}
        allProfiles={allProfiles}
        eventsByTeamId={eventsByTeamId}
        contactPhoneByPlayerId={contactPhoneByPlayerId}
        createCotisationOnNewPlayer={false}
        showFfbbSync
        memberDetailsByPlayerId={memberDetailsByPlayerId}
      />
    </div>
  );
}
