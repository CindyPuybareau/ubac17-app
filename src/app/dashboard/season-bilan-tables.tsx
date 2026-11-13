"use client";

import { useMemo, useState } from "react";
import { Activity, Car, CalendarDays, Handshake, Sparkles, Trophy } from "lucide-react";
import { formatPersonName } from "@/lib/names";
import RoleIcon from "./role-icon";
import { CUSTOM_ROLE_CODE, STANDARD_VOLUNTEER_ROLES } from "./event-volunteer-needs";
import { MATCH_OFFICIAL_ROLES } from "./match-official-roles";
import type { RosterPlayer } from "./team-manager";
import type { SeasonParticipationTally, SeasonVolunteerTally } from "./season-bilan";

function fullName(p: RosterPlayer) {
  return formatPersonName(p.first_name, p.last_name);
}

// Barre de progression colorée plutôt qu'un simple "12/15" brut -- l'oeil
// repère en un coup d'oeil qui a une assiduité faible sans lire le chiffre
// (retour de Cindy du 24/09, "trouver une maquette sympa niveau visuel").
function AttendanceBar({ present, total, wide = false }: { present: number; total: number; wide?: boolean }) {
  if (total === 0) {
    return <span className="text-xs text-zinc-400">Aucun entraînement passé</span>;
  }
  const rate = present / total;
  const barColor = rate < 0.5 ? "bg-red-500" : rate < 0.8 ? "bg-amber-500" : "bg-emerald-500";
  const textColor = rate < 0.5 ? "text-red-600" : rate < 0.8 ? "text-amber-600" : "text-emerald-700";
  return (
    <div className={`flex items-center gap-2 ${wide ? "min-w-0 flex-1" : ""}`}>
      <div className={`h-1.5 overflow-hidden rounded-full bg-zinc-100 ${wide ? "min-w-0 flex-1" : "w-16 shrink-0"}`}>
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
type MatchKind = "official" | "friendly" | "tournament" | "other";

// Retour de Cindy du 13/11 : les matchs en "présent/total" comme les
// entraînements ("Officiels 1" ne disait pas sur combien), et une colonne
// n'apparaît que si l'équipe a eu au moins un rendez-vous de ce type
// (Amicaux/Tournois souvent à 0 pour tout le monde = du gris pour rien).
const MATCH_KINDS: {
  key: MatchKind;
  label: string;
  Icon: typeof Trophy;
  colorClass: string;
}[] = [
  { key: "official", label: "Officiels", Icon: Trophy, colorClass: "bg-navy/10 text-navy" },
  { key: "friendly", label: "Amicaux", Icon: Handshake, colorClass: "bg-blue-50 text-blue-700" },
  { key: "tournament", label: "Tournois", Icon: Sparkles, colorClass: "bg-ubac-yellow/20 text-ubac-yellow-dark" },
  { key: "other", label: "Autres", Icon: CalendarDays, colorClass: "bg-zinc-100 text-zinc-600" },
];

function RatioChip({
  icon,
  present,
  total,
  colorClass,
  label,
}: {
  icon: React.ReactNode;
  present: number;
  total: number;
  colorClass: string;
  label?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
        present === 0 ? "bg-zinc-50 text-zinc-400" : colorClass
      }`}
    >
      {icon}
      {label && <span className="font-medium">{label}</span>}
      {present}/{total}
    </span>
  );
}

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
  // desc (retour de Cindy du 24/09, "mettre ceux qui viennent le plus...
  // en premier") : la présence aux entraînements la PLUS FORTE apparaît en
  // premier par défaut.
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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
      const empty = { present: 0, total: 0 };
      const tally = tallyByPlayerId[p.id] ?? {
        official: empty,
        friendly: empty,
        tournament: empty,
        other: empty,
      };
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
      const diff = (a.tally[sortKey].present - b.tally[sortKey].present) * dir;
      return diff !== 0 ? diff : a.name.localeCompare(b.name, "fr");
    });
  }, [roster, attendanceByPlayerId, tallyByPlayerId, sortKey, sortDir]);

  const visibleKinds = MATCH_KINDS.filter((k) => rows.some((r) => r.tally[k.key].total > 0));

  if (rows.length === 0) {
    return <p className="py-4 text-center text-sm text-zinc-400">Aucun joueur dans cette équipe</p>;
  }

  return (
    <>
      {/* Téléphone (retour de Cindy du 13/11) : une carte par joueur plutôt
          qu'un tableau qui défilait de côté (noms sur 2 lignes, colonnes
          coupées). */}
      <div className="flex flex-col gap-2 md:hidden">
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          Trier par
          {(
            [
              { key: "attendance", label: "Présence" },
              { key: "name", label: "Nom" },
            ] as const
          ).map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => toggleSort(s.key)}
              className={`rounded-full border px-2.5 py-1 font-semibold transition-colors ${
                sortKey === s.key
                  ? "border-navy bg-navy text-white"
                  : "border-navy/25 bg-navy/5 text-navy hover:bg-navy/10"
              }`}
            >
              {s.label}
              {sortKey === s.key && <span className="ml-1 text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
            </button>
          ))}
        </div>
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-100">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1.5 px-3 py-2.5">
              <p className="truncate text-sm font-semibold text-zinc-900">
                {r.name}
                {teamNameByPlayerId?.[r.id] && (
                  <span className="ml-1.5 text-xs font-normal text-zinc-400">· {teamNameByPlayerId[r.id]}</span>
                )}
              </p>
              <div className="flex items-center gap-2">
                <span className="flex shrink-0 items-center gap-1 text-xs text-zinc-500">
                  <Activity className="h-3.5 w-3.5 shrink-0" />
                  Entraînements
                </span>
                <AttendanceBar present={r.attendance.present} total={r.attendance.total} wide />
              </div>
              {visibleKinds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {visibleKinds.map(({ key, label, Icon, colorClass }) => (
                    <RatioChip
                      key={key}
                      icon={<Icon className="h-3 w-3" />}
                      label={label}
                      present={r.tally[key].present}
                      total={r.tally[key].total}
                      colorClass={colorClass}
                    />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="hidden w-full overflow-x-auto rounded-xl border border-zinc-100 md:block">
        <table className="w-full table-auto border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-semibold text-zinc-500">
              <SortableHeader sortKey="name" currentKey={sortKey} currentDir={sortDir} label="Joueur" onSort={toggleSort} />
              <SortableHeader
                sortKey="attendance"
                currentKey={sortKey}
                currentDir={sortDir}
                label="Entraînements"
                icon={<Activity className="h-3.5 w-3.5 shrink-0" />}
                onSort={toggleSort}
              />
              {visibleKinds.map(({ key, label, Icon }) => (
                <SortableHeader
                  key={key}
                  sortKey={key}
                  currentKey={sortKey}
                  currentDir={sortDir}
                  label={label}
                  icon={<Icon className="h-3.5 w-3.5 shrink-0" />}
                  onSort={toggleSort}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-zinc-50 last:border-0">
                <td className="w-auto px-3 py-2.5 font-semibold text-zinc-900">
                  {r.name}
                  {teamNameByPlayerId?.[r.id] && (
                    <span className="ml-1.5 text-xs font-normal text-zinc-400">· {teamNameByPlayerId[r.id]}</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <AttendanceBar present={r.attendance.present} total={r.attendance.total} />
                </td>
                {visibleKinds.map(({ key, Icon, colorClass }) => (
                  <td key={key} className="whitespace-nowrap px-3 py-2.5">
                    <RatioChip
                      icon={<Icon className="h-3 w-3" />}
                      present={r.tally[key].present}
                      total={r.tally[key].total}
                      colorClass={colorClass}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Onglet "Bénévoles" : un compteur par rôle, jamais regroupés (retour de
// Cindy du 24/09, "une colonne buvette, une colonne goûter, une colonne
// maillot, une colonne covoiturage... les rôles officiels même chose, ils
// doivent être tous visibles pas regroupés ensemble") -- le catalogue
// classique (event-volunteer-needs.ts) + "Autre", puis le catalogue
// officiel (match-official-roles.ts) au complet, puis covoiturage. Table
// large par construction (13 colonnes de compteur) : overflow-x-auto porte
// déjà le défilement horizontal, mêmes icônes que partout ailleurs dans
// l'appli (RoleIcon) plutôt que d'en inventer de nouvelles.
const CLASSIQUE_COLUMNS = [
  ...STANDARD_VOLUNTEER_ROLES,
  { code: CUSTOM_ROLE_CODE, label: "Autre", icon: "Users" as const },
];
const OFFICIAL_COLUMNS = MATCH_OFFICIAL_ROLES;

type VolunteerRow = {
  id: string;
  name: string;
  tally: SeasonVolunteerTally;
  total: number;
  // Bénévole qui a écrit son propre nom, ou choisi par le Bureau/Coach sans
  // compte club (retour de Cindy du 24/09, "Greg Martin... il n'apparaît
  // pas ?") -- doit faire partie de CE tableau, juste repéré par un badge
  // pour rester lisible côté coach (pas un vrai membre du roster).
  isGuest: boolean;
};

function volunteerTotal(tally: SeasonVolunteerTally): number {
  const classiqueTotal = Object.values(tally.byRoleCode).reduce((sum, n) => sum + n, 0);
  const officielTotal = Object.values(tally.byOfficialCode).reduce((sum, n) => sum + n, 0);
  return classiqueTotal + officielTotal + tally.covoiturage;
}

export function VolunteerTable({
  roster,
  tallyByPlayerId,
  guestTallies = [],
  teamNameByPlayerId,
}: {
  roster: RosterPlayer[];
  tallyByPlayerId: Record<string, SeasonVolunteerTally>;
  guestTallies?: { name: string; tally: SeasonVolunteerTally }[];
  teamNameByPlayerId?: Record<string, string>;
}) {
  const [sortKey, setSortKey] = useState<string>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: string) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    setSortDir(key === "name" ? "asc" : "desc");
  }

  function sortValue(row: VolunteerRow, key: string): number {
    if (key === "total") return row.total;
    if (key === "covoiturage") return row.tally.covoiturage;
    if (key.startsWith("role:")) return row.tally.byRoleCode[key.slice(5)] ?? 0;
    if (key.startsWith("official:")) return row.tally.byOfficialCode[key.slice(9)] ?? 0;
    return 0;
  }

  const rows = useMemo(() => {
    const rosterRows: VolunteerRow[] = roster.map((p) => {
      const tally = tallyByPlayerId[p.id] ?? { byRoleCode: {}, byOfficialCode: {}, covoiturage: 0 };
      return { id: p.id, name: fullName(p), tally, total: volunteerTotal(tally), isGuest: false };
    });
    const guestRows: VolunteerRow[] = guestTallies.map(({ name, tally }) => ({
      id: `guest:${name}`,
      name,
      tally,
      total: volunteerTotal(tally),
      isGuest: true,
    }));
    const list = [...rosterRows, ...guestRows];
    const dir = sortDir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name, "fr") * dir;
      const diff = (sortValue(a, sortKey) - sortValue(b, sortKey)) * dir;
      return diff !== 0 ? diff : a.name.localeCompare(b.name, "fr");
    });
  }, [roster, tallyByPlayerId, guestTallies, sortKey, sortDir]);

  const columnCount = CLASSIQUE_COLUMNS.length + OFFICIAL_COLUMNS.length + 2 /* covoiturage, total */ + 1 /* nom */;

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-zinc-100">
      <table className="w-full table-auto border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-semibold text-zinc-400">
            <SortableHeader sortKey="name" currentKey={sortKey} currentDir={sortDir} label="Famille / Joueur" onSort={toggleSort} />
            {CLASSIQUE_COLUMNS.map((role) => (
              <SortableHeader
                key={role.code}
                sortKey={`role:${role.code}`}
                currentKey={sortKey}
                currentDir={sortDir}
                label={role.label}
                icon={<RoleIcon icon={role.icon} className="h-3.5 w-3.5 shrink-0" />}
                onSort={toggleSort}
              />
            ))}
            {OFFICIAL_COLUMNS.map((role) => (
              <SortableHeader
                key={role.code}
                sortKey={`official:${role.code}`}
                currentKey={sortKey}
                currentDir={sortDir}
                label={role.label}
                icon={<RoleIcon icon={role.icon} className="h-3.5 w-3.5 shrink-0" />}
                onSort={toggleSort}
              />
            ))}
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
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-zinc-50 last:border-0">
              <td className="w-auto px-3 py-2.5 font-semibold text-zinc-800">
                <span className="flex items-center gap-1.5">
                  {r.name}
                  {r.isGuest && (
                    <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                      Invité·e
                    </span>
                  )}
                  {!r.isGuest && teamNameByPlayerId?.[r.id] && (
                    <span className="text-xs font-normal text-zinc-400">
                      · {teamNameByPlayerId[r.id]}
                    </span>
                  )}
                </span>
              </td>
              {CLASSIQUE_COLUMNS.map((role) => (
                <td key={role.code} className="whitespace-nowrap px-3 py-2.5">
                  <span className={`text-xs font-semibold tabular-nums ${(r.tally.byRoleCode[role.code] ?? 0) === 0 ? "text-zinc-300" : "text-emerald-700"}`}>
                    {r.tally.byRoleCode[role.code] ?? 0}
                  </span>
                </td>
              ))}
              {OFFICIAL_COLUMNS.map((role) => (
                <td key={role.code} className="whitespace-nowrap px-3 py-2.5">
                  <span className={`text-xs font-semibold tabular-nums ${(r.tally.byOfficialCode[role.code] ?? 0) === 0 ? "text-zinc-300" : "text-terracotta-dark"}`}>
                    {r.tally.byOfficialCode[role.code] ?? 0}
                  </span>
                </td>
              ))}
              <td className="whitespace-nowrap px-3 py-2.5">
                <CountChip icon={<Car className="h-3 w-3" />} count={r.tally.covoiturage} colorClass="bg-blue-50 text-blue-700" />
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">
                <span className={`font-semibold tabular-nums ${r.total === 0 ? "text-zinc-300" : "text-zinc-900"}`}>
                  {r.total}
                </span>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columnCount} className="px-3 py-4 text-center text-sm text-zinc-400">
                Aucun joueur dans cette équipe
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
