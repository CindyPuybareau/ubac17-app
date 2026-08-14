"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPersonName } from "@/lib/names";

type Person = { id: string; firstName: string | null; lastName: string | null };

function fullName(p: Person) {
  return formatPersonName(p.firstName, p.lastName);
}

// Gère le lien d'invitation et les membres d'UN groupe WhatsApp d'équipe
// depuis la carte d'équipe elle-même — plus besoin d'un onglet séparé pour
// ça : le coach n'a plus qu'un seul endroit où gérer son équipe.
export default function TeamWhatsAppSettings({
  groupId,
  groupName,
  inviteLink,
  members,
  candidates,
}: {
  groupId: string;
  groupName: string;
  inviteLink: string | null;
  members: Person[];
  candidates: Person[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [linkInput, setLinkInput] = useState(inviteLink ?? "");
  const [saving, setSaving] = useState(false);
  const [addingId, setAddingId] = useState("");

  const memberIds = new Set(members.map((m) => m.id));
  const availableCandidates = candidates.filter((c) => !memberIds.has(c.id));

  async function saveLink() {
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from("whatsapp_groups")
      .update({ invite_link: linkInput || null })
      .eq("id", groupId);
    setSaving(false);
    router.refresh();
  }

  async function addMember(playerId: string) {
    if (!playerId) return;
    const supabase = createClient();
    await supabase
      .from("whatsapp_group_members")
      .insert({ group_id: groupId, player_id: playerId });
    setAddingId("");
    router.refresh();
  }

  async function removeMember(playerId: string) {
    const supabase = createClient();
    await supabase
      .from("whatsapp_group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("player_id", playerId);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Configurer WhatsApp"
        className="flex shrink-0 items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-50"
      >
        <Settings className="h-3.5 w-3.5" />
        Configurer WhatsApp
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 font-semibold text-zinc-900">
                <Settings className="h-4 w-4 shrink-0 text-zinc-500" />
                Groupe WhatsApp {groupName}
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Lien d&apos;invitation
            </label>
            <div className="flex items-center gap-1.5">
              <input
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                placeholder="https://chat.whatsapp.com/..."
                className="flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
              <button
                onClick={saveLink}
                disabled={saving || linkInput === (inviteLink ?? "")}
                className="shrink-0 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50"
              >
                {saving ? "..." : "Enregistrer"}
              </button>
            </div>

            <p className="mb-1 mt-4 text-xs font-medium text-zinc-600">
              Membres ({members.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {members.length === 0 ? (
                <span className="text-xs text-zinc-400">Aucun membre pour le moment.</span>
              ) : (
                members.map((m) => (
                  <span
                    key={m.id}
                    className="flex items-center gap-1 rounded-full bg-zinc-50 px-2 py-1 text-xs text-zinc-700"
                  >
                    {fullName(m)}
                    <button
                      onClick={() => removeMember(m.id)}
                      title="Retirer du groupe"
                      className="text-zinc-400 hover:text-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
            </div>

            {availableCandidates.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5">
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
        </div>
      )}
    </>
  );
}
