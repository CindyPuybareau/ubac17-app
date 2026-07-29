"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import OpponentDisplay from "./opponent-display";
import type { AdminUpcomingEvent } from "./page";

const CURRENT_SEASON = "2026-2027";

type Person = { id: string; first_name: string | null; last_name: string | null };

export type TeamWithMembers = {
  id: string;
  name: string | null;
  category: string | null;
  ffbb_url: string | null;
  players: Person[];
  coaches: Person[];
};

function fullName(p: Person) {
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || "Sans nom";
}

export default function TeamManager({
  teams,
  allProfiles,
  eventsByTeamId,
}: {
  teams: TeamWithMembers[];
  allProfiles: Person[];
  eventsByTeamId: Record<string, AdminUpcomingEvent[]>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [openPlayerFormTeamId, setOpenPlayerFormTeamId] = useState<
    string | null
  >(null);
  const [newPlayerFirstName, setNewPlayerFirstName] = useState("");
  const [newPlayerLastName, setNewPlayerLastName] = useState("");
  const [newPlayerBirthDate, setNewPlayerBirthDate] = useState("");
  const [newPlayerParentEmail, setNewPlayerParentEmail] = useState("");
  const [newPlayerError, setNewPlayerError] = useState<string | null>(null);
  const [newPlayerLoading, setNewPlayerLoading] = useState(false);

  function closePlayerForm() {
    setOpenPlayerFormTeamId(null);
    setNewPlayerFirstName("");
    setNewPlayerLastName("");
    setNewPlayerBirthDate("");
    setNewPlayerParentEmail("");
    setNewPlayerError(null);
  }

  async function createPlayer(team: TeamWithMembers, e: FormEvent) {
    e.preventDefault();
    setNewPlayerLoading(true);
    setNewPlayerError(null);

    const supabase = createClient();

    const { data: player, error: playerError } = await supabase
      .from("players")
      .insert({
        first_name: newPlayerFirstName,
        last_name: newPlayerLastName,
        birth_date: newPlayerBirthDate || null,
        category: team.category,
        pending_parent_email: newPlayerParentEmail || null,
      })
      .select("id")
      .single();

    if (playerError || !player) {
      setNewPlayerLoading(false);
      setNewPlayerError(
        playerError?.message ?? "Impossible de créer la fiche joueur."
      );
      return;
    }

    const { error: teamPlayerError } = await supabase
      .from("team_players")
      .insert({ team_id: team.id, player_id: player.id });

    if (teamPlayerError) {
      setNewPlayerLoading(false);
      setNewPlayerError(teamPlayerError.message);
      return;
    }

    const { error: cotisationError } = await supabase
      .from("cotisations")
      .insert({
        player_id: player.id,
        saison: CURRENT_SEASON,
        statut: "EN_ATTENTE",
      });

    setNewPlayerLoading(false);

    if (cotisationError) {
      setNewPlayerError(cotisationError.message);
      return;
    }

    closePlayerForm();
    router.refresh();
  }

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

  async function removePlayer(teamId: string, playerId: string) {
    const supabase = createClient();
    await supabase
      .from("team_players")
      .delete()
      .eq("team_id", teamId)
      .eq("player_id", playerId);
    router.refresh();
  }

  async function addCoach(teamId: string, coachId: string) {
    if (!coachId) return;
    const supabase = createClient();
    await supabase.from("team_coaches").insert({ team_id: teamId, coach_id: coachId });
    router.refresh();
  }

  async function removeCoach(teamId: string, coachId: string) {
    const supabase = createClient();
    await supabase
      .from("team_coaches")
      .delete()
      .eq("team_id", teamId)
      .eq("coach_id", coachId);
    router.refresh();
  }

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

      <div className="flex flex-col gap-4">
        {teams.map((team) => {
          const availableCoaches = allProfiles.filter(
            (p) => !team.coaches.some((tc) => tc.id === p.id)
          );
          const teamEvents = (eventsByTeamId[team.id] ?? []).slice(0, 3);

          return (
            <div
              key={team.id}
              className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm"
            >
              <h3 className="font-semibold text-zinc-900">
                {team.name}
                {team.category ? ` · ${team.category}` : ""}
              </h3>

              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Joueurs
                  </p>
                  <ul className="mt-1 flex flex-col gap-1">
                    {team.players.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between rounded-lg bg-zinc-50 px-2 py-1 text-sm"
                      >
                        {fullName(p)}
                        <button
                          onClick={() => removePlayer(team.id, p.id)}
                          className="text-xs font-medium text-red-600 hover:underline"
                        >
                          Retirer
                        </button>
                      </li>
                    ))}
                    {team.players.length === 0 && (
                      <li className="text-sm text-zinc-400">Aucun joueur</li>
                    )}
                  </ul>
                  {openPlayerFormTeamId === team.id ? (
                    <form
                      onSubmit={(e) => createPlayer(team, e)}
                      className="mt-2 flex flex-col gap-2 rounded-lg bg-zinc-50 p-3"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          required
                          placeholder="Prénom"
                          value={newPlayerFirstName}
                          onChange={(e) => setNewPlayerFirstName(e.target.value)}
                          className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                        />
                        <input
                          required
                          placeholder="Nom"
                          value={newPlayerLastName}
                          onChange={(e) => setNewPlayerLastName(e.target.value)}
                          className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                        />
                      </div>
                      <input
                        type="date"
                        value={newPlayerBirthDate}
                        onChange={(e) => setNewPlayerBirthDate(e.target.value)}
                        className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                      />
                      <input
                        type="email"
                        placeholder="Email du parent (optionnel)"
                        value={newPlayerParentEmail}
                        onChange={(e) =>
                          setNewPlayerParentEmail(e.target.value)
                        }
                        className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                      />
                      {newPlayerError && (
                        <p className="text-xs text-red-600">{newPlayerError}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={newPlayerLoading}
                          className="rounded-full bg-ubac-yellow px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
                        >
                          {newPlayerLoading ? "Ajout..." : "Ajouter"}
                        </button>
                        <button
                          type="button"
                          onClick={closePlayerForm}
                          className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-white"
                        >
                          Annuler
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      onClick={() => setOpenPlayerFormTeamId(team.id)}
                      className="mt-2 w-full rounded-lg border border-dashed border-zinc-300 px-2 py-1.5 text-sm font-medium text-zinc-600 hover:border-ubac-yellow hover:text-ubac-yellow-dark"
                    >
                      + Ajouter un joueur
                    </button>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Coachs
                  </p>
                  <ul className="mt-1 flex flex-col gap-1">
                    {team.coaches.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between rounded-lg bg-zinc-50 px-2 py-1 text-sm"
                      >
                        {fullName(p)}
                        <button
                          onClick={() => removeCoach(team.id, p.id)}
                          className="text-xs font-medium text-red-600 hover:underline"
                        >
                          Retirer
                        </button>
                      </li>
                    ))}
                    {team.coaches.length === 0 && (
                      <li className="text-sm text-zinc-400">Aucun coach</li>
                    )}
                  </ul>
                  {availableCoaches.length > 0 && (
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        addCoach(team.id, e.target.value);
                        e.target.value = "";
                      }}
                      className="mt-2 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                    >
                      <option value="" disabled>
                        + Assigner un coach
                      </option>
                      {availableCoaches.map((p) => (
                        <option key={p.id} value={p.id}>
                          {fullName(p)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="mt-3 border-t border-zinc-100 pt-3">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Prochains matchs
                </p>
                {teamEvents.length > 0 ? (
                  <ul className="flex flex-col gap-1.5">
                    {teamEvents.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-2 py-1.5"
                      >
                        {e.event_type === "MATCH" ? (
                          <OpponentDisplay title={e.title} size="sm" />
                        ) : (
                          <span className="truncate text-sm font-medium text-zinc-700">
                            {e.title ?? "Événement"}
                          </span>
                        )}
                        <span className="shrink-0 text-xs text-zinc-500">
                          {new Date(e.start_time).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-zinc-400">Aucun match à venir</p>
                )}
              </div>
            </div>
          );
        })}
        {teams.length === 0 && (
          <p className="text-sm text-zinc-500">Aucune équipe pour le moment.</p>
        )}
      </div>
    </div>
  );
}
