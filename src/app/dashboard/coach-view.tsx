"use client";

import { useState } from "react";
import { CalendarDays, Dumbbell, Trophy, Users } from "lucide-react";
import CalendarView from "./calendar-view";
import CoachTeams from "./coach-teams";
import CoachTrainings from "./coach-trainings";
import CoachFfbb from "./coach-ffbb";
import type { TeamWithMembers } from "./team-manager";
import type { AdminUpcomingEvent, MemberDetail } from "./page";

type TabKey = "calendar" | "teams" | "trainings" | "ffbb";

const TABS: { key: TabKey; label: string; icon: typeof CalendarDays }[] = [
  { key: "calendar", label: "Calendrier", icon: CalendarDays },
  { key: "teams", label: "Équipe(s)", icon: Users },
  { key: "trainings", label: "Entraînements", icon: Dumbbell },
  { key: "ffbb", label: "FFBB", icon: Trophy },
];

export default function CoachView({
  teams,
  events,
  contactPhoneByPlayerId,
  contactEmailByPlayerId,
  memberDetailsByPlayerId,
  rsvpPlayers,
  rsvpStatusByKey,
}: {
  teams: TeamWithMembers[];
  events: AdminUpcomingEvent[];
  contactPhoneByPlayerId: Record<string, string>;
  contactEmailByPlayerId: Record<string, string>;
  memberDetailsByPlayerId: Record<string, MemberDetail>;
  rsvpPlayers: { id: string; name: string; teamIds: string[] }[];
  rsvpStatusByKey: Record<string, string>;
}) {
  const [tab, setTab] = useState<TabKey>("calendar");

  const createTeams = teams.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
  }));

  const eventsByTeamId: Record<string, AdminUpcomingEvent[]> = {};
  events.forEach((e) => {
    if (!e.teamId) return;
    (eventsByTeamId[e.teamId] ??= []).push(e);
  });

  return (
    <div className="flex flex-col gap-4 pb-20 lg:pb-0">
      <div className="flex flex-nowrap items-center gap-1 overflow-x-auto rounded-2xl bg-navy p-1.5 md:justify-between">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold transition-colors md:flex-1 md:justify-center md:text-sm ${
                active ? "bg-ubac-yellow text-navy" : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "calendar" && (
        <CalendarView
          events={events}
          createTeams={createTeams}
          rsvp={{ players: rsvpPlayers, statusByKey: rsvpStatusByKey }}
          contactEmailByPlayerId={contactEmailByPlayerId}
        />
      )}

      {tab === "teams" && (
        <CoachTeams
          teams={teams}
          allProfiles={[]}
          eventsByTeamId={eventsByTeamId}
          contactPhoneByPlayerId={contactPhoneByPlayerId}
          memberDetailsByPlayerId={memberDetailsByPlayerId}
        />
      )}

      {tab === "trainings" && (
        <CoachTrainings teams={teams} events={events} rsvpStatusByKey={rsvpStatusByKey} />
      )}

      {tab === "ffbb" && <CoachFfbb teams={teams} />}
    </div>
  );
}
