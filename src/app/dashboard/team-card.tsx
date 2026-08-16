"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  Search,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatFirstName, formatLastName, formatPersonName, sortByLastName } from "@/lib/names";
import { computePlayerYearStatus, getCurrentSeasonLabel } from "@/lib/season";
import { formatEventTime, isMatchType, styleFor } from "./calendar-view";
import OpponentDisplay from "./opponent-display";
import MemberDetailModal from "./member-detail-modal";
import PlayerYearBadge from "./player-year-badge";
import SalleBadge from "./salle-badge";
import WhatsAppButton from "./whatsapp-button";
import WhatsAppGroupButton from "./whatsapp-group-button";
import TeamWhatsAppSettings from "./team-whatsapp-settings";
import type { AdminMemberTeam, AdminUpcomingEvent, MemberDetail, WhatsAppGroup } from "./page";
import type { RosterPlayer, TeamWithMembers } from "./team-manager";

const now = Date.now();

type Person = { id: string; first_name: string | null; last_name: string | null };

function fullName(p: { first_name: string | null; last_name: string | null }) {
  return formatPersonName(p.first_name, p.last_name);
}

// Gives each category its own soft pastel identity (badge + card border)
// so the Équipes list reads at a glance instead of as a wall of identical
// white cards — same "quiet color, not loud" palette used for presence
// badges elsewhere in the app.
export function categoryTheme(category: string | null): { badge: string; border: string } {
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

// Clé de catégorie d'une équipe, débarrassée du numéro de sous-groupe.
// Le club nomme ses équipes de façons très variées ("U13M-1", "U13M2",
// "U18 1", "Seniors G1 /RM3", "Séniors M") : découper sur le dernier
// chiffre ne suffit pas, sinon "U13" perdrait le sien.
function categoryKey(label: string | null | undefined) {
  if (!label) return "";
  const raw = label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase();

  // Catégories d'âge : U + âge + genre éventuel + numéro de groupe
  // éventuel. "U13M-1" et "U13M2" donnent "U13M", "U18 1" donne "U18",
  // et "U09" rejoint "U9".
  const youth = raw.replace(/[^A-Z0-9]/g, "").match(/^U(\d{1,2})([A-Z]*)\d*$/);
  if (youth) return `U${Number(youth[1])}${youth[2]}`;

  // Le reste : on écarte les marqueurs de groupe et de niveau ("1", "G2",
  // "RM3") et on garde ce qui nomme la catégorie ("SENIORS M" -> SENIORSM,
  // "Seniors G1 /RM3" -> SENIORS).
  return raw
    .split(/[^A-Z0-9]+/)
    .filter((token) => token && !/^(?:G|RM|RF|PR|D)?\d+$/.test(token))
    .join("");
}

// Un U13M ne peut être prêté qu'à un autre groupe U13M : proposer U15M ou
// U13F n'a aucun sens sportif. La comparaison est bidirectionnelle pour que
// l'équipe de base ("U13") et ses déclinaisons ("U13M-1") se reconnaissent
// mutuellement, sans pour autant rapprocher U13M et U13F.
function sameCategoryFamily(a: string | null | undefined, b: string | null | undefined) {
  const ka = categoryKey(a);
  const kb = categoryKey(b);
  if (!ka || !kb) return true; // catégorie inconnue : ne rien masquer
  return ka.startsWith(kb) || kb.startsWith(ka);
}

// Le nom porte le niveau ("U13M-1"), la catégorie souvent le seul tronc
// commun ("U13") : c'est le nom qui discrimine, la catégorie ne sert que
// de repli quand il manque.
function teamCategoryLabel(t: { name: string | null; category: string | null }) {
  return t.name ?? t.category;
}

function roleBadge(role: "COACH" | "COACH_PENDING" | "JOUEUR") {
  if (role === "COACH") return { label: "Coach", className: "bg-navy/10 text-navy" };
  if (role === "COACH_PENDING")
    return { label: "Coach (en attente)", className: "bg-amber-100 text-amber-700" };
  return { label: "Joueur", className: "bg-emerald-100 text-emerald-700" };
}

export default function TeamCard({
  team,
  allProfiles,
  eventsByTeamId,
  contactPhoneByPlayerId,
  createCotisationOnNewPlayer = true,
  memberDetailsByPlayerId,
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
  showWhatsApp = true,
  // Every club team. When provided (Coach space), the roster's action is
  // "Changer d'équipe" instead of "Retirer" — a coach lending a player to
  // another team is the real need; plain removal stays a Bureau gesture.
  clubTeams,
  // Groupe WhatsApp de CETTE équipe (whatsapp_groups). En coach (readOnly
  // false), un bouton "Configurer WhatsApp" ouvre le lien d'invitation et
  // les membres — plus besoin d'un onglet séparé pour ça. En joueur
  // (readOnly true), un simple bouton d'envoi comme côté parent : pas
  // besoin de tout gérer, juste écrire au groupe.
  whatsappGroup,
}: {
  team: TeamWithMembers;
  allProfiles: Person[];
  eventsByTeamId: Record<string, AdminUpcomingEvent[]>;
  contactPhoneByPlayerId: Record<string, string>;
  createCotisationOnNewPlayer?: boolean;
  memberDetailsByPlayerId?: Record<string, MemberDetail>;
  allowCreatePlayer?: boolean;
  allowAssignCoach?: boolean;
  readOnly?: boolean;
  showRosterSearch?: boolean;
  contactEmailByPlayerId?: Record<string, string>;
  showWhatsApp?: boolean;
  clubTeams?: AdminMemberTeam[];
  whatsappGroup?: WhatsAppGroup | null;
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
  const [switchTarget, setSwitchTarget] = useState<RosterPlayer | null>(null);
  const [switchTeamId, setSwitchTeamId] = useState("");
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

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

  const availableCoaches = sortByLastName(
    allProfiles.filter((p) => !team.coaches.some((tc) => tc.id === p.id)),
    (p) => p.last_name
  );
  const canCreatePlayer = allowCreatePlayer && !readOnly;
  const canAssignCoach = allowAssignCoach && !readOnly;
  // Catégorie d'origine : celle de l'équipe depuis laquelle le coach ouvre
  // la modale, c'est-à-dire le groupe où le joueur est réellement inscrit.
  const switchOriginLabel = teamCategoryLabel(team);
  const sameFamilyTeams = (clubTeams ?? []).filter(
    (t) => t.id !== team.id && sameCategoryFamily(switchOriginLabel, teamCategoryLabel(t))
  );
  // Sans autre groupe dans la catégorie, le bouton n'ouvrirait qu'une
  // impasse : autant ne pas le proposer.
  const canSwitchTeam = !readOnly && sameFamilyTeams.length > 0;

  // Teams this player already belongs to are dropped from the picker — the
  // only ones known here are those the coach can see, so a duplicate can
  // still slip through and is caught on insert (23505).
  const switchTargetTeamIds = new Set(
    (switchTarget ? (memberDetailsByPlayerId?.[switchTarget.id]?.teams ?? []) : []).map(
      (t) => t.id
    )
  );
  const switchableTeams = sameFamilyTeams.filter((t) => !switchTargetTeamIds.has(t.id));

  function openSwitch(p: RosterPlayer) {
    setSwitchTarget(p);
    setSwitchTeamId("");
    setSwitchError(null);
  }

  // Addition, never a move: a player lent to another team stays on his own.
  // Removing him from his base team is a Bureau gesture, done from the
  // member's fiche — a coach lending a player must not silently unregister
  // him from the group he actually belongs to.
  async function confirmSwitchTeam() {
    if (!switchTarget || !switchTeamId) return;
    setSwitching(true);
    setSwitchError(null);
    const supabase = createClient();

    const { error: insertError } = await supabase
      .from("team_players")
      .insert({ team_id: switchTeamId, player_id: switchTarget.id });
    setSwitching(false);

    const destination = switchableTeams.find((t) => t.id === switchTeamId);
    const destinationLabel = destination?.name ?? destination?.category ?? "cette équipe";
    if (insertError) {
      // Unique violation: he's already registered there, which is the
      // intended end state — say so plainly instead of showing a raw
      // Postgres error.
      setSwitchError(
        insertError.code === "23505"
          ? `Ce joueur fait déjà partie de ${destinationLabel}.`
          : insertError.message
      );
      return;
    }

    const name = fullName({
      first_name: switchTarget.first_name,
      last_name: switchTarget.last_name,
    });
    setSwitchTarget(null);
    showToast(
      `${name} est ajouté à ${destinationLabel} et reste dans ${team.name ?? "son équipe"}.`
    );
    router.refresh();
  }

  // One list for the whole team — coachs, coachs en attente, then joueurs —
  // so the Rôle column actually distinguishes something instead of
  // repeating "Joueur" on every row.
  type MemberRow = {
    key: string;
    id: string;
    firstName: string | null;
    lastName: string | null;
    role: "COACH" | "COACH_PENDING" | "JOUEUR";
    player: RosterPlayer | null;
  };
  // A pending coach is itself a player row, so the same person can be on
  // both lists — merge them into a single row carrying both badges rather
  // than listing them twice.
  const memberById = new Map<string, MemberRow>();
  team.coaches.forEach((c) => {
    memberById.set(c.id, {
      key: c.id,
      id: c.id,
      firstName: c.first_name,
      lastName: c.last_name,
      role: "COACH",
      player: null,
    });
  });
  team.pendingCoaches.forEach((c) => {
    if (memberById.has(c.id)) return;
    memberById.set(c.id, {
      key: c.id,
      id: c.id,
      firstName: c.first_name,
      lastName: c.last_name,
      role: "COACH_PENDING",
      player: null,
    });
  });
  team.players.forEach((p) => {
    const existing = memberById.get(p.id);
    if (existing) {
      existing.player = p;
      return;
    }
    memberById.set(p.id, {
      key: p.id,
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      role: "JOUEUR",
      player: p,
    });
  });
  // Trié par nom de famille : la liste se construisait jusqu'ici dans
  // l'ordre d'arrivée des données (coachs, coachs en attente, joueurs),
  // pas alphabétique.
  const memberRows = sortByLastName(Array.from(memberById.values()), (m) => m.lastName);

  const rosterQuery = rosterSearch.trim().toLowerCase();
  const visibleMembers = rosterQuery
    ? memberRows.filter((m) =>
        `${m.firstName ?? ""} ${m.lastName ?? ""}`.toLowerCase().includes(rosterQuery)
      )
    : memberRows;

  // L'encadrement passe devant : c'est la première chose qu'on cherche en
  // ouvrant une équipe, et le mélanger aux joueurs le noyait dans la liste.
  // Un coach qui joue aussi reste dans l'encadrement — sa ligne porte déjà
  // les deux badges, la dupliquer en bas fausserait le compte des joueurs.
  const staffMembers = visibleMembers.filter((m) => m.role !== "JOUEUR");
  const playerMembers = visibleMembers.filter((m) => m.role === "JOUEUR");

  // Adult member: their own registration contact. Minor: the linked
  // tutor's, which is what contactPhone/EmailByPlayerId already carry.
  function contactsFor(id: string) {
    const detail = memberDetailsByPlayerId?.[id];
    return {
      phone:
        contactPhoneByPlayerId[id] ??
        detail?.registrationPhone ??
        detail?.motherPhone ??
        detail?.fatherPhone ??
        null,
      email:
        contactEmailByPlayerId?.[id] ??
        detail?.registrationEmail ??
        detail?.secondaryEmail ??
        null,
    };
  }
  const teamEvents = (eventsByTeamId[team.id] ?? [])
    .filter((e) => new Date(e.start_time).getTime() >= now)
    .slice(0, 3);

  const theme = categoryTheme(team.category);

  // Une seule definition de ligne pour les deux sections : Encadrement et
  // Joueurs affichent les memes colonnes, seul le fond change.
  function renderMemberRow(m: MemberRow, isStaff: boolean) {
          const { phone, email } = contactsFor(m.id);
          const detail = memberDetailsByPlayerId?.[m.id];
          const role = roleBadge(m.role);
          // La catégorie de l'équipe prime sur players.category : ce
          // dernier vient de l'import du club et vaut parfois "U13"
          // là où l'équipe est U13F. Dans une carte d'équipe, toutes
          // les lignes appartiennent à cette équipe, donc c'est elle
          // qui fait foi.
          const category = team.category ?? detail?.category;
          // PlayerYearBadge renders nothing when the birth date is
          // missing (or the category can't be read), so the status is
          // computed here too, to fall back on a neutral dash rather
          // than an empty cell.
          const birthDate = m.player?.birthDate ?? detail?.birthDate ?? null;
          // L'ancienneté d'un joueur se lit dans la catégorie de
          // l'équipe où il joue. Celle d'un coach, non : la catégorie
          // de l'équipe qu'il encadre n'a aucun rapport avec son âge,
          // c'est sa propre fiche qui fait foi (un coach Séniors né en
          // 1986 est "Old Soldier", pas "Sparring Partner" des U13).
          const statusCategory =
            m.role === "JOUEUR" ? team.category : (detail?.category ?? team.category);
          const yearStatus = computePlayerYearStatus(birthDate, statusCategory);
          // Belongs to another team as well: he was lent to this one,
          // so the useful action is to send him back — a plain
          // "Retirer" that only drops this membership. A player of
          // this team only gets the "Affecter" picker instead, since
          // removing him here would leave him with no team at all.
          const otherTeams = (detail?.teams ?? []).filter((t) => t.id !== team.id);
          const isLentIn = otherTeams.length > 0;
    return (
            <tr
              key={m.key}
              onClick={detail ? () => setDetailPlayerId(m.id) : undefined}
              className={`border-b border-zinc-50 last:border-0 ${
                isStaff ? "bg-navy/[0.04]" : ""
              } ${detail ? "cursor-pointer transition-colors hover:bg-slate-50" : ""}`}
            >
              {/* La bordure vit sur la première cellule : sur un <tr> en
                  border-collapse, un bord gauche ne s'affiche pas. */}
              <td
                className={`w-auto whitespace-nowrap px-3 py-2.5 font-semibold text-zinc-900 ${
                  isStaff ? "border-l-4 border-l-navy" : ""
                }`}
              >
                {formatLastName(m.lastName) || "—"}
              </td>
              <td className="w-auto whitespace-nowrap px-3 py-2.5 text-zinc-700">
                {m.firstName ? formatFirstName(m.firstName) : "—"}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">
                <span className="flex flex-wrap items-center gap-1">
                  <span
                    className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none ${role.className}`}
                  >
                    {role.label}
                  </span>
                  {m.role !== "JOUEUR" && m.player && (
                    <span className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold leading-none text-emerald-700">
                      Joueur
                    </span>
                  )}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">
                {yearStatus ? (
                  <PlayerYearBadge birthDate={birthDate} category={statusCategory} />
                ) : (
                  <span className="text-zinc-300">—</span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">
                {category ? (
                  <span
                    className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none ${theme.badge}`}
                  >
                    {category}
                  </span>
                ) : (
                  <span className="text-zinc-400">—</span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                {phone ? (
                  <a
                    href={`tel:${phone}`}
                    title="Appeler"
                    className="inline-flex items-center gap-1.5 text-zinc-600 hover:text-navy hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    {phone}
                  </a>
                ) : (
                  <span className="text-zinc-400">—</span>
                )}
              </td>
              <td className="w-auto px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                {email ? (
                  <a
                    href={`mailto:${email}`}
                    title={email}
                    className="flex min-w-0 items-center gap-1.5 text-zinc-600 hover:text-navy hover:underline"
                  >
                    <Mail className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    <span className="truncate">{email}</span>
                  </a>
                ) : (
                  <span className="text-zinc-400">—</span>
                )}
              </td>
              <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1">
                  {showWhatsApp && (
                    <WhatsAppButton
                      phone={phone ?? undefined}
                      message={`Bonjour, ici le coach de ${team.name ?? "l'équipe"}.`}
                      playerId={m.id}
                    />
                  )}
                  {m.player &&
                    !readOnly &&
                    (isLentIn ? (
                      <button
                        onClick={() => setRemoveTarget(m.player)}
                        title={`Retirer de ${team.name ?? "cette équipe"}`}
                        className="rounded-full p-1.5 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : canSwitchTeam ? (
                      <button
                        onClick={() => openSwitch(m.player!)}
                        title="Affecter à une autre équipe"
                        className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-navy"
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => setRemoveTarget(m.player)}
                        className="shrink-0 text-xs font-medium text-red-600 hover:underline"
                      >
                        Retirer
                      </button>
                    ))}
                </div>
              </td>
            </tr>
    );
  }


  return (
    <div
      className={`rounded-2xl border border-t-4 ${theme.border} border-t-ubac-yellow bg-white p-5 shadow-sm transition-all hover:shadow-md`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
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
        {/* Coach de cette équipe : un raccourci discret dans l'en-tête
            plutôt qu'un onglet séparé pour ça — un seul endroit où gérer
            son équipe. En lecture seule (joueur), le bouton d'envoi plus
            bas suffit, pas besoin de ce réglage. */}
        {!readOnly && whatsappGroup && (
          <TeamWhatsAppSettings
            groupId={whatsappGroup.id}
            groupName={team.name ?? "de l'équipe"}
            inviteLink={whatsappGroup.inviteLink}
            members={sortByLastName(
              whatsappGroup.members.map((m) => ({ id: m.id, firstName: m.firstName, lastName: m.lastName })),
              (m) => m.lastName
            )}
            candidates={sortByLastName(
              team.players.map((p) => ({ id: p.id, firstName: p.first_name, lastName: p.last_name })),
              (p) => p.lastName
            )}
          />
        )}
      </div>

      <div className="mt-3">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Membres
            <span className="ml-1.5 font-medium normal-case tracking-normal text-zinc-400">
              ({visibleMembers.length}
              {rosterQuery ? ` / ${memberRows.length}` : ""})
            </span>
          </p>
          {showRosterSearch && memberRows.length > 0 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                placeholder="Rechercher un membre..."
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
                <th className="whitespace-nowrap px-3 py-2.5">Rôle</th>
                <th className="whitespace-nowrap px-3 py-2.5">Statut</th>
                <th className="whitespace-nowrap px-3 py-2.5">Catégorie</th>
                <th className="whitespace-nowrap px-3 py-2.5">Téléphone</th>
                <th className="w-auto px-3 py-2.5">E-mail</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {staffMembers.length > 0 && (
                <>
                  <tr>
                    <td
                      colSpan={8}
                      className="border-b border-navy/10 bg-navy/[0.07] px-3 py-2 text-xs font-bold uppercase tracking-wide text-navy"
                    >
                      Encadrement
                      <span className="ml-1.5 font-semibold normal-case tracking-normal text-navy/60">
                        ({staffMembers.length})
                      </span>
                    </td>
                  </tr>
                  {staffMembers.map((m) => renderMemberRow(m, true))}
                </>
              )}

              {playerMembers.length > 0 && (
                <>
                  <tr>
                    {/* Même bandeau que l'Encadrement, en vert : c'est la
                        couleur que porte déjà le badge "Joueur" sur chaque
                        ligne, comme le navy porte celui de "Coach". */}
                    <td
                      colSpan={8}
                      className="border-b border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-emerald-700"
                    >
                      Joueurs
                      <span className="ml-1.5 font-semibold normal-case tracking-normal text-emerald-600/70">
                        ({playerMembers.length})
                      </span>
                    </td>
                  </tr>
                  {playerMembers.map((m) => renderMemberRow(m, false))}
                </>
              )}
              {visibleMembers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-center text-sm text-zinc-400">
                    {rosterQuery ? "Aucun membre ne correspond à cette recherche" : "Aucun membre"}
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
            className="mt-2 w-full rounded-lg bg-ubac-yellow px-2 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark"
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
            {sortByLastName(team.coaches, (p) => p.last_name).map((p) => (
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
                {canAssignCoach && (
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
            {sortByLastName(team.pendingCoaches, (p) => p.last_name).map((p) => (
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
                {canAssignCoach && (
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
                        {isMatchType(e.event_type) ?  (
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

      {/* Un lien direct dès qu'il existe — coach ou joueur, même bouton :
          "Configurer WhatsApp" (en-tête, coach uniquement) sert à SAISIR
          le lien, pas à l'ouvrir. Sans ce bouton-ci, un coach n'avait plus
          aucun moyen de rejoindre le groupe de sa propre équipe en un
          clic — régression introduite en retirant l'onglet WhatsApp dédié
          au profit de la roue crantée. Le bouton "compose un message"
          (générique, sans vrai lien) ne reste qu'en dernier recours pour
          un joueur, tant qu'aucun lien n'a encore été renseigné. */}
      {whatsappGroup?.inviteLink ? (
        <a
          href={whatsappGroup.inviteLink}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex w-fit items-center gap-1.5 rounded-full bg-emerald-500 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
        >
          <ExternalLink className="h-4 w-4" />
          Ouvrir sur WhatsApp
        </a>
      ) : (
        readOnly && (
          <WhatsAppGroupButton
            teamName={team.name ?? "l'équipe"}
            defaultMessage={`Bonjour à tous, je suis un joueur de l'équipe ${team.name ?? ""}.`}
            className="mt-3 flex w-fit items-center gap-1.5 rounded-full border border-emerald-200 px-3 py-1.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
          />
        )
      )}

      {detailPlayerId &&
        memberDetailsByPlayerId?.[detailPlayerId] &&
        (() => {
          const detail = memberDetailsByPlayerId[detailPlayerId];
          return (
            <MemberDetailModal
              member={detail}
              readOnly={readOnly}
              // Un coach modifie les informations pratiques de ses joueurs,
              // mais l'affectation d'équipe et les rôles Coach/Bureau
              // restent la main du Bureau.
              canManageTeamAndRoles={false}
              onClose={() => setDetailPlayerId(null)}
            />
          );
        })()}

      {switchTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="mb-2 flex items-center gap-2 font-semibold text-zinc-900">
              <ArrowRightLeft className="h-4 w-4 shrink-0 text-navy" />
              Affecter{" "}
              {fullName({
                first_name: switchTarget.first_name,
                last_name: switchTarget.last_name,
              })}{" "}
              à une autre équipe
            </h3>
            <p className="mb-3 text-sm text-zinc-500">
              Il reste inscrit dans {team.name ?? "son équipe"}
              {" et jouera aussi avec l'équipe choisie."}
            </p>
            {switchableTeams.length > 0 ? (
              <select
                value={switchTeamId}
                onChange={(e) => setSwitchTeamId(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-2 text-sm"
              >
                <option value="">Choisir une équipe...</option>
                {switchableTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name ?? t.category ?? "Équipe"}
                  </option>
                ))}
              </select>
            ) : (
              // Une liste vide sans explication laisserait croire à un bug :
              // il n'y a simplement pas d'autre groupe dans sa catégorie.
              <p className="rounded-lg bg-zinc-50 px-3 py-2.5 text-sm text-zinc-500">
                Aucun autre groupe en {switchOriginLabel ?? "cette catégorie"} où
                l&apos;affecter.
              </p>
            )}
            {switchError && <p className="mt-2 text-sm text-red-600">{switchError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setSwitchTarget(null)}
                className="rounded-full border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Annuler
              </button>
              <button
                onClick={confirmSwitchTeam}
                disabled={switching || !switchTeamId}
                className="rounded-full bg-navy px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-navy/90 disabled:opacity-60"
              >
                {switching ? "Affectation..." : "Affecter"}
              </button>
            </div>
          </div>
        </div>
      )}

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
              <span className="font-semibold text-zinc-900">{team.name}</span> ?{" "}
              {(() => {
                const remaining = (memberDetailsByPlayerId?.[removeTarget.id]?.teams ?? [])
                  .filter((t) => t.id !== team.id)
                  .map((t) => t.name ?? t.category)
                  .filter(Boolean);
                return remaining.length > 0 ? (
                  <>
                    Il reste inscrit dans{" "}
                    <span className="font-semibold text-zinc-900">
                      {remaining.join(", ")}
                    </span>
                    .
                  </>
                ) : (
                  "Le membre existera toujours dans la liste globale du club."
                );
              })()}
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
