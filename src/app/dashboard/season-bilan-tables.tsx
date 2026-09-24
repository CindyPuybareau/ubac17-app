"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Award,
  Car,
  CalendarDays,
  HandHeart,
  Handshake,
  ShieldCheck,
  Sparkles,
  Trophy,
} from "lucide-react";
import { formatPersonName } from "@/lib/names";
import type { RosterPlayer } from "./team-manager";
import type { SeasonParticipationTally, SeasonVolunteerTally } from "./season-bilan";

function fullName(p: RosterPlayer) {
  return formatPersonName(p.first_name, p.last_name);
}

// Barre de progression colorée plutôt qu'un simple "12/15" brut -- l'oeil
// repère en un coup d'oeil qui a une assiduité faible sans lire le chiffre
// (retour de Cindy du 24/09, "trouver une maquette sympa niveau visuel").
function AttendanceBar({ present, total }: { present: number; total: number }) {
  if (total === 0) {
    return <span className="text-xs text-zinc-300">—</span>;
  }
  const rate = present / total;
  const barColor = rate < 0.5 ? "bg-red-500" : rate < 0.8 ? "bg-amber-500" : "bg-emerald-500";
  const textColor = rate < 0.5 ? "text-red-600" : rate < 0.8 ? "text-amber-600" : "text-emerald-700";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-zinc-100">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.round(rate * 100)}%` }} />
      </div>
      <span className={`shrink-0 text-xs font-semibold tabular-nums ${textColor}`}>
        {present}/{total}
      </span>
    </div>
  );
}

