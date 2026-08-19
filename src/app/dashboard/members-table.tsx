"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Mail,
  MessageCircle,
  MoreVertical,
  Phone,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buildGmailComposeLink } from "@/lib/email";
import { teamLabel } from "@/lib/teams";
import AddMemberModal from "./add-member-modal";
import EmailTemplateModal from "./email-template-modal";
import MemberDetailModal from "./member-detail-modal";
import PlayerYearBadge from "./player-year-badge";
import WhatsAppButton from "./whatsapp-button";
import { formatFirstName, formatLastName, formatPersonName } from "@/lib/names";
import type { AdminMember, AdminMemberTeam } from "./page";

// "12 août 2026 à 09:36" — utilisé uniquement dans l'infobulle de
// l'indicateur de connexion, jamais affiché en clair dans le tableau.
function formatLastLogin(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${date} à ${time}`;
}

function fullLastName(m: AdminMember) {
  return formatLastName(m.lastName) || "—";
}

function Modal({
  title,
  onClose,
  children,
  widthClassName = "max-w-sm",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  // Les modales de confirmation à deux boutons ("Annuler" / action) ont
  // besoin d'un peu plus de largeur que max-w-sm pour que le bouton
  // d'action tienne sur une seule ligne sans se tasser.
  widthClassName?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`w-full ${widthClassName} rounded-2xl bg-white p-5 shadow-xl`}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-zinc-900">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function MembersTable({
  members,
  teams,
}: {
  members: AdminMember[];
  teams: AdminMemberTeam[];
}) {
  const searchParams = useSearchParams();

  // Copie locale mise à jour immédiatement à l'archivage/réactivation/
  // suppression/changement d'équipe, plutôt que d'attendre le
  // rafraîchissement temps réel (players/team_players/team_coaches/
  // club_administrators sont toutes surveillées par realtime-sync.tsx —
  // le router.refresh() explicite qui vivait ici en plus déclenchait donc
  // deux rechargements complets du tableau de bord pour une seule action,
  // plusieurs secondes à chaque fois) — retour de Cindy du 2026-08-21 :
  // "quand je supprime... un membre... trop long". Même correctif que
  // calendar-view.tsx/volunteer-needs-panel.tsx.
  const [localMembers, setLocalMembers] = useState(members);
  useEffect(() => {
    setLocalMembers(members);
  }, [members]);

  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Deep-link support: "?openMember=<id>" (see buildAppDeepLink) opens
  // that member's fiche straight away — the one-click "come back here"
  // link pasted into a WhatsApp message.
  const [detailMemberId, setDetailMemberId] = useState<string | null>(
    () => searchParams.get("openMember")
  );
  const [emailModalMemberId, setEmailModalMemberId] = useState<string | null>(null);

  const [reassignIds, setReassignIds] = useState<string[] | null>(null);
  const [reassignTeamId, setReassignTeamId] = useState("");
  // Par défaut, additif (ajoute à l'équipe choisie sans toucher aux
  // équipes actuelles) : un membre présent sur 2 équipes (joueur qui
  // "surclasse", coach qui joue aussi ailleurs...) ne doit pas en perdre
  // une silencieusement. Le retrait des équipes actuelles reste possible,
  // mais devient un choix explicite (case cochée) plutôt que le
  // comportement par défaut.
  const [reassignReplace, setReassignReplace] = useState(false);
  const [reassignSaving, setReassignSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminMember | null>(null);
  const [deleting, setDeleting] = useState(false);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  function handleMemberCreated(fullName: string) {
    showToast(`Membre ${fullName} ajouté avec succès !`);
  }

  // Exporte la liste actuellement affichée (recherche/filtre/archivés déjà
  // appliqués) — pas besoin de tout sélectionner à la main d'abord, à la
  // différence de l'export de l'onglet Cotisations qui part d'une
  // sélection. Utile en fin de saison pour la compta, une déclaration
  // FFBB/assurance, ou tout usage hors de l'appli.
  function exportMembers() {
    const header = [
      "Nom",
      "Prénom",
      "Catégorie",
      "Équipe(s)",
      "Coach de",
      "Email",
      "Téléphone",
      "Statut",
    ];
    const rows = filtered.map((m) => [
      fullLastName(m),
      m.firstName ?? "",
      m.category ?? "",
      m.teams.map((t) => t.category ?? t.name ?? "").join(", "),
      [...m.coachTeams, ...m.pendingCoachTeams].map((t) => t.category ?? t.name ?? "").join(", "),
      m.email ?? "",
      m.phone ?? "",
      m.archivedAt ? "Archivé" : "Actif",
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Membres");
    XLSX.writeFile(wb, "membres-export.xlsx");
  }

  function memberLabel(ids: string[]) {
    if (ids.length === 1) {
      const m = localMembers.find((mm) => mm.id === ids[0]);
      return m ? formatPersonName(m.firstName, m.lastName, "ce membre") : "ce membre";
    }
    return `${ids.length} membres`;
  }

  const filtered = useMemo(() => {
    let list = showArchived ? localMembers : localMembers.filter((m) => !m.archivedAt);
    if (teamFilter) {
      list = list.filter(
        (m) =>
          m.teams.some((t) => t.id === teamFilter) ||
          m.coachTeams.some((t) => t.id === teamFilter) ||
          m.pendingCoachTeams.some((t) => t.id === teamFilter)
      );
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((m) =>
        `${m.firstName ?? ""} ${m.lastName ?? ""} ${m.email ?? ""}`
          .toLowerCase()
          .includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const cmp = fullLastName(a).localeCompare(fullLastName(b), "fr");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [localMembers, teamFilter, search, sortDir, showArchived]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((m) => selectedIds.has(m.id));

  function toggleAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach((m) => next.delete(m.id));
      } else {
        filtered.forEach((m) => next.add(m.id));
      }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openReassign(ids: string[]) {
    setReassignIds(ids);
    setReassignTeamId("");
    setReassignReplace(false);
  }

  async function confirmReassign() {
    if (!reassignIds || !reassignTeamId) return;
    setReassignSaving(true);
    setActionError(null);
    const supabase = createClient();

    if (reassignReplace) {
      const { error: deleteError } = await supabase
        .from("team_players")
        .delete()
        .in("player_id", reassignIds);
      if (deleteError) {
        setReassignSaving(false);
        setActionError(`Changement d'équipe impossible : ${deleteError.message}`);
        return;
      }
    }

    // N'ajoute que les membres pas déjà dans cette équipe — évite un
    // conflit de clé (team_id, player_id) sur team_players côté additif,
    // sans avoir à interroger la base : `localMembers` porte déjà chaque
    // équipe actuelle de chacun.
    const alreadyInTeam = new Set(
      localMembers.filter((m) => m.teams.some((t) => t.id === reassignTeamId)).map((m) => m.id)
    );
    const idsToInsert = reassignIds.filter((id) => !alreadyInTeam.has(id));

    if (idsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("team_players")
        .insert(idsToInsert.map((pid) => ({ team_id: reassignTeamId, player_id: pid })));
      if (insertError) {
        setReassignSaving(false);
        setActionError(`Affectation impossible : ${insertError.message}`);
        return;
      }
    }
    // Affichage immédiat plutôt que d'attendre le rafraîchissement temps
    // réel — voir le commentaire sur localMembers plus haut.
    const newTeam = teams.find((t) => t.id === reassignTeamId);
    if (newTeam) {
      setLocalMembers((prev) =>
        prev.map((m) =>
          reassignIds.includes(m.id)
            ? {
                ...m,
                teams: reassignReplace
                  ? [newTeam]
                  : m.teams.some((t) => t.id === newTeam.id)
                    ? m.teams
                    : [...m.teams, newTeam],
              }
            : m
        )
      );
    }
    setReassignSaving(false);
    setReassignIds(null);
    setSelectedIds(new Set());
  }

  // Members are never hard-deleted from the Bureau's table — archiving
  // keeps every past cotisation, RSVP and team assignment intact and can be
  // undone, instead of risking an accidental mass data loss.
  //
  // RLS silently returns 0 affected rows instead of an error when a policy
  // blocks a write, so a plain .error check isn't enough here — request the
  // updated rows back and compare the count to know it actually happened.
  // Returns whether the write actually went through, so callers can
  // decide whether to show a success toast / close a modal / etc. instead
  // of assuming success just because no exception was thrown.
  async function setArchived(ids: string[], archived: boolean): Promise<boolean> {
    setActionError(null);
    const supabase = createClient();
    const { data: updated, error } = await supabase
      .from("players")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .in("id", ids)
      .select("id");

    if (error) {
      setActionError(
        `${archived ? "Archivage" : "Réactivation"} impossible : ${error.message}`
      );
      return false;
    }
    if ((updated?.length ?? 0) < ids.length) {
      setActionError(
        "Action bloquée par les droits d'accès (RLS). Vérifie que la migration 20260731030000_members_table_support.sql a bien été exécutée dans Supabase (SQL Editor), puis réessaie."
      );
      return false;
    }

    // Archiver quelqu'un dans Membres doit le retirer de partout où il
    // était actif — pas seulement de cette liste. Sans ça, une fiche
    // archivée pouvait rester coach de plusieurs équipes indéfiniment (cas
    // remonté par Cindy : un vieux compte de démo toujours coach de 3
    // équipes des mois après avoir "disparu" de Membres). Uniquement à
    // l'archivage, jamais à la réactivation : on ne sait pas dans quelle(s)
    // équipe(s) remettre quelqu'un, ça reste un geste manuel du Bureau.
    if (archived) {
      const profileIds = ids
        .map((id) => localMembers.find((m) => m.id === id)?.profileId)
        .filter((pid): pid is string => Boolean(pid));
      const emails = ids
        .map((id) => localMembers.find((m) => m.id === id)?.email?.trim().toLowerCase())
        .filter((e): e is string => Boolean(e));

      await Promise.all([
        supabase.from("team_players").delete().in("player_id", ids),
        supabase.from("team_pending_coaches").delete().in("player_id", ids),
        profileIds.length > 0
          ? supabase.from("team_coaches").delete().in("coach_id", profileIds)
          : Promise.resolve(),
        emails.length > 0
          ? supabase.from("club_administrators").delete().in("email", emails)
          : Promise.resolve(),
      ]);
    }

    // Affichage immédiat plutôt que d'attendre le rafraîchissement temps
    // réel — voir le commentaire sur localMembers plus haut. À l'archivage,
    // reflète aussi le nettoyage ci-dessus (équipes/coach/Bureau) : sinon
    // la fiche restait affichée coach/Bureau jusqu'au prochain
    // rafraîchissement, contredisant ce qu'on vient de faire.
    setLocalMembers((prev) =>
      prev.map((m) =>
        ids.includes(m.id)
          ? {
              ...m,
              archivedAt: archived ? new Date().toISOString() : null,
              ...(archived
                ? { teams: [], coachTeams: [], pendingCoachTeams: [], bureauRole: null }
                : {}),
            }
          : m
      )
    );
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    return true;
  }

  // Confirms once, then archives directly — used by the row ⋮ menu and the
  // bulk-selection toolbar, neither of which is already behind a confirming
  // modal. MemberDetailModal's own archive button confirms itself and calls
  // setArchived directly instead (see its onArchive prop below), so a
  // member is never asked to confirm the same action twice in a row.
  async function handleArchive(ids: string[]) {
    const label = ids.length > 1 ? `ces ${ids.length} membres` : "ce membre";
    const ok = window.confirm(
      `Archiver ${label} ? Il${ids.length > 1 ? "s" : ""} n'apparaîtra${
        ids.length > 1 ? "ont" : ""
      } plus dans la liste par défaut, mais ${
        ids.length > 1 ? "leurs données restent" : "ses données restent"
      } conservées et tu peux réactiver à tout moment.`
    );
    if (!ok) return;
    const label2 = memberLabel(ids);
    const ok2 = await setArchived(ids, true);
    if (ok2) {
      showToast(
        ids.length > 1 ? `${label2} archivés.` : `Membre ${label2} archivé.`
      );
    }
  }

  async function handleReactivate(ids: string[]) {
    const label = memberLabel(ids);
    const ok = await setArchived(ids, false);
    if (ok) {
      showToast(
        ids.length > 1 ? `${label} réactivés.` : `Membre ${label} réactivé.`
      );
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("players")
      .delete()
      .eq("id", deleteTarget.id)
      .select("id");
    setDeleting(false);
    if (error) {
      setActionError(`Suppression impossible : ${error.message}`);
      return;
    }
    if ((data?.length ?? 0) === 0) {
      setActionError(
        "Suppression bloquée par les droits d'accès (RLS). Vérifie que la migration 20260826000000_cascade_delete_players.sql a bien été exécutée dans Supabase (SQL Editor), puis réessaie."
      );
      return;
    }
    // Disparition immédiate plutôt que d'attendre le rafraîchissement
    // temps réel — voir le commentaire sur localMembers plus haut.
    setLocalMembers((prev) => prev.filter((m) => m.id !== deleteTarget.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(deleteTarget.id);
      return next;
    });
    setDeleteTarget(null);
    showToast("Membre supprimé définitivement.");
  }

  const selectedMembers = localMembers.filter((m) => selectedIds.has(m.id));
  const bulkEmails = selectedMembers
    .map((m) => m.email)
    .filter((e): e is string => Boolean(e));
  const bulkMailto = buildGmailComposeLink({ bcc: bulkEmails.join(",") });

  const menuItemClass =
    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50";

  return (
    <div className="flex flex-col gap-4">
      {actionError && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="shrink-0 rounded-full p-1 text-red-400 hover:bg-red-100 hover:text-red-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setShowAddMember(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-ubac-yellow px-3.5 py-1.5 text-sm font-semibold text-navy shadow-sm transition-colors hover:bg-ubac-yellow-dark"
        >
          <UserPlus className="h-4 w-4" />
          Ajouter un membre
        </button>
        <button
          onClick={exportMembers}
          title="Exporte la liste actuellement affichée (recherche et filtres compris)"
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          <FileText className="h-4 w-4" />
          Exporter (Excel)
        </button>
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un membre..."
            className="w-full rounded-full border border-zinc-200 py-1.5 pl-9 pr-3 text-sm focus:border-ubac-yellow focus:outline-none"
          />
        </div>
        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className="rounded-full border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700"
        >
          <option value="">Toutes les équipes</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {teamLabel(t)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
          />
          Afficher les archivés
        </label>
        <span className="text-xs font-medium text-zinc-400">
          {filtered.length} membre{filtered.length > 1 ? "s" : ""}
        </span>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ubac-yellow/40 bg-ubac-yellow/10 px-4 py-2.5">
          <span className="text-sm font-semibold text-ubac-yellow-dark">
            {selectedIds.size} membre{selectedIds.size > 1 ? "s" : ""}{" "}
            sélectionné{selectedIds.size > 1 ? "s" : ""}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={bulkEmails.length > 0 ? bulkMailto : undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={bulkEmails.length === 0}
              className={`flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 ${
                bulkEmails.length === 0
                  ? "cursor-not-allowed opacity-50"
                  : "hover:bg-zinc-50"
              }`}
            >
              <Mail className="h-3.5 w-3.5" />
              Envoyer un e-mail
            </a>
            <button
              onClick={() => openReassign(Array.from(selectedIds))}
              className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Affecter à une équipe
            </button>
            <button
              onClick={() => handleArchive(Array.from(selectedIds))}
              className="flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              <Archive className="h-3.5 w-3.5" />
              Archiver la sélection
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-zinc-500 hover:bg-white"
            >
              <X className="h-3.5 w-3.5" />
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="w-full overflow-x-auto rounded-2xl border border-t-4 border-zinc-100 border-t-ubac-yellow">
        <table className="w-full table-auto border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
              <th className="whitespace-nowrap px-2 py-3">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
                />
              </th>
              <th className="whitespace-nowrap px-2 py-3">#</th>
              <th
                className="w-auto cursor-pointer select-none whitespace-nowrap px-2 py-3"
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              >
                <span className="flex items-center gap-1 whitespace-nowrap">
                  Nom
                  {sortDir === "asc" ? (
                    <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                  )}
                </span>
              </th>
              <th className="w-auto whitespace-nowrap px-2 py-3">Prénom</th>
              <th className="whitespace-nowrap px-2 py-3">Coach de</th>
              <th className="whitespace-nowrap px-2 py-3">Catégorie</th>
              <th className="whitespace-nowrap px-2 py-3">Statut</th>
              <th className="whitespace-nowrap px-2 py-3">Email</th>
              <th className="whitespace-nowrap px-2 py-3">Téléphone</th>
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((m, index) => (
              <tr
                key={m.id}
                onClick={() => setDetailMemberId(m.id)}
                // `opacity` (any value < 1) creates a new CSS stacking
                // context on the element it's applied to. Applying it
                // unconditionally to an archived row would trap that row's
                // own z-40 dropdown menu inside it, so the menu could never
                // paint above the *following* rows (it'd get stuck behind
                // them, since the whole dimmed <tr> — dropdown included —
                // is just one flattened layer relative to its siblings).
                // Lifting the dim while this row's own menu is open avoids
                // that entirely, with no visible side effect (the "Archivé"
                // badge stays fully legible either way).
                className={`cursor-pointer align-middle border-b border-slate-100 last:border-0 transition-colors duration-150 hover:bg-amber-50/40 ${
                  index % 2 === 1 ? "bg-slate-50/50" : ""
                } ${m.archivedAt && openMenuId !== m.id ? "opacity-50" : ""}`}
              >
                <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(m.id)}
                    onChange={() => toggleOne(m.id)}
                    className="h-4 w-4 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
                  />
                </td>
                <td className="px-2 py-3 text-xs text-zinc-400">{index + 1}</td>
                <td
                  className="w-auto whitespace-nowrap px-2 py-3 font-semibold text-zinc-900"
                  title={
                    m.bureauRole ? `${fullLastName(m)} — ${m.bureauRole}` : fullLastName(m)
                  }
                >
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <span
                      title={
                        m.lastLoginAt
                          ? `Déjà connecté(e) — dernière connexion le ${formatLastLogin(m.lastLoginAt)}`
                          : "Jamais connecté(e) à l'application"
                      }
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center ${
                        m.lastLoginAt ? "text-emerald-500" : "text-zinc-300"
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </span>
                    {fullLastName(m)}
                    {m.bureauRole && (
                      <Shield className="h-3.5 w-3.5 shrink-0 text-ubac-yellow-dark" />
                    )}
                  </span>
                  {m.archivedAt && (
                    <span className="ml-1.5 inline-flex items-center justify-center whitespace-nowrap rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none text-zinc-500">
                      Archivé
                    </span>
                  )}
                </td>
                <td className="w-auto whitespace-nowrap px-2 py-3 text-zinc-700">
                  {m.firstName ? formatFirstName(m.firstName) : "—"}
                </td>
                <td className="px-2 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {m.coachTeams.length === 0 && m.pendingCoachTeams.length === 0 ? (
                      <span className="text-xs text-zinc-400">—</span>
                    ) : (
                      <>
                        {m.coachTeams.map((t) => (
                          <span
                            key={`coach-${t.id}`}
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold leading-none text-purple-700"
                          >
                            {t.category ?? t.name ?? "Équipe"}
                          </span>
                        ))}
                        {m.pendingCoachTeams.map((t) => (
                          <span
                            key={`pending-coach-${t.id}`}
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold leading-none text-purple-700"
                          >
                            {t.category ?? t.name ?? "Équipe"}
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                </td>
                <td className="whitespace-nowrap px-2 py-3">
                  <div className="flex flex-wrap items-center gap-1">
                    {m.teams.length === 0 ? (
                      <span className="text-xs text-zinc-400">—</span>
                    ) : (
                      m.teams.map((t) => (
                        <span
                          key={`player-${t.id}`}
                          className="inline-flex max-w-full items-center justify-center truncate whitespace-nowrap rounded-full bg-navy/10 px-2 py-0.5 text-xs font-semibold leading-none text-navy"
                        >
                          {t.category ?? t.name ?? "Équipe"}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="whitespace-nowrap px-2 py-3">
                  <PlayerYearBadge
                    birthDate={m.birthDate}
                    category={m.teams[0]?.category ?? m.category}
                  />
                </td>
                <td
                  className="max-w-[280px] truncate px-2 py-3 text-zinc-600"
                  title={m.email ?? undefined}
                >
                  {m.email ?? <span className="text-zinc-300">—</span>}
                </td>
                <td
                  className="whitespace-nowrap px-2 py-3 text-zinc-600"
                  title={m.phone ?? undefined}
                  onClick={(e) => e.stopPropagation()}
                >
                  {m.phone ? (
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <Phone className="h-3 w-3 shrink-0 text-zinc-400" />
                      {m.phone}
                    </span>
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
                </td>
                <td className="relative px-2 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end">
                    <button
                      onClick={() =>
                        setOpenMenuId((cur) => (cur === m.id ? null : m.id))
                      }
                      className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>
                  {openMenuId === m.id && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setOpenMenuId(null)}
                      />
                      <div className="absolute right-0 z-40 mt-1 w-56 rounded-xl border border-zinc-100 bg-white p-1.5 text-left shadow-lg">
                        <button
                          onClick={() => {
                            setOpenMenuId(null);
                            setDetailMemberId(m.id);
                          }}
                          className={menuItemClass}
                        >
                          <User className="h-3.5 w-3.5 text-zinc-500" />
                          Voir / Modifier le profil
                        </button>
                        {m.phone ? (
                          <WhatsAppButton
                            phone={m.phone}
                            message={`Bonjour ${m.firstName ? formatFirstName(m.firstName) : ""}, ici l'UBAC.`}
                            label="Contacter sur WhatsApp"
                            playerId={m.id}
                            onTriggerClick={() => setOpenMenuId(null)}
                            className={menuItemClass}
                          />
                        ) : (
                          <span
                            title="Aucun numéro de téléphone connu"
                            className={`${menuItemClass} cursor-not-allowed text-zinc-300 hover:bg-transparent`}
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            Contacter sur WhatsApp
                          </span>
                        )}
                        {m.pendingParentEmail || m.email ? (
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              setEmailModalMemberId(m.id);
                            }}
                            className={menuItemClass}
                          >
                            <Mail className="h-3.5 w-3.5 text-navy" />
                            Envoyer un e-mail
                          </button>
                        ) : (
                          <span
                            title="Aucun email connu pour ce membre"
                            className={`${menuItemClass} cursor-not-allowed text-zinc-300 hover:bg-transparent`}
                          >
                            <Mail className="h-3.5 w-3.5" />
                            Envoyer un e-mail
                          </span>
                        )}
                        {m.archivedAt ? (
                          <>
                            <button
                              onClick={() => {
                                setOpenMenuId(null);
                                handleReactivate([m.id]);
                              }}
                              className={menuItemClass}
                            >
                              <RefreshCw className="h-3.5 w-3.5 text-zinc-500" />
                              Réactiver le membre
                            </button>
                            <button
                              onClick={() => {
                                setOpenMenuId(null);
                                setDeleteTarget(m);
                              }}
                              className={`${menuItemClass} text-red-600 hover:bg-red-50`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Supprimer définitivement
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              handleArchive([m.id]);
                            }}
                            className={`${menuItemClass} text-red-600 hover:bg-red-50`}
                          >
                            <Archive className="h-3.5 w-3.5" />
                            Archiver le membre
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-2 py-8 text-center text-sm text-zinc-400">
                  Aucun membre trouvé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detailMemberId &&
        (() => {
          const detailMember = localMembers.find((m) => m.id === detailMemberId);
          if (!detailMember) return null;
          return (
            <MemberDetailModal
              member={detailMember}
              readOnly={false}
              onClose={() => setDetailMemberId(null)}
              onArchive={async () => {
                const ok = await setArchived([detailMember.id], true);
                if (ok) {
                  showToast(
                    `Membre ${formatPersonName(detailMember.firstName, detailMember.lastName, "")} archivé.`
                  );
                }
              }}
              archivedAt={detailMember.archivedAt}
              teams={teams}
              profileId={detailMember.profileId}
              bureauRole={detailMember.bureauRole}
              coachTeams={detailMember.coachTeams}
              pendingCoachTeams={detailMember.pendingCoachTeams}
            />
          );
        })()}

      {emailModalMemberId &&
        (() => {
          const emailMember = localMembers.find((m) => m.id === emailModalMemberId);
          // This row's own contact email (m.email, already the corrected
          // "registration_email wins" field — see the earlier phone/email
          // fix) must come first: pendingParentEmail is specifically the
          // address an account INVITE goes to (often a parent's, on
          // purpose), which isn't what a general-purpose message should
          // default to for a member who already has their own contact info.
          const emailTo = emailMember?.email ?? emailMember?.pendingParentEmail;
          if (!emailMember || !emailTo) return null;
          return (
            <EmailTemplateModal
              toEmail={emailTo}
              recipientFirstName={emailMember.firstName}
              canUseBureauTemplates
              onClose={() => setEmailModalMemberId(null)}
            />
          );
        })()}

      {reassignIds && (
        <Modal
          title={`Affecter à une équipe (${reassignIds.length} membre${
            reassignIds.length > 1 ? "s" : ""
          })`}
          onClose={() => setReassignIds(null)}
        >
          <div className="flex flex-col gap-2">
            <select
              value={reassignTeamId}
              onChange={(e) => setReassignTeamId(e.target.value)}
              className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
            >
              <option value="" disabled>
                Choisir une équipe
              </option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {teamLabel(t)}
                </option>
              ))}
            </select>
            <label className="flex items-start gap-2 rounded-lg border border-zinc-100 bg-zinc-50 p-2.5 text-xs text-zinc-600">
              <input
                type="checkbox"
                checked={reassignReplace}
                onChange={(e) => setReassignReplace(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
              />
              <span>
                <span className="font-semibold text-zinc-800">
                  Retirer aussi de leur(s) équipe(s) actuelle(s)
                </span>
                <br />
                {reassignIds.length > 1
                  ? "Décoché (par défaut) : ces membres gardent leurs équipes actuelles en plus de la nouvelle"
                  : "Décoché (par défaut) : ce membre garde son équipe actuelle en plus de la nouvelle"}{" "}
                — utile pour un joueur présent sur 2 équipes. Coché : remplace complètement
                l&apos;affectation actuelle par la nouvelle équipe.
              </span>
            </label>
            <button
              onClick={confirmReassign}
              disabled={!reassignTeamId || reassignSaving}
              className="mt-1 rounded-full bg-ubac-yellow px-3 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
            >
              {reassignSaving ? "Application..." : "Confirmer"}
            </button>
          </div>
        </Modal>
      )}

      {showAddMember && (
        <AddMemberModal
          teams={teams}
          onClose={() => setShowAddMember(false)}
          onCreated={handleMemberCreated}
        />
      )}

      {deleteTarget && (
        <Modal
          title="Suppression définitive"
          onClose={() => setDeleteTarget(null)}
          widthClassName="max-w-md"
        >
          <div className="flex flex-col gap-3">
            <p className="text-sm text-zinc-700">
              Êtes-vous sûr de vouloir supprimer définitivement{" "}
              <span className="font-semibold">
                {formatPersonName(deleteTarget.firstName, deleteTarget.lastName, "ce membre")}
              </span>{" "}
              ? Cette action est irréversible.
            </p>
            <div className="flex items-stretch gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 whitespace-nowrap rounded-full border border-zinc-200 px-3 py-2 text-[14px] font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Annuler
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-red-600 px-3 py-2 text-[14px] font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                {deleting ? "Suppression..." : "Supprimer définitivement"}
              </button>
            </div>
          </div>
        </Modal>
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
