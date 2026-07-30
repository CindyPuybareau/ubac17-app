"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Mail,
  MoreVertical,
  Phone,
  RefreshCw,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import MemberDetailModal from "./member-detail-modal";
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

  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const [detailMemberId, setDetailMemberId] = useState<string | null>(null);

  const [reassignIds, setReassignIds] = useState<string[] | null>(null);
  const [reassignTeamId, setReassignTeamId] = useState("");
  const [reassignSaving, setReassignSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = members;
    if (teamFilter) {
      list = list.filter((m) => m.teams.some((t) => t.id === teamFilter));
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
  }, [members, teamFilter, search, sortDir]);

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

  // RLS silently returns 0 affected rows instead of an error when a policy
  // blocks a write, so a plain .error check isn't enough here — request the
  // deleted rows back and compare the count to know it actually happened.
  async function handleDelete(ids: string[]) {
    const label = ids.length > 1 ? `ces ${ids.length} membres` : "ce membre";
    const ok = window.confirm(
      `Supprimer définitivement ${label} du club ? Cette action est irréversible.`
    );
    if (!ok) return;
    setActionError(null);
    const supabase = createClient();

    const dependents: [string, ReturnType<typeof supabase.from>][] = [
      ["rsvps", supabase.from("rsvps")],
      ["team_players", supabase.from("team_players")],
      ["parent_player", supabase.from("parent_player")],
      ["cotisations", supabase.from("cotisations")],
    ];
    for (const [table, query] of dependents) {
      const { error } = await query.delete().in("player_id", ids);
      if (error) {
        setActionError(`Suppression impossible (${table}) : ${error.message}`);
        return;
      }
    }

    const { data: deleted, error: playersError } = await supabase
      .from("players")
      .delete()
      .in("id", ids)
      .select("id");

    if (playersError) {
      setActionError(`Suppression impossible : ${playersError.message}`);
      return;
    }
    if ((deleted?.length ?? 0) < ids.length) {
      setActionError(
        "Suppression bloquée par les droits d'accès (RLS). Vérifie que la migration 20260731030000_members_table_support.sql a bien été exécutée dans Supabase (SQL Editor), puis réessaie."
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

  const selectedMembers = members.filter((m) => selectedIds.has(m.id));
  const bulkEmails = selectedMembers
    .map((m) => m.email)
    .filter((e): e is string => Boolean(e));
  const bulkMailto = `mailto:?bcc=${encodeURIComponent(bulkEmails.join(","))}`;

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
              {t.name}
              {t.category ? ` · ${t.category}` : ""}
            </option>
          ))}
        </select>
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
              onClick={() => handleDelete(Array.from(selectedIds))}
              className="flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Supprimer la sélection
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
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-10" />
            <col className="w-10" />
            <col className="w-28" />
            <col />
            <col />
            <col className="w-32" />
            <col />
            <col />
            <col className="w-12" />
          </colgroup>
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
              <th className="px-2 py-2.5">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
                />
              </th>
              <th className="px-2 py-2.5">#</th>
              <th className="px-2 py-2.5">Parent</th>
              <th
                className="cursor-pointer select-none px-2 py-2.5"
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
              <th className="px-2 py-2.5">Prénom</th>
              <th className="px-2 py-2.5">Équipe</th>
              <th className="px-2 py-2.5">Email</th>
              <th className="px-2 py-2.5">Téléphone</th>
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((m, index) => (
              <tr
                key={m.id}
                onClick={() => setDetailMemberId(m.id)}
                className="cursor-pointer border-b border-zinc-50 last:border-0 hover:bg-zinc-50/60"
              >
                <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(m.id)}
                    onChange={() => toggleOne(m.id)}
                    className="h-4 w-4 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
                  />
                </td>
                <td className="px-2 py-2 text-xs text-zinc-400">{index + 1}</td>
                <td className="px-2 py-2">
                  {m.hasParent ? (
                    <span
                      title="Rattaché à un parent"
                      className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-600"
                    >
                      <Users className="h-3 w-3" />
                      Parent
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-500">
                      Autonome
                    </span>
                  )}
                </td>
                <td
                  className="truncate px-2 py-2 font-semibold text-zinc-900"
                  title={fullLastName(m)}
                >
                  {fullLastName(m)}
                </td>
                <td className="truncate px-2 py-2 text-zinc-700" title={m.firstName ?? undefined}>
                  {m.firstName ?? "—"}
                </td>
                <td className="px-2 py-2">
                  <div className="flex flex-wrap gap-1 overflow-hidden">
                    {m.teams.length === 0 ? (
                      <span className="text-xs text-zinc-400">—</span>
                    ) : (
                      m.teams.map((t) => (
                        <span
                          key={t.id}
                          className="max-w-full truncate rounded-full bg-navy/10 px-2 py-0.5 text-xs font-semibold text-navy"
                        >
                          {t.category ?? t.name ?? "Équipe"}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="truncate px-2 py-2 text-zinc-600" title={m.email ?? undefined}>
                  {m.email ? (
                    <span className="truncate">{m.email}</span>
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
                </td>
                <td className="truncate px-2 py-2 text-zinc-600" title={m.phone ?? undefined}>
                  {m.phone ? (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3 shrink-0 text-zinc-400" />
                      <span className="truncate">{m.phone}</span>
                    </span>
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
                </td>
                <td className="relative px-2 py-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() =>
                      setOpenMenuId((cur) => (cur === m.id ? null : m.id))
                    }
                    className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
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
                        {m.pendingParentEmail || m.email ? (
                          <a
                            href={`mailto:${m.pendingParentEmail ?? m.email}?subject=${encodeURIComponent(
                              "UBAC 17 - Rejoins ton espace membre"
                            )}`}
                            onClick={() => setOpenMenuId(null)}
                            className={menuItemClass}
                          >
                            Relancer / Renvoyer invitation
                          </a>
                        ) : (
                          <span
                            title="Aucun email connu pour ce membre"
                            className={`${menuItemClass} cursor-not-allowed text-zinc-300 hover:bg-transparent`}
                          >
                            Relancer / Renvoyer invitation
                          </span>
                        )}
                        <button
                          onClick={() => {
                            setOpenMenuId(null);
                            openReassign([m.id]);
                          }}
                          className={menuItemClass}
                        >
                          Changer d&apos;équipe
                        </button>
                        <button
                          onClick={() => {
                            setOpenMenuId(null);
                            handleDelete([m.id]);
                          }}
                          className={`${menuItemClass} text-red-600 hover:bg-red-50`}
                        >
                          Supprimer du club
                        </button>
                      </div>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-2 py-8 text-center text-sm text-zinc-400">
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
                  {t.name}
                  {t.category ? ` · ${t.category}` : ""}
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
