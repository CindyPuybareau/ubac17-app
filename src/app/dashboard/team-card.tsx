"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  CalendarDays,
  Clock,
  FileText,
  Phone,
  Shirt,
  Utensils,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getCurrentSeasonLabel } from "@/lib/season";
import OpponentDisplay from "./opponent-display";
import MemberDetailModal from "./member-detail-modal";
import PlayerYearBadge from "./player-year-badge";
import WhatsAppButton from "./whatsapp-button";
import type { AdminUpcomingEvent, MemberDetail } from "./page";
import type { RosterPlayer, TeamWithMembers } from "./team-manager";
import type { SeasonTaskTally } from "./event-tasks";

const now = Date.now();

type Person = { id: string; first_name: string | null; last_name: string | null };

function fullName(p: Person) {
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || "Sans nom";
}

// Gives each category its own soft pastel identity (badge + card border)
// so the Équipes list reads at a glance instead of as a wall of identical
// white cards — same "quiet color, not loud" palette used for presence
// badges elsewhere in the app.
function categoryTheme(category: string | null): { badge: string; border: string } {
  const c = (category ?? "").toLowerCase();
  if (c.startsWith("séniors") || c.startsWith("seniors"))
    return { badge: "bg-navy/10 text-navy", border: "border-navy/10" };
  if (c.startsWith("u18")) return { badge: "bg-purple-100 text-purple-700", border: "border-purple-100" };
  if (c.startsWith("u15")) return { badge: "bg-blue-100 text-blue-700", border: "border-blue-100" };
  if (c.startsWith("u13")) return { badge: "bg-teal-100 text-teal-700", border: "border-teal-100" };
  if (c.startsWith("u11")) return { badge: "bg-emerald-100 text-emerald-700", border: "border-emerald-100" };
  if (c.startsWith("u9")) return { badge: "bg-amber-100 text-amber-700", border: "border-amber-100" };
  if (c.startsWith("baby")) return { badge: "bg-pink-100 text-pink-700", border: "border-pink-100" };
  if (c.startsWith("loisirs")) return { badge: "bg-zinc-100 text-zinc-600", border: "border-zinc-100" };
  return { badge: "bg-ubac-yellow/15 text-ubac-yellow-dark", border: "border-ubac-yellow/20" };
}

function presenceBadge(status: string | null) {
  if (status === "PRESENT") {
    return { label: "Présent", dotClassName: "bg-green-500", className: "bg-green-100 text-green-700" };
  }
  if (status === "ABSENT") {
    return { label: "Absent", dotClassName: "bg-red-500", className: "bg-red-100 text-red-700" };
  }
  if (status) {
    return { label: "En attente", dotClassName: "bg-amber-500", className: "bg-amber-100 text-amber-700" };
  }
  return { label: "—", dotClassName: "bg-zinc-300", className: "bg-zinc-100 text-zinc-400" };
}

