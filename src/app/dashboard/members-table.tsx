"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Clock,
  Mail,
  MessageCircle,
  MoreVertical,
  Phone,
  RefreshCw,
  Search,
  Shield,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buildGmailComposeLink } from "@/lib/email";
import { teamLabel } from "@/lib/teams";
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
  async function setArchived(ids: string[], archived: boolean) {
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
      return;
    }
    if ((updated?.length ?? 0) < ids.length) {
      setActionError(
        "Action bloquée par les droits d'accès (RLS). Vérifie que la migration 20260731030000_members_table_support.sql a bien été exécutée dans Supabase (SQL Editor), puis réessaie."
      );
      return;
    }

    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    router.refresh();
  }

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
    await setArchived(ids, true);
  }

  async function handleReactivate(ids: string[]) {
    await setArchived(ids, false);
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

      <div className="w-full overflow-x-auto rounded-2xl border border-zinc-100">
        <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-9" />
            <col className="w-9" />
            <col />
            <col className="w-24" />
            <col className="w-32" />
            <col className="w-28" />
            <col className="w-28" />
            <col />
            <col className="w-40" />
            <col className="w-10" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-100 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
              <th className="px-3 py-3">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
                />
              </th>
              <th className="px-3 py-3">#</th>
              <th
                className="cursor-pointer select-none px-3 py-3"
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              >
                <span className="flex items-center gap-1">
                  Nom
                  {sortDir === "asc" ? (
                    <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                  )}
                </span>
              </th>
              <th className="px-3 py-3">Prénom</th>
              <th className="px-3 py-3">Commune</th>
              <th className="px-3 py-3">Coach de</th>
              <th className="px-3 py-3">Équipe</th>
              <th className="px-3 py-3">Email</th>
              <th className="px-3 py-3">Téléphone</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((m, index) => (
              <tr
                key={m.id}
                onClick={() => setDetailMemberId(m.id)}
                className={`cursor-pointer border-b border-slate-100 last:border-0 transition-colors duration-150 hover:bg-amber-50/40 ${
                  index % 2 === 1 ? "bg-slate-50/50" : ""
                } ${m.archivedAt ? "opacity-50" : ""}`}
              >
                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(m.id)}
                    onChange={() => toggleOne(m.id)}
                    className="h-4 w-4 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
                  />
                </td>
                <td className="px-3 py-3 text-xs text-zinc-400">{index + 1}</td>
                <td
                  className="truncate px-3 py-3 font-semibold text-zinc-900"
                  title={
                    m.bureauRole ? `${fullLastName(m)} — ${m.bureauRole}` : fullLastName(m)
                  }
                >
                  <span className="inline-flex items-center gap-1">
                    {fullLastName(m)}
                    {m.bureauRole && (
                      <Shield className="h-3.5 w-3.5 shrink-0 text-ubac-yellow-dark" />
                    )}
                  </span>
                  {m.archivedAt && (
                    <span className="ml-1.5 rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-500">
                      Archivé
                    </span>
                  )}
                </td>
                <td className="truncate px-3 py-3 text-zinc-700" title={m.firstName ?? undefined}>
                  {m.firstName ?? "—"}
                </td>
                <td className="whitespace-normal break-words px-3 py-3 text-zinc-600">
                  {m.city ?? "—"}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1 overflow-hidden">
                    {m.coachTeams.length === 0 && m.pendingCoachTeams.length === 0 ? (
                      <span className="text-xs text-zinc-400">—</span>
                    ) : (
                      <>
                        {m.coachTeams.map((t) => (
                          <span
                            key={`coach-${t.id}`}
                            className="max-w-full truncate rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700"
                          >
                            {t.category ?? t.name ?? "Équipe"}
                          </span>
                        ))}
                        {m.pendingCoachTeams.map((t) => (
                          <span
                            key={`pending-coach-${t.id}`}
                            className="flex max-w-full items-center gap-1 truncate rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700"
                          >
                            <Clock className="h-3 w-3 shrink-0" />
                            {t.category ?? t.name ?? "Équipe"}
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap items-center gap-1 overflow-hidden">
                    {m.teams.length === 0 ? (
                      <span className="text-xs text-zinc-400">—</span>
                    ) : (
                      m.teams.map((t) => (
                        <span
                          key={`player-${t.id}`}
                          className="max-w-full truncate rounded-full bg-navy/10 px-2 py-0.5 text-xs font-semibold text-navy"
                        >
                          {t.category ?? t.name ?? "Équipe"}
                        </span>
                      ))
                    )}
                    <PlayerYearBadge
                      birthDate={m.birthDate}
                      category={m.teams[0]?.category ?? m.category}
                    />
                  </div>
                </td>
                <td className="truncate px-3 py-3 text-zinc-600" title={m.email ?? undefined}>
                  {m.email ? (
                    <span className="truncate">{m.email}</span>
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
                </td>
                <td
                  className="truncate px-3 py-3 text-zinc-600"
                  title={m.phone ?? undefined}
                  onClick={(e) => e.stopPropagation()}
                >
                  {m.phone ? (
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3 w-3 shrink-0 text-zinc-400" />
                      <span className="truncate">{m.phone}</span>
                    </span>
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
                </td>
                <td className="relative px-3 py-3" onClick={(e) => e.stopPropagation()}>
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
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              handleReactivate([m.id]);
                            }}
                            className={menuItemClass}
                          >
                            Réactiver le membre
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              handleArchive([m.id]);
                            }}
                            className={`${menuItemClass} text-red-600 hover:bg-red-50`}
                          >
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
              onArchive={() => handleArchive([detailMember.id])}
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
    </div>
  );
}
