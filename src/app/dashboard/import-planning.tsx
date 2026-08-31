"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import FilePickerButton from "./file-picker-button";

type Team = { id: string; name: string | null; category: string | null };

type ParsedRow = {
  division: string;
  matchNumber: string | null;
  equipe1: string | null;
  equipe2: string | null;
  startTime: string | null;
  salle: string | null;
  isHome: boolean;
};

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

// Même correction que import-inscriptions.tsx (voir son commentaire pour
// le détail) : certains exports Google Sheets encodent une date "pure"
// avec un résidu de quelques dizaines de secondes avant minuit plutôt
// qu'un minuit propre. Arrondir au jour le plus proche absorbe ce résidu.
function excelSerialToDate(serial: number): Date {
  const utcDays = Math.round(serial - 25569);
  return new Date(utcDays * 86400 * 1000);
}

// Même arrondi pour une cellule déjà convertie en Date par la lib xlsx —
// seul le jour calendaire nous intéresse ici, l'heure vient de la colonne
// "Heure" séparée (voir combineDateTime ci-dessous).
function roundDateToDay(d: Date): Date {
  const dayMs = 86400000;
  return new Date(Math.round(d.getTime() / dayMs) * dayMs);
}

// null quand la cellule ne contient rien d'exploitable comme heure — un
// import ne doit jamais fabriquer un "00h00" qui n'existe dans aucune
// donnée source, ça se lirait comme un vrai match de minuit.
function parseHeure(value: unknown): { h: number; m: number } | null {
  const text = String(value ?? "").trim();
  const match = text.match(/(\d{1,2})\s*[h:]\s*(\d{0,2})/i);
  if (!match) return null;
  return { h: Number(match[1]), m: match[2] ? Number(match[2]) : 0 };
}

function combineDateTime(dateValue: unknown, heureValue: unknown): string | null {
  let base: Date | null = null;
  if (dateValue instanceof Date) base = roundDateToDay(dateValue);
  else if (typeof dateValue === "number") base = excelSerialToDate(dateValue);
  else if (typeof dateValue === "string" && dateValue.trim()) {
    const parsed = new Date(dateValue);
    if (!Number.isNaN(parsed.getTime())) base = parsed;
  }
  if (!base) return null;

  const parsedHeure = parseHeure(heureValue);
  if (!parsedHeure) return null;
  const { h, m } = parsedHeure;
  const combined = new Date(
    Date.UTC(
      base.getUTCFullYear(),
      base.getUTCMonth(),
      base.getUTCDate(),
      h,
      m
    )
  );
  return combined.toISOString();
}

function findTeamForDivision(division: string, teams: Team[]): Team | null {
  const normDivision = normalize(division);
  // La catégorie la PLUS LONGUE qui matche, pas la première trouvée dans
  // le tableau : avec à la fois une équipe "U13" et une équipe "U13F", une
  // division "U13F A2" contient les deux catégories comme sous-chaîne — un
  // simple .find() aurait pu assigner le match à la mauvaise équipe selon
  // l'ordre du tableau, sans la moindre erreur pour le signaler.
  let best: Team | null = null;
  let bestLength = -1;
  for (const t of teams) {
    if (!t.category) continue;
    const normCategory = normalize(t.category);
    if (normDivision.includes(normCategory) && normCategory.length > bestLength) {
      best = t;
      bestLength = normCategory.length;
    }
  }
  return best;
}

