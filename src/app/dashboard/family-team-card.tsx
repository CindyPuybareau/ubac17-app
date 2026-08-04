"use client";

import { useState } from "react";
import { Clock, ExternalLink, MessageCircle, Users } from "lucide-react";
import WhatsAppButton from "./whatsapp-button";
import WhatsAppBulkModal from "./whatsapp-bulk-modal";
import WhatsAppGroupButton from "./whatsapp-group-button";
import PlayerYearBadge from "./player-year-badge";

type Person = { id: string; first_name: string | null; last_name: string | null };
type CoachContact = Person & { phone: string | null };
type RosterMate = Person & { birthDate: string | null };

export type FamilyTeamCardData = {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string | null;
  category: string | null;
  coaches: CoachContact[];
  roster: RosterMate[];
  ffbbUrl: string | null;
  sortOrder: number | null;
  pendingCoachNames: string | null;
};

function fullName(p: Person) {
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || "Sans nom";
}

export default function FamilyTeamCard({ card }: { card: FamilyTeamCardData }) {
  const [contactCoachesOpen, setContactCoachesOpen] = useState(false);
  const reachableCoaches = card.coaches.filter((c) => c.phone);

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-ubac-blue">
        Équipe de {card.playerName}
      </p>
      <h3 className="mt-1 font-semibold text-zinc-900">
        {card.teamName ?? "Équipe"}
        {card.category && card.category !== card.teamName ? ` · ${card.category}` : ""}
      </h3>

      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Coachs
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {card.coaches.map((c) => (
              <li
                key={c.id}
                className="truncate rounded-lg bg-zinc-50 px-2 py-1 text-sm text-zinc-700"
              >
                {fullName(c)}
              </li>
            ))}
            {card.pendingCoachNames && (
              <li className="flex items-center gap-1.5 truncate rounded-lg bg-amber-50 px-2 py-1 text-sm text-amber-700">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                {card.pendingCoachNames}
                <span className="text-xs text-amber-500">(en attente de compte)</span>
              </li>
            )}
            {card.coaches.length === 0 && !card.pendingCoachNames && (
              <li className="text-sm text-zinc-400">Aucun coach assigné</li>
            )}
          </ul>
          {reachableCoaches.length === 1 ? (
            <WhatsAppButton
              phone={reachableCoaches[0].phone}
              message={`Bonjour, je suis un parent de l'équipe ${card.teamName ?? ""}.`}
              label="Contacter le coach"
              className="mt-2 flex items-center gap-1.5 rounded-full border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
            />
          ) : (
            reachableCoaches.length > 1 && (
              <button
                onClick={() => setContactCoachesOpen(true)}
                className="mt-2 flex items-center gap-1.5 rounded-full border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Contacter les coachs
              </button>
            )
          )}
        </div>

        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <Users className="h-3.5 w-3.5" />
            Joueurs
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {card.roster.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-2 py-1 text-sm text-zinc-700"
              >
                <span className="truncate">{fullName(p)}</span>
                <PlayerYearBadge birthDate={p.birthDate} category={card.category} />
              </li>
            ))}
            {card.roster.length === 0 && (
              <li className="text-sm text-zinc-400">Aucun joueur</li>
            )}
          </ul>
        </div>
      </div>

      <div className="mt-3">
        <WhatsAppGroupButton
          teamName={card.teamName ?? "l'équipe"}
          defaultMessage={`Bonjour à tous, je suis un parent de l'équipe ${card.teamName ?? ""}.`}
          className="flex items-center gap-1.5 rounded-full border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
        />
      </div>

      {card.ffbbUrl && (
        <a
          href={card.ffbbUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-ubac-blue hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          Voir la fiche équipe FFBB
        </a>
      )}

      {contactCoachesOpen && (
        <WhatsAppBulkModal
          title="Contacter les coachs"
          contacts={card.coaches.map((c) => ({
            id: c.id,
            name: fullName(c),
            phone: c.phone,
          }))}
          defaultMessage={`Bonjour, je suis un parent de l'équipe ${card.teamName ?? ""}.`}
          onClose={() => setContactCoachesOpen(false)}
        />
      )}
    </div>
  );
}