export default function TeamCard({
  team,
  allProfiles,
  eventsByTeamId,
  contactPhoneByPlayerId,
  createCotisationOnNewPlayer = true,
  memberDetailsByPlayerId,
  taskTallyByPlayerId,
}: {
  team: TeamWithMembers;
  allProfiles: Person[];
  eventsByTeamId: Record<string, AdminUpcomingEvent[]>;
  contactPhoneByPlayerId: Record<string, string>;
  createCotisationOnNewPlayer?: boolean;
  memberDetailsByPlayerId?: Record<string, MemberDetail>;
  taskTallyByPlayerId?: SeasonTaskTally;
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
          saison: getCurrentSeasonLabel(),
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

  const theme = categoryTheme(team.category);

  return (
    <div
      className={`rounded-2xl border ${theme.border} bg-white p-5 shadow-sm transition-all hover:shadow-md`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-zinc-900">{team.name}</h3>
        {team.category && team.category !== team.name && (
          <span
            className={`inline-flex w-fit items-center justify-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold leading-none ${theme.badge}`}
          >
            {team.category}
          </span>
        )}
      </div>

      <div className="mt-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Joueurs
        </p>
        <div className="w-full overflow-x-auto rounded-xl border border-zinc-100">
          <table className="w-full min-w-[420px] table-fixed border-collapse text-sm">
            <colgroup>
              <col />
              <col />
              <col className="w-28" />
              <col className="w-32" />
              <col className="w-32" />
            </colgroup>
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
                <th className="px-3 py-2.5">Nom</th>
                <th className="px-3 py-2.5">Prénom</th>
                <th className="px-3 py-2.5">Année</th>
                <th className="px-3 py-2.5">Présence</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {team.players.map((p: RosterPlayer) => {
                const phone = contactPhoneByPlayerId[p.id];
                const presence = presenceBadge(p.nextEventStatus);
                return (
                  <tr key={p.id} className="border-b border-zinc-50 last:border-0">
                    <td className="truncate px-3 py-2.5 font-medium text-zinc-900">
                      {p.last_name ?? "—"}
                    </td>
                    <td className="truncate px-3 py-2.5 text-zinc-700">
                      {p.first_name ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <PlayerYearBadge birthDate={p.birthDate} category={team.category} />
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none ${presence.className}`}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${presence.dotClassName}`} />
                        {presence.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        {phone && (
                          <a
                            href={`tel:${phone}`}
                            title="Appeler le parent"
                            className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                          >
                            <Phone className="h-3.5 w-3.5" />
                          </a>
                        )}
                        <WhatsAppButton
                          phone={phone}
                          message={`Bonjour, ici le coach de ${team.name ?? "l'équipe"}.`}
                          playerId={p.id}
                        />
                        {memberDetailsByPlayerId?.[p.id] && (
                          <button
                            onClick={() => setDetailPlayerId(p.id)}
                            title="Voir la fiche complète"
                            className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => removePlayer(p.id)}
                          className="shrink-0 text-xs font-medium text-red-600 hover:underline"
                        >
                          Retirer
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {team.players.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-sm text-zinc-400">
                    Aucun joueur
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Coachs
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {team.coaches.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-2 py-1 text-sm"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{fullName(p)}</span>
                  <span
                    title="Coach avec un compte UBAC actif"
                    className="inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold leading-none text-emerald-700"
                  >
                    <BadgeCheck className="h-3 w-3" />
                    Coach Officiel
                  </span>
                </span>
                <button
                  onClick={() => removeCoach(p.id)}
                  className="shrink-0 text-xs font-medium text-red-600 hover:underline"
                >
                  Retirer
                </button>
              </li>
            ))}
            {team.pendingCoachNames && (
              <li className="flex items-center gap-1.5 truncate rounded-lg bg-amber-50 px-2 py-1 text-sm text-amber-700">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                {team.pendingCoachNames}
                <span className="text-xs text-amber-500">(en attente de compte)</span>
              </li>
            )}
            {team.coaches.length === 0 && !team.pendingCoachNames && (
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

        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
            <CalendarDays className="h-3.5 w-3.5" />
            Prochains matchs
          </p>
          {teamEvents.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {teamEvents.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/60 px-2.5 py-2"
                >
                  <CalendarDays className="h-4 w-4 shrink-0 text-blue-600" />
                  <div className="min-w-0 flex-1">
                    {e.event_type === "MATCH" ? (
                      <OpponentDisplay title={e.title} size="sm" />
                    ) : (
                      <span className="truncate text-sm font-medium text-blue-900">
                        {e.title ?? "Événement"}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-blue-700">
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

      {taskTallyByPlayerId && (
        <div className="mt-4 border-t border-zinc-100 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Tour de rôle — maillots &amp; goûter (saison)
          </p>
          <div className="overflow-x-auto rounded-xl border border-zinc-100">
            <table className="w-full min-w-[380px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  <th className="px-2 py-2">Famille</th>
                  <th className="px-2 py-2">
                    <span className="flex items-center gap-1">
                      <Shirt className="h-3.5 w-3.5 text-sky-600" />
                      Maillots
                    </span>
                  </th>
                  <th className="px-2 py-2">
                    <span className="flex items-center gap-1">
                      <Utensils className="h-3.5 w-3.5 text-amber-600" />
                      Goûter
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {team.players.map((p) => {
                  const tally = taskTallyByPlayerId[p.id] ?? { jerseys: 0, snacks: 0 };
                  return (
                    <tr key={p.id} className="border-b border-zinc-50 last:border-0">
                      <td className="truncate px-2 py-2 text-zinc-700">{fullName(p)}</td>
                      <td className="px-2 py-2 font-semibold text-zinc-900">{tally.jerseys}</td>
                      <td className="px-2 py-2 font-semibold text-zinc-900">{tally.snacks}</td>
                    </tr>
                  );
                })}
                {team.players.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-2 py-4 text-center text-sm text-zinc-400">
                      Aucun joueur
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
