"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
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
  // Drives the "Année/Statut" badge (1ère année, ROOKIE, Sparring
  // Partner...) via computePlayerYearStatus — see src/lib/season.ts.
  birthDate: string | null;
};

export type TeamWithMembers = {
  id: string;
  name: string | null;
  category: string | null;
  ffbb_url: string | null;
  // Posé par /api/sync-ffbb juste après une synchro réussie — alimente la
  // vue d'ensemble de l'onglet FFBB (ffbb-manager.tsx). Optionnel : les
  // objets construits ailleurs (ex. le calendrier Coach) n'ont pas besoin
  // de le porter.
  ffbb_last_synced_at?: string | null;
  players: RosterPlayer[];
  coaches: Person[];
  // Named coaches assigned via a member's fiche (team_pending_coaches)
  // before they have a real account yet — same source as the Membres
  // table's amber "en attente" badge, kept in sync with it (unlike the
  // legacy pendingCoachNames free-text field below).
  pendingCoaches: Person[];
  pendingCoachNames: string | null;
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
  const categoryListId = useId();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Suggestions plutôt qu'une liste fermée : un texte libre reste possible
  // (toute nouvelle catégorie doit pouvoir exister), mais la faute de
  // frappe qui casse un tri ou un matching FFBB (vécu plusieurs fois
  // cette saison — U13G vs U13M-1, Séniors 2 orthographiée autrement...)
  // devient un choix explicite plutôt qu'un accident.
  const existingCategories = useMemo(
    () =>
      Array.from(
        new Set(teams.map((t) => t.category).filter((c): c is string => Boolean(c)))
      ).sort((a, b) => a.localeCompare(b, "fr")),
    [teams]
  );

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
            allowCreatePlayer={false}
            allowAssignCoach={false}
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
            list={categoryListId}
            placeholder="U11, U13, Seniors..."
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-ubac-blue focus:outline-none focus:ring-1 focus:ring-ubac-blue"
          />
          <datalist id={categoryListId}>
            {existingCategories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
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
    </div>
  );
}
