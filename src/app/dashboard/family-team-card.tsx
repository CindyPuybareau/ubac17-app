"use client";

import { useState } from "react";
import { CalendarDays, Clock, ExternalLink, MapPin, MessageCircle, Users } from "lucide-react";
import { formatEventTime, styleFor } from "./calendar-view";
import OpponentDisplay from "./opponent-display";
import SalleBadge from "./salle-badge";
import WhatsAppButton from "./whatsapp-button";
import WhatsAppBulkModal from "./whatsapp-bulk-modal";
import WhatsAppGroupButton from "./whatsapp-group-button";
import PlayerYearBadge from "./player-year-badge";

type Person = { id: string; first_name: string | null; last_name: string | null };
type CoachContact = Person & { phone: string | null };
type RosterMate = Person & { birthDate: string | null };
type TeamEvent = {
  id: string;
  title: string | null;
  event_type: string | null;
  location: string | null;
  salle: string | null;
  start_time: string;
  end_time: string | null;
};

export type FamilyTeamCardData = {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string | null;
  category: string | null;
  coaches: CoachContact[];
  // Named coaches assigned via a member's fiche (team_pending_coaches)
  // before they have a real account yet — same source as the Membres
  // table's amber "en attente" badge.
  pendingCoaches: Person[];
  roster: RosterMate[];
  events: TeamEvent[];
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
    <div className="rounded-2xl border border-t-4 border-zinc-100 border-t-ubac-yellow bg-white p-5 shadow-sm">
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
            {card.pendingCoaches.map((c) => (
              <li
                key={`pending-${c.id}`}
                className="truncate rounded-lg bg-zinc-50 px-2 py-1 text-sm text-zinc-700"
              >
                {fullName(c)}
              </li>
            ))}
            {/* Legacy free-text fallback, only shown if this team has no
                structured pending coach (team_pending_coaches) at all —
                keeps older, never-migrated teams from silently going blank. */}
            {card.pendingCoaches.length === 0 && card.pendingCoachNames && (
              <li className="truncate rounded-lg bg-zinc-50 px-2 py-1 text-sm text-zinc-700">
                {card.pendingCoachNames}
              </li>
            )}
            {card.coaches.length === 0 &&
              card.pendingCoaches.length === 0 &&
              !card.pendingCoachNames && (
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

      <div className="mt-4">
        <div className="mb-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
            <CalendarDays className="h-3.5 w-3.5" />
            Prochains événements
          </p>
          <p className="text-[11px] text-zinc-400">
            Matchs, entraînements &amp; événements du club
          </p>
        </div>
        {card.events.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {card.events.map((e) => {
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
                      {e.event_type === "MATCH" ? (
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
