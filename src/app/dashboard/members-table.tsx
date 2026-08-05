"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
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
import type { AdminMember, AdminMemberTeam } from "./page";

function fullLastName(m: AdminMember) {
  return (m.lastName ?? "").toUpperCase() || "—";
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
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
  const router = useRouter();
  const searchParams = useSearchParams();

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

  function memberLabel(ids: string[]) {
    if (ids.length === 1) {
      const m = members.find((mm) => mm.id === ids[0]);
      return m ? [m.firstName, m.lastName].filter(Boolean).join(" ") || "ce membre" : "ce membre";
    }
    return `${ids.length} membres`;
  }

  const filtered = useMemo(() => {
    let list = showArchived ? members : members.filter((m) => !m.archivedAt);
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
  }, [members, teamFilter, search, sortDir, showArchived]);

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
  }

  async function confirmReassign() {
    if (!reassignIds || !reassignTeamId) return;
    setReassignSaving(true);
    setActionError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("team_players")
      .delete()
      .in("player_id", reassignIds);
    if (deleteError) {
      setReassignSaving(false);
      setActionError(`Changement d'équipe impossible : ${deleteError.message}`);
      return;
    }
    const { error: insertError } = await supabase
      .from("team_players")
      .insert(reassignIds.map((pid) => ({ team_id: reassignTeamId, player_id: pid })));
    setReassignSaving(false);
    if (insertError) {
      setActionError(`Changement d'équipe impossible : ${insertError.message}`);
      return;
    }
    setReassignIds(null);
    setSelectedIds(new Set());
    router.refresh();
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

    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    router.refresh();
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
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(deleteTarget.id);
      return next;
    });
    setDeleteTarget(null);
    showToast("Membre supprimé définitivement.");
    router.refresh();
  }

  const selectedMembers = members.filter((m) => selectedIds.has(m.id));
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
        <button
          onClick={() => setShowAddMember(true)}
          className="ml-auto flex items-center gap-1.5 rounded-full bg-ubac-yellow px-3.5 py-1.5 text-sm font-semibold text-navy shadow-sm transition-colors hover:bg-ubac-yellow-dark"
        >
          <UserPlus className="h-4 w-4" />
          Ajouter un membre
        </button>
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
              Changer d&apos;équipe
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
                  {m.firstName ?? "—"}
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
                            message={`Bonjour ${m.firstName ?? ""}, ici l'UBAC.`}
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
          const detailMember = members.find((m) => m.id === detailMemberId);
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
                    `Membre ${[detailMember.firstName, detailMember.lastName]
                      .filter(Boolean)
                      .join(" ")} archivé.`
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
          const emailMember = members.find((m) => m.id === emailModalMemberId);
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
          title={`Changer d'équipe (${reassignIds.length} membre${
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
            <p className="text-xs text-zinc-500">
              Remplace l&apos;équipe actuelle de{" "}
              {reassignIds.length > 1 ? "ces membres" : "ce membre"}{" "}
              par l&apos;équipe choisie.
            </p>
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
        <Modal title="Suppression définitive" onClose={() => setDeleteTarget(null)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-zinc-700">
              Êtes-vous sûr de vouloir supprimer définitivement{" "}
              <span className="font-semibold">
                {[deleteTarget.firstName, deleteTarget.lastName].filter(Boolean).join(" ") ||
                  "ce membre"}
              </span>{" "}
              ? Cette action est irréversible.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-full border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Annuler
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
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
