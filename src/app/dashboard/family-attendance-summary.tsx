"use client";

import { CalendarCheck2 } from "lucide-react";
import type { AdminUpcomingEvent } from "./page";

// Encart discret : sur les rassemblements passés de l'équipe, combien de
// fois l'enfant a répondu présent. Une réponse "en attente" (jamais
// répondu) n'est comptée ni pour ni contre — seule une réponse donnée dit
// quelque chose sur l'assiduité réelle.
export default function FamilyAttendanceSummary({
  events,
  players,
  rsvpStatusByKey,
}: {
  events: AdminUpcomingEvent[];
  players: { id: string; name: string; teamIds: string[] }[];
  rsvpStatusByKey: Record<string, string>;
}) {
  const now = Date.now();

  const stats = players.map((p) => {
    // Retour d'audit du 28/08 : !e.teamId seul traitait à tort un
    // événement ciblant des équipes précises (targetTeamIds) comme
    // "toute la famille" — le bilan comptait des rendez-vous hors des
    // équipes réelles de l'enfant.
    const past = events.filter(
      (e) =>
        new Date(e.start_time).getTime() < now &&
        (e.teamId
          ? p.teamIds.includes(e.teamId)
          : e.targetTeamIds
            ? e.targetTeamIds.some((id) => p.teamIds.includes(id))
            : true)
    );
    let present = 0;
    let total = 0;
    past.forEach((e) => {
      const status = rsvpStatusByKey[`${e.id}:${p.id}`];
      if (!status || status === "PENDING") return;
      total += 1;
      if (status === "PRESENT" || status === "LATE") present += 1;
    });
    return { id: p.id, name: p.name, present, total };
  });

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm sm:p-5">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <CalendarCheck2 className="h-3.5 w-3.5 text-blue-700" />
        Bilan de présence
      </p>
      <div className="flex flex-col gap-1.5">
        {stats.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-zinc-600">{s.name}</span>
            {s.total > 0 ? (
              <span className="shrink-0 font-semibold tabular-nums text-zinc-900">
                {s.present} / {s.total} présences
              </span>
            ) : (
              <span className="shrink-0 text-xs text-zinc-400">Pas encore d&apos;historique</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
