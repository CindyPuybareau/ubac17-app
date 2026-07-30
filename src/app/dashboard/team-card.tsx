"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, FileText, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import OpponentDisplay from "./opponent-display";
import FfbbSync from "./ffbb-sync";
import MemberDetailModal from "./member-detail-modal";
import type { AdminUpcomingEvent, MemberDetail } from "./page";
import type { TeamWithMembers } from "./team-manager";

const CURRENT_SEASON = "2026-2027";
const now = Date.now();

type Person = { id: string; first_name: string | null; last_name: string | null };

function fullName(p: Person) {
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || "Sans nom";
}

export default function TeamCard({
  team,
  allProfiles,
  eventsByTeamId,
  contactPhoneByPlayerId,
  createCotisationOnNewPlayer = true,
  showFfbbSync = false,
  memberDetailsByPlayerId,
}: {
  team: TeamWithMembers;
  allProfiles: Person[];
  eventsByTeamId: Record<string, AdminUpcomingEvent[]>;
  contactPhoneByPlayerId: Record<string, string>;
  createCotisationOnNewPlayer?: boolean;
  showFfbbSync?: boolean;
  memberDetailsByPlayerId?: Record<string, MemberDetail>;
}) {
  const router = useRouter();
  const [detailPlayerId, setDetailPlayerId] = useState<string | null>(null);

  const [openPlayerForm, setOpenPlayerForm] = useState(false);
  const [newPlayerFirstName, setNewPlayerFirstName] = useState("");
  const [newPlayerLastName, setNewPlayerLastName] = useState("");
  const [newPlayerBirthDate, setNewPlayerBirthDate] = useState("");
  const [newPlayerParentEmail, setNewPlayerParentEmail] = useState("");
  const [newPlayerError, setNewPlayerError] = useState<string | null>(null);
  const [newPlayerLoading, setNewPlayerLoading] = useState(false);

  function closePlayerForm() {
    setOpenPlayerForm(false);
    setNewPlayerFirstName("");
    setNewPlayerLastName("");
    setNewPlayerBirthDate("");
    setNewPlayerParentEmail("");
    setNewPlayerError(null);
  }

  async function createPlayer(e: FormEvent) {
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

    if (createCotisationOnNewPlayer) {
      const { error: cotisationError } = await supabase
        .from("cotisations")
        .insert({
          player_id: player.id,
          saison: CURRENT_SEASON,
          statut: "EN_ATTENTE",
        });

      if (cotisationError) {
        setNewPlayerLoading(false);
        setNewPlayerError(cotisationError.message);
        return;
      }
    }

    setNewPlayerLoading(false);
    closePlayerForm();
    router.refresh();
  }

  async function removePlayer(playerId: string) {
    const supabase = createClient();
    await supabase
      .from("team_players")
      .delete()
      .eq("team_id", team.id)
      .eq("player_id", playerId);
    router.refresh();
  }

  async function addCoach(coachId: string) {
    if (!coachId) return;
    const supabase = createClient();
    await supabase
      .from("team_coaches")
      .insert({ team_id: team.id, coach_id: coachId });
    router.refresh();
  }

  async function removeCoach(coachId: string) {
    const supabase = createClient();
    await supabase
      .from("team_coaches")
      .delete()
      .eq("team_id", team.id)
      .eq("coach_id", coachId);
    router.refresh();
  }

  const availableCoaches = allProfiles.filter(
    (p) => !team.coaches.some((tc) => tc.id === p.id)
  );
  const teamEvents = (eventsByTeamId[team.id] ?? [])
    .filter((e) => new Date(e.start_time).getTime() >= now)
    .slice(0, 3);

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
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
            {team.players.map((p) => {
              const phone = contactPhoneByPlayerId[p.id];
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-2 py-1 text-sm"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{fullName(p)}</span>
                    {phone && (
                      <span className="flex items-center gap-1 text-xs text-zinc-500">
                        <Phone className="h-3 w-3 shrink-0" />
                        {phone}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {memberDetailsByPlayerId?.[p.id] && (
                      <button
                        onClick={() => setDetailPlayerId(p.id)}
                        title="Voir la fiche complète"
                        className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => removePlayer(p.id)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Retirer
                    </button>
                  </span>
                </li>
              );
            })}
            {team.players.length === 0 && (
              <li className="text-sm text-zinc-400">Aucun joueur</li>
            )}
          </ul>
          {openPlayerForm ? (
            <form
              onSubmit={createPlayer}
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
                onChange={(e) => setNewPlayerParentEmail(e.target.value)}
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
              onClick={() => setOpenPlayerForm(true)}
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
                  onClick={() => removeCoach(p.id)}
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
                addCoach(e.target.value);
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

      {showFfbbSync && (
        <div className="mt-3 border-t border-zinc-100 pt-3">
          <FfbbSync teamId={team.id} initialUrl={team.ffbb_url} />
        </div>
      )}

      {detailPlayerId &&
        memberDetailsByPlayerId?.[detailPlayerId] &&
        (() => {
          const detail = memberDetailsByPlayerId[detailPlayerId];
          return (
            <MemberDetailModal
              member={detail}
              readOnly
              onClose={() => setDetailPlayerId(null)}
            />
          );
        })()}
    </div>
  );
}
