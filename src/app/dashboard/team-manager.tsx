"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import FfbbSync from "./ffbb-sync";

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
  allPlayers,
  allProfiles,
}: {
  teams: TeamWithMembers[];
  allPlayers: Person[];
  allProfiles: Person[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  async function addPlayer(teamId: string, playerId: string) {
    if (!playerId) return;
    const supabase = createClient();
    await supabase.from("team_players").insert({ team_id: teamId, player_id: playerId });
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
          const availablePlayers = allPlayers.filter(
            (p) => !team.players.some((tp) => tp.id === p.id)
          );
          const availableCoaches = allProfiles.filter(
            (p) => !team.coaches.some((tc) => tc.id === p.id)
          );

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
                  {availablePlayers.length > 0 && (
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        addPlayer(team.id, e.target.value);
                        e.target.value = "";
                      }}
                      className="mt-2 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                    >
                      <option value="" disabled>
                        + Ajouter un joueur
                      </option>
                      {availablePlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {fullName(p)}
                        </option>
                      ))}
                    </select>
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

              <div className="mt-3">
                <FfbbSync teamId={team.id} initialUrl={team.ffbb_url} />
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
