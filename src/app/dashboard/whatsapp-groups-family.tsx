import { ExternalLink, MessageCircle } from "lucide-react";
import type { WhatsAppGroup } from "./page";

// Strictly read-only: no edit/add/remove control ever renders here,
// regardless of what the group data contains — a parent/player only
// ever sees the groups they already belong to (RLS narrows the list
// server-side) and a join button.
export default function WhatsAppGroupsFamily({ groups }: { groups: WhatsAppGroup[] }) {
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
        <div
          key={g.id}
          className="flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm"
        >
          <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
            <MessageCircle className="h-4 w-4 shrink-0 text-emerald-600" />
            {g.name}
          </span>
          {g.inviteLink ? (
            <a
              href={g.inviteLink}
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
        </div>
      ))}
    </div>
  );
}