export default function ImportPlanning({
  existingTeams,
}: {
  existingTeams: Team[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  // Plus de champ éditable : c'est toujours le planning de ce club-ci qu'on
  // importe, personne ne change jamais cette valeur à la main.
  const clubKeyword = "UBAC";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setResult(null);

    // try/catch (audit du 31/08) : un fichier corrompu/pas vraiment un
    // classeur Excel faisait planter XLSX.read sans jamais passer par le
    // message d'erreur propre utilisé partout ailleurs dans ce composant.
    let wb: XLSX.WorkBook;
    try {
      const buffer = await file.arrayBuffer();
      wb = XLSX.read(buffer, { type: "array", cellDates: true });
    } catch {
      setError("Fichier illisible — vérifie que c'est bien un classeur Excel valide.");
      return;
    }
    const ws = wb.Sheets["Planning complet"];

    if (!ws) {
      setError("Feuille \"Planning complet\" introuvable dans ce fichier.");
      return;
    }

    const raw = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
    }) as unknown[][];

    const headerRow = (raw[0] ?? []).map((h) =>
      typeof h === "string" ? h.trim() : ""
    );
    const idx = {
      division: headerRow.findIndex((h) => h === "Division"),
      matchNumber: headerRow.findIndex((h) => h.startsWith("N° match")),
      equipe1: headerRow.findIndex((h) => h === "Equipe 1"),
      equipe2: headerRow.findIndex((h) => h === "Equipe 2"),
      date: headerRow.findIndex((h) => h === "Date"),
      heure: headerRow.findIndex((h) => h === "Heure"),
      salle: headerRow.findIndex((h) => h === "Salle"),
    };

    // Garde-fou (audit du 31/08) : sans ça, une colonne renommée fait
    // ignorer toutes les lignes en silence (idx.xxx = -1, "continue" plus
    // bas) — l'écran affiche juste "0 match(s) détecté(s)" sans jamais dire
    // pourquoi.
    const missingColumns = [
      idx.division < 0 ? "Division" : null,
      idx.equipe1 < 0 ? "Equipe 1" : null,
      idx.equipe2 < 0 ? "Equipe 2" : null,
      idx.date < 0 ? "Date" : null,
    ].filter((c): c is string => c !== null);
    if (missingColumns.length > 0) {
      setError(
        `Colonne(s) introuvable(s) dans le fichier : ${missingColumns.join(", ")}. Vérifie les en-têtes de la feuille "Planning complet".`
      );
      return;
    }

    const parsed: ParsedRow[] = [];
    for (let i = 1; i < raw.length; i++) {
      const r = raw[i];
      const division =
        idx.division >= 0 ? (r[idx.division] as string | null) : null;
      const dateValue = idx.date >= 0 ? r[idx.date] : null;
      if (!division || !dateValue) continue;

      const equipe1 = idx.equipe1 >= 0 ? (r[idx.equipe1] as string | null) : null;
      const equipe2 = idx.equipe2 >= 0 ? (r[idx.equipe2] as string | null) : null;
      const weAreEquipe1 = Boolean(
        equipe1 && normalize(equipe1).includes(normalize(clubKeyword))
      );
      const weAreEquipe2 = Boolean(
        equipe2 && normalize(equipe2).includes(normalize(clubKeyword))
      );
      if (!weAreEquipe1 && !weAreEquipe2) continue;

      parsed.push({
        division: String(division).trim(),
        matchNumber:
          idx.matchNumber >= 0 ? String(r[idx.matchNumber] ?? "") : null,
        equipe1,
        equipe2,
        startTime: combineDateTime(dateValue, idx.heure >= 0 ? r[idx.heure] : null),
        salle: idx.salle >= 0 ? (r[idx.salle] as string | null) : null,
        // French club plannings list the home team first.
        isHome: weAreEquipe1,
      });
    }

    setRows(parsed);
  }

  async function handleImport() {
    if (!rows) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const unmatched: string[] = [];
    // Une ligne sans heure valide (startTime null) n'est jamais importée
    // avec un minuit fabriqué — elle est ignorée et comptée à part, plutôt
    // que d'écrire une fausse heure indistinguable d'un vrai match de
    // minuit.
    let unknownTime = 0;

    const resolvedRows = rows
      .map((r) => {
        const team = findTeamForDivision(r.division, existingTeams);
        if (!team) {
          unmatched.push(r.division);
          return null;
        }
        if (!r.startTime) {
          unknownTime += 1;
          return null;
        }
        const opponent = r.isHome ? r.equipe2 : r.equipe1;
        return {
          team_id: team.id,
          title: opponent ? `${r.isHome ? "vs" : "@"} ${opponent}` : "Match",
          event_type: "MATCH" as const,
          location: r.salle,
          start_time: r.startTime,
        };
      })
      .filter((r): r is NonNullable<typeof r> => Boolean(r));

    // Détection de doublons (audit du 31/08) : aucune contrainte d'unicité
    // en base ne couvre cet import — réimporter le même fichier (erreur
    // corrigée, export renvoyé par erreur...) créerait sinon deux fois le
    // même match. Comparaison par horodatage réel (getTime()), pas par
    // chaîne de caractères brute : Supabase peut renvoyer un format
    // légèrement différent de celui qu'on vient de calculer pour le même
    // instant.
    const keyFor = (teamId: string, iso: string) => `${teamId}|${new Date(iso).getTime()}`;
    const teamIds = Array.from(new Set(resolvedRows.map((r) => r.team_id)));
    const existingKeys = new Set<string>();
    if (teamIds.length > 0) {
      const { data: existingEvents, error: existingEventsError } = await supabase
        .from("events")
        .select("team_id, start_time")
        .in("team_id", teamIds);
      if (existingEventsError) {
        setLoading(false);
        setError(existingEventsError.message);
        return;
      }
      (existingEvents ?? []).forEach((ev) => {
        if (ev.team_id) existingKeys.add(keyFor(ev.team_id, ev.start_time));
      });
    }

    let duplicateCount = 0;
    const eventsRows = resolvedRows.filter((r) => {
      if (existingKeys.has(keyFor(r.team_id, r.start_time))) {
        duplicateCount += 1;
        return false;
      }
      return true;
    });

    if (eventsRows.length > 0) {
      // .select("id") + vérification du nombre de lignes (audit du 31/08) :
      // RLS peut bloquer une écriture sans erreur.
      const { error: insertError, data: insertedRows } = await supabase
        .from("events")
        .insert(eventsRows)
        .select("id");
      if (insertError) {
        setLoading(false);
        setError(insertError.message);
        return;
      }
      if ((insertedRows?.length ?? 0) < eventsRows.length) {
        setLoading(false);
        setError(
          "Import partiellement bloqué par les droits d'accès (RLS) — certains matchs n'ont pas été enregistrés. Réessaie."
        );
        return;
      }
    }

    setLoading(false);
    setResult(
      `${eventsRows.length} match(s) importé(s).` +
        (duplicateCount > 0
          ? ` ${duplicateCount} déjà présent(s) dans le calendrier, ignoré(s).`
          : "") +
        (unmatched.length > 0
          ? ` ${unmatched.length} ligne(s) ignorée(s) (division non reconnue: ${Array.from(
              new Set(unmatched)
            ).join(", ")}).`
          : "") +
        (unknownTime > 0
          ? ` ${unknownTime} ligne(s) ignorée(s) (heure introuvable dans le fichier) — à ajouter à la main si besoin.`
          : "")
    );
    setRows(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-zinc-900">
        Importer le planning (fichier officiel)
      </h3>
      <p className="text-sm text-zinc-500">
        Fichier Excel &quot;Planning complet&quot;
      </p>

      {/* Pas de champ "Mot-clé du club" visible : c'est toujours "UBAC"
          (voir clubKeyword plus haut), personne ne le change à la main —
          même minimalisme que l'import Coachs. */}
      <FilePickerButton id="import-planning-file" fileName={fileName} onChange={handleFile} />

      {rows && (
        <div className="rounded-xl bg-zinc-50 p-4">
          <p className="text-sm font-medium text-zinc-700">
            {rows.length} match(s) détecté(s) pour &quot;{clubKeyword}&quot;.
          </p>
          <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto text-xs text-zinc-500">
            {rows.slice(0, 10).map((r, i) => (
              <li key={i}>
                {r.division} · {r.equipe1} vs {r.equipe2} ·{" "}
                {r.startTime ? new Date(r.startTime).toLocaleString("fr-FR") : "date ?"}
              </li>
            ))}
            {rows.length > 10 && <li>... et {rows.length - 10} de plus</li>}
          </ul>
          <button
            onClick={handleImport}
            disabled={loading}
            className="mt-3 rounded-full bg-ubac-yellow px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
          >
            {loading ? "Import en cours..." : "Confirmer l'import"}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && <p className="text-sm text-green-600">{result}</p>}
    </div>
  );
}
