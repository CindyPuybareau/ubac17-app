"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  Mail,
  MapPin,
  Phone,
  Search,
  Shirt,
  Trash2,
  Utensils,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getCurrentSeasonLabel } from "@/lib/season";
import { formatEventTime, styleFor } from "./calendar-view";
import OpponentDisplay from "./opponent-display";
import MemberDetailModal from "./member-detail-modal";
import PlayerYearBadge from "./player-year-badge";
import SalleBadge from "./salle-badge";
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

function initials(p: { first_name: string | null; last_name: string | null }) {
  const a = p.first_name?.trim()[0] ?? "";
  const b = p.last_name?.trim()[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

// The club's own FBI status is free text imported from their Excel, so it
// is never rewritten here — only colour-coded on the words it contains,
// and shown verbatim on hover. Falls back to the presence of a licence
// number when the status is empty.
function licenceBadge(detail: MemberDetail | undefined) {
  const raw = detail?.fbiStatus?.trim() ?? "";
  if (!raw) {
    if (detail?.licenseNumber) {
      return {
        label: "Licence",
        title: `N° ${detail.licenseNumber}`,
        className: "bg-zinc-100 text-zinc-600",
        dotClassName: "bg-zinc-400",
      };
    }
    return { label: "—", title: "", className: "bg-zinc-100 text-zinc-400", dotClassName: "bg-zinc-300" };
  }
  const normalized = raw.toLowerCase();
  if (normalized.includes("valid") || normalized.includes("actif") || normalized.includes("active")) {
    return { label: raw, title: raw, className: "bg-green-100 text-green-700", dotClassName: "bg-green-500" };
  }
  if (normalized.includes("attente") || normalized.includes("cours") || normalized.includes("instance")) {
    return { label: raw, title: raw, className: "bg-amber-100 text-amber-700", dotClassName: "bg-amber-500" };
  }
  return { label: raw, title: raw, className: "bg-zinc-100 text-zinc-600", dotClassName: "bg-zinc-400" };
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
  // The Bureau's "Membres" tab now owns member creation + team assignment
  // end to end (AddMemberModal), so its Équipes tab no longer needs its own
  // "+ Ajouter un joueur" shortcut here — Coach space still does, since
  // coaches have no other way to add a brand-new player to their roster.
  allowCreatePlayer = true,
  // Same reasoning for coach assignment: the Bureau now designates coaches
  // exclusively from the member's own fiche ("Coach de" section), so its
  // Équipes tab drops the "+ Assigner un coach" picker — Coach space keeps
  // it, since a coach can't reach the (Bureau-only) Membres tab to add a
  // co-coach any other way.
  allowAssignCoach = true,
  // Consultation only: used by the Coach space for a team the user merely
  // plays in. Hides every write affordance (add/remove player, add/remove
  // coach) — the RLS would reject those writes anyway.
  readOnly = false,
  showRosterSearch = false,
  contactEmailByPlayerId,
}: {
  team: TeamWithMembers;
  allProfiles: Person[];
  eventsByTeamId: Record<string, AdminUpcomingEvent[]>;
  contactPhoneByPlayerId: Record<string, string>;
  createCotisationOnNewPlayer?: boolean;
  memberDetailsByPlayerId?: Record<string, MemberDetail>;
  taskTallyByPlayerId?: SeasonTaskTally;
  allowCreatePlayer?: boolean;
  allowAssignCoach?: boolean;
  readOnly?: boolean;
  showRosterSearch?: boolean;
  contactEmailByPlayerId?: Record<string, string>;
}) {
  const router = useRouter();
  const [detailPlayerId, setDetailPlayerId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<RosterPlayer | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeCoachTarget, setRemoveCoachTarget] = useState<Person | null>(null);
  const [removingCoach, setRemovingCoach] = useState(false);
  const [removeCoachError, setRemoveCoachError] = useState<string | null>(null);
  const [removePendingCoachTarget, setRemovePendingCoachTarget] = useState<Person | null>(null);
  const [removingPendingCoach, setRemovingPendingCoach] = useState(false);
  const [removePendingCoachError, setRemovePendingCoachError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [rosterSearch, setRosterSearch] = useState("");

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

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

  async function confirmRemovePlayer() {
    if (!removeTarget) return;
    setRemoving(true);
    setRemoveError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("team_players")
      .delete()
      .eq("team_id", team.id)
      .eq("player_id", removeTarget.id);
    setRemoving(false);
    if (error) {
      setRemoveError(`Retrait impossible : ${error.message}`);
      return;
    }
    const name = fullName(removeTarget);
    setRemoveTarget(null);
    showToast(`${name} a été retiré de l'équipe.`);
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

  async function confirmRemoveCoach() {
    if (!removeCoachTarget) return;
    setRemovingCoach(true);
    setRemoveCoachError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("team_coaches")
      .delete()
      .eq("team_id", team.id)
      .eq("coach_id", removeCoachTarget.id);
    setRemovingCoach(false);
    if (error) {
      setRemoveCoachError(`Retrait impossible : ${error.message}`);
      return;
    }
    // A single source of truth (team_coaches) drives both this card's own
    // "Coachs" list and the Membres table's "Coach de" badge for this
    // person — deleting the row here already updates both the moment the
    // page refetches, no separate write to the member's fiche needed.
    const name = fullName(removeCoachTarget);
    setRemoveCoachTarget(null);
    showToast(`${name} n'est plus coach de l'équipe ${team.name ?? ""}.`);
    router.refresh();
  }

  async function confirmRemovePendingCoach() {
    if (!removePendingCoachTarget) return;
    setRemovingPendingCoach(true);
    setRemovePendingCoachError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("team_pending_coaches")
      .delete()
      .eq("team_id", team.id)
      .eq("player_id", removePendingCoachTarget.id);
    setRemovingPendingCoach(false);
    if (error) {
      setRemovePendingCoachError(`Retrait impossible : ${error.message}`);
      return;
    }
    const name = fullName(removePendingCoachTarget);
    setRemovePendingCoachTarget(null);
    showToast(`${name} n'est plus coach en attente de l'équipe ${team.name ?? ""}.`);
    router.refresh();
  }

  const availableCoaches = allProfiles.filter(
    (p) => !team.coaches.some((tc) => tc.id === p.id)
  );
  const canCreatePlayer = allowCreatePlayer && !readOnly;
  const canAssignCoach = allowAssignCoach && !readOnly;

  const rosterQuery = rosterSearch.trim().toLowerCase();
  const visiblePlayers = rosterQuery
    ? team.players.filter((p) =>
        `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase().includes(rosterQuery)
      )
    : team.players;
  const teamEvents = (eventsByTeamId[team.id] ?? [])
    .filter((e) => new Date(e.start_time).getTime() >= now)
    .slice(0, 3);

  const theme = categoryTheme(team.category);

  return (
    <div
      className={`rounded-2xl border border-t-4 ${theme.border} border-t-ubac-yellow bg-white p-5 shadow-sm transition-all hover:shadow-md`}
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
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Joueurs
            <span className="ml-1.5 font-medium normal-case tracking-normal text-zinc-400">
              ({visiblePlayers.length}
              {rosterQuery ? ` / ${team.players.length}` : ""})
            </span>
          </p>
          {showRosterSearch && team.players.length > 0 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                placeholder="Rechercher un joueur..."
                className="w-48 rounded-full border border-zinc-200 py-1.5 pl-8 pr-3 text-sm outline-none focus:border-ubac-yellow"
              />
            </div>
          )}
        </div>
        <div className="w-full overflow-x-auto rounded-xl border border-zinc-100">
          <table className="w-full table-auto border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
                <th className="w-auto whitespace-nowrap px-3 py-2.5">Nom</th>
                <th className="w-auto whitespace-nowrap px-3 py-2.5">Prénom</th>
                <th className="whitespace-nowrap px-3 py-2.5">N°</th>
                <th className="whitespace-nowrap px-3 py-2.5">Poste</th>
                <th className="whitespace-nowrap px-3 py-2.5">Année</th>
                <th className="whitespace-nowrap px-3 py-2.5">Licence</th>
                <th className="whitespace-nowrap px-3 py-2.5">Présence</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {visiblePlayers.map((p: RosterPlayer) => {
                const phone = contactPhoneByPlayerId[p.id];
                const email = contactEmailByPlayerId?.[p.id];
                const presence = presenceBadge(p.nextEventStatus);
                const licence = licenceBadge(memberDetailsByPlayerId?.[p.id]);
                return (
                  <tr key={p.id} className="border-b border-zinc-50 last:border-0">
                    <td className="w-auto whitespace-nowrap px-3 py-2.5 font-medium text-zinc-900">
                      <span className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy/10 text-[11px] font-bold text-navy">
                          {initials(p)}
                        </span>
                        {p.last_name ?? "—"}
                      </span>
                    </td>
                    <td className="w-auto whitespace-nowrap px-3 py-2.5 text-zinc-700">
                      {p.first_name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-zinc-600">
                      {p.jerseyNumber ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-zinc-600">
                      {p.position ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <PlayerYearBadge birthDate={p.birthDate} category={team.category} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span
                        title={licence.title}
                        className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none ${licence.className}`}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${licence.dotClassName}`} />
                        {licence.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
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
                        {email && (
                          <a
                            href={`mailto:${email}`}
                            title={`Écrire à ${email}`}
                            className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                          >
                            <Mail className="h-3.5 w-3.5" />
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
                        {!readOnly && (
                          <button
                            onClick={() => setRemoveTarget(p)}
                            className="shrink-0 text-xs font-medium text-red-600 hover:underline"
                          >
                            Retirer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visiblePlayers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-center text-sm text-zinc-400">
                    {rosterQuery ? "Aucun joueur ne correspond à cette recherche" : "Aucun joueur"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {canCreatePlayer && (openPlayerForm ? (
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
        ))}
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
                {!readOnly && (
                  <button
                    onClick={() => setRemoveCoachTarget(p)}
                    title="Retirer ce coach de l'équipe"
                    className="shrink-0 rounded-lg p-1.5 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
            {team.pendingCoaches.map((p) => (
              <li
                key={`pending-${p.id}`}
                className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-2 py-1 text-sm"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{fullName(p)}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-amber-200/60 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                    <Clock className="h-3 w-3 shrink-0" />
                    (en attente de compte)
                  </span>
                </span>
                {!readOnly && (
                  <button
                    onClick={() => setRemovePendingCoachTarget(p)}
                    title="Retirer ce coach en attente de l'équipe"
                    className="shrink-0 rounded-lg p-1.5 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
            {/* Legacy free-text fallback, only shown if this team has no
                structured pending coach (team_pending_coaches) at all —
                keeps older, never-migrated teams from silently going blank. */}
            {team.pendingCoaches.length === 0 && team.pendingCoachNames && (
              <li className="flex items-center gap-1.5 truncate rounded-lg bg-zinc-50 px-2 py-1 text-sm">
                <span className="truncate">{team.pendingCoachNames}</span>
                <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-amber-200/60 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                  <Clock className="h-3 w-3 shrink-0" />
                  (en attente de compte)
                </span>
              </li>
            )}
            {team.coaches.length === 0 &&
              team.pendingCoaches.length === 0 &&
              !team.pendingCoachNames && (
                <li className="text-sm text-zinc-400">Aucun coach</li>
              )}
          </ul>
          {canAssignCoach && availableCoaches.length > 0 && (
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
          <div className="mb-1">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
              <CalendarDays className="h-3.5 w-3.5" />
              Prochains événements
            </p>
            <p className="text-[11px] text-zinc-400">
              Matchs, entraînements &amp; événements du club
            </p>
          </div>
          {teamEvents.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {teamEvents.map((e) => {
                const style = styleFor(e.event_type);
                return (
                  <li
                    key={e.id}
                    className="flex flex-col gap-1 rounded-xl border border-blue-200 bg-blue-50/60 px-2.5 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${style.badge}`}
                      >
                        {style.label}
                      </span>
                      <div className="min-w-0 flex-1">
                        {e.event_type === "MATCH" ? (
                          <OpponentDisplay title={e.title} size="sm" />
                        ) : (
                          <span className="truncate text-sm font-medium text-blue-900">
                            {e.title ?? style.label}
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-blue-700">
                        {new Date(e.start_time).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-0.5 text-xs text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 shrink-0" />
                        {formatEventTime(e.start_time, e.end_time)}
                      </span>
                      {(e.salle || e.location) && (
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {e.salle ? <SalleBadge salle={e.salle} /> : e.location}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-zinc-400">Aucun événement à venir</p>
          )}
        </div>
      </div>

      {taskTallyByPlayerId && (
        <div className="mt-4 border-t border-zinc-100 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Tour de rôle — maillots &amp; goûter (saison)
          </p>
          <div className="overflow-x-auto rounded-xl border border-zinc-100">
            <table className="w-full table-auto border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  <th className="w-auto whitespace-nowrap px-2 py-2">Famille</th>
                  <th className="whitespace-nowrap px-2 py-2">
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <Shirt className="h-3.5 w-3.5 text-sky-600" />
                      Maillots
                    </span>
                  </th>
                  <th className="whitespace-nowrap px-2 py-2">
                    <span className="flex items-center gap-1 whitespace-nowrap">
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
                      <td className="w-auto whitespace-nowrap px-2 py-2 text-zinc-700">{fullName(p)}</td>
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

      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="mb-2 font-semibold text-zinc-900">
              Retirer le joueur de l&apos;équipe ?
            </h3>
            <p className="mb-4 text-sm text-zinc-600">
              Êtes-vous sûr de vouloir retirer{" "}
              <span className="font-semibold text-zinc-900">{fullName(removeTarget)}</span>{" "}
              de l&apos;équipe{" "}
              <span className="font-semibold text-zinc-900">{team.name}</span> ? Le membre
              existera toujours dans la liste globale du club.
            </p>
            {removeError && <p className="mb-2 text-sm text-red-600">{removeError}</p>}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRemoveTarget(null)}
                className="flex-1 rounded-full border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Annuler
              </button>
              <button
                onClick={confirmRemovePlayer}
                disabled={removing}
                className="flex-1 rounded-full bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                {removing ? "Retrait..." : "Retirer de l'équipe"}
              </button>
            </div>
          </div>
        </div>
      )}

      {removeCoachTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="mb-2 font-semibold text-zinc-900">
              Retirer le coach de cette équipe ?
            </h3>
            <p className="mb-4 text-sm text-zinc-600">
              Êtes-vous sûr de vouloir retirer{" "}
              <span className="font-semibold text-zinc-900">{fullName(removeCoachTarget)}</span>{" "}
              du rôle de coach de l&apos;équipe{" "}
              <span className="font-semibold text-zinc-900">{team.name}</span> ?
            </p>
            {removeCoachError && (
              <p className="mb-2 text-sm text-red-600">{removeCoachError}</p>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRemoveCoachTarget(null)}
                className="flex-1 rounded-full border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Annuler
              </button>
              <button
                onClick={confirmRemoveCoach}
                disabled={removingCoach}
                className="flex-1 rounded-full bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                {removingCoach ? "Retrait..." : "Retirer le coach"}
              </button>
            </div>
          </div>
        </div>
      )}

      {removePendingCoachTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="mb-2 font-semibold text-zinc-900">
              Retirer ce coach en attente de cette équipe ?
            </h3>
            <p className="mb-4 text-sm text-zinc-600">
              Êtes-vous sûr de vouloir retirer{" "}
              <span className="font-semibold text-zinc-900">
                {fullName(removePendingCoachTarget)}
              </span>{" "}
              de la liste des coachs en attente de compte de l&apos;équipe{" "}
              <span className="font-semibold text-zinc-900">{team.name}</span> ?
            </p>
            {removePendingCoachError && (
              <p className="mb-2 text-sm text-red-600">{removePendingCoachError}</p>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRemovePendingCoachTarget(null)}
                className="flex-1 rounded-full border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Annuler
              </button>
              <button
                onClick={confirmRemovePendingCoach}
                disabled={removingPendingCoach}
                className="flex-1 rounded-full bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                {removingPendingCoach ? "Retrait..." : "Retirer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-navy px-4 py-2.5 text-sm font-semibold text-white shadow-lg">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          {toast}
        </div>
      )}
    </div>
  );
}
