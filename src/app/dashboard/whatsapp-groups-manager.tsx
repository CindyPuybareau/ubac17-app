"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Plus,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPersonName } from "@/lib/names";
import { buildAppDeepLink } from "@/lib/whatsapp";
import type { WhatsAppGroup } from "./page";

type Candidate = { id: string; firstName: string | null; lastName: string | null };

function fullName(p: Candidate) {
  return formatPersonName(p.firstName, p.lastName);
}

function GroupRow({
  group,
  candidates,
  autoExpand,
}: {
  group: WhatsAppGroup;
  candidates: Candidate[];
  autoExpand: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(autoExpand);
  const [linkInput, setLinkInput] = useState(group.inviteLink ?? "");
  const [saving, setSaving] = useState(false);
  const [addingId, setAddingId] = useState("");
  const [copied, setCopied] = useState(false);

  function copyAppLink() {
    navigator.clipboard
      .writeText(buildAppDeepLink("whatsapp", { openGroup: group.id }))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
  }

  async function saveLink() {
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from("whatsapp_groups")
      .update({ invite_link: linkInput || null })
      .eq("id", group.id);
    setSaving(false);
    router.refresh();
  }

  async function addMember(playerId: string) {
    if (!playerId) return;
    const supabase = createClient();
    await supabase
      .from("whatsapp_group_members")
      .insert({ group_id: group.id, player_id: playerId });
    setAddingId("");
    router.refresh();
  }

  async function removeMember(playerId: string) {
    const supabase = createClient();
    await supabase
      .from("whatsapp_group_members")
      .delete()
      .eq("group_id", group.id)
      .eq("player_id", playerId);
    router.refresh();
  }

  const memberIds = new Set(group.members.map((m) => m.id));
  const availableCandidates = candidates.filter((c) => !memberIds.has(c.id));

  return (
    <div className="rounded-xl border border-zinc-100">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-zinc-50"
      >
        <span className="truncate text-sm font-medium text-zinc-800">{group.name}</span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold leading-none text-zinc-500">
            <Users className="h-3 w-3" />
            {group.members.length}
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-zinc-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-zinc-400" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-zinc-100 px-3 py-3">
          {group.canManage ? (
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
              <input
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                placeholder="Lien d'invitation WhatsApp"
                className="flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
              <button
                onClick={saveLink}
                disabled={saving || linkInput === (group.inviteLink ?? "")}
                className="shrink-0 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50"
              >
                {saving ? "..." : "Enregistrer"}
              </button>
            </div>
          ) : (
            group.inviteLink && (
              <a
                href={group.inviteLink}
                target="_blank"
                rel="noreferrer"
                className="flex w-fit items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Rejoindre le groupe WhatsApp
              </a>
            )
          )}

          <button
            type="button"
            onClick={copyAppLink}
            title="Copier un lien à partager (ex: dans WhatsApp) pour revenir directement sur ce groupe dans UBAC"
            className="flex w-fit items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Lien copié !" : "Copier le lien de ce groupe (UBAC)"}
          </button>

          <div className="flex flex-wrap gap-1.5">
            {group.members.length === 0 ? (
              <span className="text-xs text-zinc-400">Aucun membre pour le moment.</span>
            ) : (
              group.members.map((m) => (
                <span
                  key={m.id}
                  className="flex items-center gap-1 rounded-full bg-zinc-50 px-2 py-1 text-xs text-zinc-700"
                >
                  {fullName(m)}
                  {group.canManage && (
                    <button
                      onClick={() => removeMember(m.id)}
                      title="Retirer du groupe"
                      className="text-zinc-400 hover:text-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))
            )}
          </div>

          {group.canManage && availableCandidates.length > 0 && (
            <div className="flex items-center gap-1.5">
              <select
                value={addingId}
                onChange={(e) => setAddingId(e.target.value)}
                className="flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs"
              >
                <option value="">+ Ajouter un membre...</option>
                {availableCandidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {fullName(c)}
                  </option>
                ))}
              </select>
              <button
                onClick={() => addMember(addingId)}
                disabled={!addingId}
                className="shrink-0 rounded-full bg-ubac-yellow p-1.5 text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function WhatsAppGroupsManager({
  groups,
  candidates,
}: {
  groups: WhatsAppGroup[];
  candidates: Candidate[];
}) {
  const searchParams = useSearchParams();
  const openGroupId = searchParams.get("openGroup");
  const equipeGroups = groups.filter((g) => g.category === "EQUIPE");
  const commissionGroups = groups.filter((g) => g.category === "COMMISSION");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Équipes
        </h3>
        <div className="flex flex-col gap-2">
          {equipeGroups.map((g) => (
            <GroupRow
              key={g.id}
              group={g}
              candidates={candidates}
              autoExpand={g.id === openGroupId}
            />
          ))}
          {equipeGroups.length === 0 && (
            <p className="text-sm text-zinc-400">Aucun groupe.</p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Commissions &amp; Admin
        </h3>
        <div className="flex flex-col gap-2">
          {commissionGroups.map((g) => (
            <GroupRow
              key={g.id}
              group={g}
              candidates={candidates}
              autoExpand={g.id === openGroupId}
            />
          ))}
          {commissionGroups.length === 0 && (
            <p className="text-sm text-zinc-400">Aucun groupe.</p>
          )}
        </div>
      </div>
    </div>
  );
}
