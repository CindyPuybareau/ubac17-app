"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TeamCard from "./team-card";
import TeamFilterDropdown from "./team-filter-dropdown";
import type { AdminUpcomingEvent } from "./page";

type Person = { id: string; first_name: string | null; last_name: string | null };

export type RosterPlayer = Person & {
  jerseyNumber: number | null;
  position: string | null;
  // RSVP status for this team's next upcoming event, or null if there
  // isn't one — drives the "Statut Présence" badge in the roster table.
  nextEventStatus: string | null;
};

export type TeamWithMembers = {
  id: string;
  name: string | null;
  category: string | null;
  ffbb_url: string | null;
  players: RosterPlayer[];
  coaches: Person[];
};

export default function TeamManager({
  teams,
  allProfiles,
  eventsByTeamId,
  contactPhoneByPlayerId,
}: {
  teams: TeamWithMembers[];
  allProfiles: Person[];
  eventsByTeamId: Record<string, AdminUpcomingEvent[]>;
  contactPhoneByPlayerId: Record<string, string>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(
    () => new Set(teams.map((t) => t.id))
  );
  const knownTeamIdsRef = useRef(new Set(teams.map((t) => t.id)));

  // Auto-select newly created teams (e.g. right after "Créer l'équipe")
  // without clobbering the user's existing filter choices.
  useEffect(() => {
    const newIds = teams
      .map((t) => t.id)
      .filter((id) => !knownTeamIdsRef.current.has(id));
    if (newIds.length > 0) {
      setSelectedTeamIds((prev) => {
        const next = new Set(prev);
        newIds.forEach((id) => next.add(id));
        return next;
      });
    }
    knownTeamIdsRef.current = new Set(teams.map((t) => t.id));
  }, [teams]);

  async function handleCreateTeam(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("teams")
      .insert({ name, category: category || null });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setName("");
    setCategory("");
    router.refresh();
  }

  const filteredTeams = useMemo(
    () => teams.filter((t) => selectedTeamIds.has(t.id)),
    [teams, selectedTeamIds]
  );

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={handleCreateTeam}
        className="flex flex-col gap-3 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Nom de l&apos;équipe
          </label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-ubac-blue focus:outline-none focus:ring-1 focus:ring-ubac-blue"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Catégorie
          </label>
          <input
            placeholder="U11, U13, Seniors..."
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-ubac-blue focus:outline-none focus:ring-1 focus:ring-ubac-blue"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-ubac-yellow px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
        >
          {loading ? "Création..." : "Créer l'équipe"}
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <TeamFilterDropdown
        teams={teams}
        selectedIds={selectedTeamIds}
        onChange={setSelectedTeamIds}
      />

      <div className="flex flex-col gap-4">
        {filteredTeams.map((team) => (
          <TeamCard
            key={team.id}
            team={team}
            allProfiles={allProfiles}
            eventsByTeamId={eventsByTeamId}
            contactPhoneByPlayerId={contactPhoneByPlayerId}
            showFfbbSync
          />
        ))}
        {teams.length === 0 && (
          <p className="text-sm text-zinc-500">Aucune équipe pour le moment.</p>
        )}
        {teams.length > 0 && filteredTeams.length === 0 && (
          <p className="text-sm text-zinc-500">
            Aucune équipe sélectionnée dans le filtre.
          </p>
        )}
      </div>
    </div>
  );
}
