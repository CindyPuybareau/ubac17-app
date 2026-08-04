"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Copy, ExternalLink, MessageCircle } from "lucide-react";
import { buildAppDeepLink } from "@/lib/whatsapp";
import type { WhatsAppGroup } from "./page";

function GroupCard({ group, highlighted }: { group: WhatsAppGroup; highlighted: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlighted]);

  function copyAppLink() {
    navigator.clipboard
      .writeText(buildAppDeepLink("whatsapp", { openGroup: group.id }))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
  }

  return (
    <div
      ref={ref}
      className={`flex flex-col gap-2 rounded-2xl border bg-white p-4 shadow-sm transition-colors ${
        highlighted ? "border-emerald-400 ring-2 ring-emerald-200" : "border-zinc-100"
      }`}
    >
      <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
        <MessageCircle className="h-4 w-4 shrink-0 text-emerald-600" />
        {group.name}
      </span>
      {group.inviteLink ? (
        <a
          href={group.inviteLink}
          target="_blank"
          rel="noreferrer"
          className="flex w-fit items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Rejoindre le groupe WhatsApp
        </a>
      ) : (
        <span className="text-xs text-zinc-400">
          Lien non disponible pour le moment.
        </span>
      )}
      <button
        type="button"
        onClick={copyAppLink}
        title="Copier un lien à partager (ex: dans WhatsApp) pour revenir directement sur ce groupe dans UBAC"
        className="flex w-fit items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
      >
        <Copy className="h-3.5 w-3.5" />
        {copied ? "Lien copié !" : "Copier le lien (UBAC)"}
      </button>
    </div>
  );
}

// Strictly read-only: no edit/add/remove control ever renders here,
// regardless of what the group data contains — a parent/player only
// ever sees the groups they already belong to (RLS narrows the list
// server-side) and a join button.
export default function WhatsAppGroupsFamily({ groups }: { groups: WhatsAppGroup[] }) {
  const searchParams = useSearchParams();
  const openGroupId = searchParams.get("openGroup");

  if (groups.length === 0) {
    return (
      <p className="text-sm text-zinc-400">
        Aucun groupe WhatsApp associé à ta famille pour le moment.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {groups.map((g) => (
        <GroupCard key={g.id} group={g} highlighted={g.id === openGroupId} />
      ))}
    </div>
  );
}