// Pastille à icône plutôt qu'une colonne de chiffre nu -- même esprit que
// les pastilles de rôle déjà utilisées ailleurs dans l'appli (badges
// Coach/Joueur, TaskSourceBadge...), pas une colonne de tableau de plus.
function CountChip({
  icon,
  count,
  colorClass,
}: {
  icon: React.ReactNode;
  count: number;
  colorClass: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
        count === 0 ? "bg-zinc-50 text-zinc-300" : colorClass
      }`}
    >
      {icon}
      {count}
    </span>
  );
}

// Médaille pour le podium (retour de Cindy, "une maquette sympa") -- Lucide
// uniquement (règle du club, jamais d'emoji système), couleur or/argent/
// bronze pour les 3 premiers d'un classement déjà trié par l'appelant.
function PodiumMedal({ rank }: { rank: number }) {
  if (rank > 3) return null;
  const colorClass =
    rank === 1
      ? "text-amber-500"
      : rank === 2
        ? "text-zinc-400"
        : "text-orange-700";
  return <Award className={`h-4 w-4 shrink-0 ${colorClass}`} />;
}

type SortDir = "asc" | "desc";

function SortableHeader<K extends string>({
  sortKey,
  currentKey,
  currentDir,
  label,
  icon,
  onSort,
}: {
  sortKey: K;
  currentKey: K;
  currentDir: SortDir;
  label: string;
  icon?: React.ReactNode;
  onSort: (key: K) => void;
}) {
  return (
    <th className="whitespace-nowrap px-3 py-2.5">
      <button
        onClick={() => onSort(sortKey)}
        className="flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-navy"
      >
        {icon}
        {label}
        {currentKey === sortKey && (
          <span className="text-[10px]">{currentDir === "asc" ? "▲" : "▼"}</span>
        )}
      </button>
    </th>
  );
}

// Onglet "Joueurs" : assiduité (déjà existante) + participation par type
// d'événement (retour de Cindy du 24/09 -- l'ancien tableau ne comptait que
// des rôles Maillots/Table de marque, un catalogue vide depuis longtemps).
type ParticipationSortKey = "name" | "attendance" | "official" | "friendly" | "tournament" | "other";

export function ParticipationTable({
  roster,
  attendanceByPlayerId,
  tallyByPlayerId,
  teamNameByPlayerId,
}: {
  roster: RosterPlayer[];
  attendanceByPlayerId: Record<string, { present: number; total: number }>;
  tallyByPlayerId: Record<string, SeasonParticipationTally>;
  // Bureau seulement (vue club entier, plusieurs équipes mélangées) : nom
  // d'équipe affiché à côté du joueur -- absent côté Coach (une seule
  // équipe déjà affichée par le sélecteur de pastilles au-dessus).
  teamNameByPlayerId?: Record<string, string>;
}) {
  const [sortKey, setSortKey] = useState<ParticipationSortKey>("attendance");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(key: ParticipationSortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    setSortDir(key === "name" ? "asc" : "desc");
  }

  const rows = useMemo(() => {
    const list = roster.map((p) => {
      const attendance = attendanceByPlayerId[p.id] ?? { present: 0, total: 0 };
      const tally = tallyByPlayerId[p.id] ?? { official: 0, friendly: 0, tournament: 0, other: 0 };
      return { id: p.id, name: fullName(p), attendance, tally };
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name, "fr") * dir;
      if (sortKey === "attendance") {
        const rateA = a.attendance.total > 0 ? a.attendance.present / a.attendance.total : null;
        const rateB = b.attendance.total > 0 ? b.attendance.present / b.attendance.total : null;
        if (rateA === null && rateB === null) return a.name.localeCompare(b.name, "fr");
        if (rateA === null) return 1;
        if (rateB === null) return -1;
        const diff = (rateA - rateB) * dir;
        return diff !== 0 ? diff : a.name.localeCompare(b.name, "fr");
      }
      const diff = (a.tally[sortKey] - b.tally[sortKey]) * dir;
      return diff !== 0 ? diff : a.name.localeCompare(b.name, "fr");
    });
  }, [roster, attendanceByPlayerId, tallyByPlayerId, sortKey, sortDir]);

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-zinc-100">
      <table className="w-full table-auto border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-semibold text-zinc-400">
            <SortableHeader sortKey="name" currentKey={sortKey} currentDir={sortDir} label="Joueur" onSort={toggleSort} />
            <SortableHeader
              sortKey="attendance"
              currentKey={sortKey}
              currentDir={sortDir}
              label="Entraînements"
              icon={<Activity className="h-3.5 w-3.5 shrink-0" />}
              onSort={toggleSort}
            />
            <SortableHeader
              sortKey="official"
              currentKey={sortKey}
              currentDir={sortDir}
              label="Officiels"
              icon={<Trophy className="h-3.5 w-3.5 shrink-0" />}
              onSort={toggleSort}
            />
            <SortableHeader
              sortKey="friendly"
              currentKey={sortKey}
              currentDir={sortDir}
              label="Amicaux"
              icon={<Handshake className="h-3.5 w-3.5 shrink-0" />}
              onSort={toggleSort}
            />
            <SortableHeader
              sortKey="tournament"
              currentKey={sortKey}
              currentDir={sortDir}
              label="Tournois"
              icon={<Sparkles className="h-3.5 w-3.5 shrink-0" />}
              onSort={toggleSort}
            />
            <SortableHeader
              sortKey="other"
              currentKey={sortKey}
              currentDir={sortDir}
              label="Autres"
              icon={<CalendarDays className="h-3.5 w-3.5 shrink-0" />}
              onSort={toggleSort}
            />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-zinc-50 last:border-0">
              <td className="w-auto px-3 py-2.5 font-semibold text-zinc-800">
                {r.name}
                {teamNameByPlayerId?.[r.id] && (
                  <span className="ml-1.5 text-xs font-normal text-zinc-400">
                    · {teamNameByPlayerId[r.id]}
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">
                <AttendanceBar present={r.attendance.present} total={r.attendance.total} />
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">
                <CountChip icon={<Trophy className="h-3 w-3" />} count={r.tally.official} colorClass="bg-navy/10 text-navy" />
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">
                <CountChip icon={<Handshake className="h-3 w-3" />} count={r.tally.friendly} colorClass="bg-blue-50 text-blue-700" />
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">
                <CountChip icon={<Sparkles className="h-3 w-3" />} count={r.tally.tournament} colorClass="bg-ubac-yellow/20 text-ubac-yellow-dark" />
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">
                <CountChip icon={<CalendarDays className="h-3 w-3" />} count={r.tally.other} colorClass="bg-zinc-100 text-zinc-600" />
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-4 text-center text-sm text-zinc-400">
                Aucun joueur dans cette équipe
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Onglet "Bénévoles" : classement par total décroissant par défaut (retour
// de Cindy, esprit "podium") -- Buvette/Goûter/Lavage maillots/besoins
// personnalisés, rôles officiels de match, covoiturage proposé.
type VolunteerSortKey = "name" | "classique" | "officiel" | "covoiturage" | "total";

export function VolunteerTable({
  roster,
  tallyByPlayerId,
  teamNameByPlayerId,
}: {
  roster: RosterPlayer[];
  tallyByPlayerId: Record<string, SeasonVolunteerTally>;
  teamNameByPlayerId?: Record<string, string>;
}) {
  const [sortKey, setSortKey] = useState<VolunteerSortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: VolunteerSortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    setSortDir(key === "name" ? "asc" : "desc");
  }

  const rows = useMemo(() => {
    const list = roster.map((p) => {
      const tally = tallyByPlayerId[p.id] ?? { classique: 0, officiel: 0, covoiturage: 0 };
      const total = tally.classique + tally.officiel + tally.covoiturage;
      return { id: p.id, name: fullName(p), tally, total };
    });
    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = list.sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name, "fr") * dir;
      const key = sortKey === "total" ? "total" : sortKey;
      const diff = ((a as unknown as Record<string, number>)[key] - (b as unknown as Record<string, number>)[key]) * dir;
      return diff !== 0 ? diff : a.name.localeCompare(b.name, "fr");
    });
    return sorted;
  }, [roster, tallyByPlayerId, sortKey, sortDir]);

  // Le podium (médailles) ne s'applique qu'au classement RÉEL par total
  // décroissant, jamais quand on trie sur autre chose (une médaille sur le
  // 3e du tri "Covoiturage" alors qu'il n'est pas dans le top 3 réel serait
  // trompeuse) -- calculé une fois, indépendamment du tri affiché.
  const rankByPlayerId = useMemo(() => {
    const byTotal = [...rows].sort((a, b) => b.total - a.total);
    const map = new Map<string, number>();
    byTotal.forEach((r, i) => {
      if (r.total > 0) map.set(r.id, i + 1);
    });
    return map;
  }, [rows]);

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-zinc-100">
      <table className="w-full table-auto border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-semibold text-zinc-400">
            <SortableHeader sortKey="name" currentKey={sortKey} currentDir={sortDir} label="Famille / Joueur" onSort={toggleSort} />
            <SortableHeader
              sortKey="classique"
              currentKey={sortKey}
              currentDir={sortDir}
              label="Buvette / Goûter / Maillots"
              icon={<HandHeart className="h-3.5 w-3.5 shrink-0" />}
              onSort={toggleSort}
            />
            <SortableHeader
              sortKey="officiel"
              currentKey={sortKey}
              currentDir={sortDir}
              label="Rôles officiels"
              icon={<ShieldCheck className="h-3.5 w-3.5 shrink-0" />}
              onSort={toggleSort}
            />
            <SortableHeader
              sortKey="covoiturage"
              currentKey={sortKey}
              currentDir={sortDir}
              label="Covoiturage"
              icon={<Car className="h-3.5 w-3.5 shrink-0" />}
              onSort={toggleSort}
            />
            <SortableHeader sortKey="total" currentKey={sortKey} currentDir={sortDir} label="Total" onSort={toggleSort} />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const rank = rankByPlayerId.get(r.id);
            return (
              <tr key={r.id} className="border-b border-zinc-50 last:border-0">
                <td className="w-auto px-3 py-2.5 font-semibold text-zinc-800">
                  <span className="flex items-center gap-1.5">
                    {rank && <PodiumMedal rank={rank} />}
                    {r.name}
                    {teamNameByPlayerId?.[r.id] && (
                      <span className="text-xs font-normal text-zinc-400">
                        · {teamNameByPlayerId[r.id]}
                      </span>
                    )}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <CountChip icon={<HandHeart className="h-3 w-3" />} count={r.tally.classique} colorClass="bg-emerald-50 text-emerald-700" />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <CountChip icon={<ShieldCheck className="h-3 w-3" />} count={r.tally.officiel} colorClass="bg-terracotta/10 text-terracotta-dark" />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <CountChip icon={<Car className="h-3 w-3" />} count={r.tally.covoiturage} colorClass="bg-blue-50 text-blue-700" />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <span className={`font-semibold tabular-nums ${r.total === 0 ? "text-zinc-300" : "text-zinc-900"}`}>
                    {r.total}
                  </span>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-4 text-center text-sm text-zinc-400">
                Aucun joueur dans cette équipe
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
