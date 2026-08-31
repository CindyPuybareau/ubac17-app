"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import FilePickerButton from "./file-picker-button";

type Team = { id: string; name: string | null; category: string | null };

type CoachEntry = { name: string; email: string };

type ParsedRow = {
  label: string;
  coaches: CoachEntry[];
};

function normalizeLabel(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/^U0(\d)/, "U$1");
}

export default function ImportCoaches({
  existingTeams,
}: {
  existingTeams: Team[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
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

    // try/catch + garde sur la feuille (audit du 31/08, même correctif que
    // import-planning.tsx) : un fichier corrompu ou sans aucune feuille
    // faisait planter la lecture sans jamais passer par un message propre.
    let wb: XLSX.WorkBook;
    try {
      const buffer = await file.arrayBuffer();
      wb = XLSX.read(buffer, { type: "array" });
    } catch {
      setError("Fichier illisible — vérifie que c'est bien un classeur Excel valide.");
      return;
    }
    const sheetName = wb.SheetNames[0];
    const ws = sheetName ? wb.Sheets[sheetName] : undefined;
    if (!ws) {
      setError("Aucune feuille trouvée dans ce fichier.");
      return;
    }

    const raw = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
    }) as unknown[][];

    const parsed: ParsedRow[] = [];
    for (const r of raw) {
      const label = r[0];
      if (!label || String(label).trim() === "" || String(label).trim().toUpperCase() === "MAILS COACHS") {
        continue;
      }

      const coaches: CoachEntry[] = [];
      const name1 = r[1] ? String(r[1]).trim() : "";
      const email1 = r[2] ? String(r[2]).trim() : "";
      if (name1 && email1) coaches.push({ name: name1, email: email1 });

      const name2 = r[4] ? String(r[4]).trim() : "";
      const email2 = r[5] ? String(r[5]).trim() : "";
      if (name2 && email2) coaches.push({ name: name2, email: email2 });

      if (coaches.length > 0) {
        parsed.push({ label: String(label).trim(), coaches });
      }
    }

    setRows(parsed);
  }

  async function handleImport() {
    if (!rows) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();

    // Détection de collision (audit du 31/08) : sans elle, deux équipes
    // différentes qui produisent le même libellé normalisé (l'une via sa
    // catégorie, l'autre via son nom — ex. un doublon/une erreur de saisie
    // historique) s'écrasaient silencieusement dans cette map ; les coachs
    // du libellé en collision pouvaient alors être rattachés à la mauvaise
    // équipe selon l'ordre de retour de la requête, sans la moindre erreur.
    const teamIdByNorm = new Map<string, string>();
    const collidedLabels = new Set<string>();
    function registerTeamLabel(label: string, teamId: string) {
      const norm = normalizeLabel(label);
      const existing = teamIdByNorm.get(norm);
      if (existing && existing !== teamId) {
        collidedLabels.add(norm);
        return;
      }
      teamIdByNorm.set(norm, teamId);
    }
    existingTeams.forEach((t) => {
      if (t.category) registerTeamLabel(t.category, t.id);
      if (t.name) registerTeamLabel(t.name, t.id);
    });

    const missingLabels = rows
      .map((r) => r.label)
      .filter((label) => !teamIdByNorm.has(normalizeLabel(label)));
    const uniqueMissing = Array.from(new Set(missingLabels));

    if (uniqueMissing.length > 0) {
      const { data: newTeams, error: teamsError } = await supabase
        .from("teams")
        .insert(uniqueMissing.map((label) => ({ name: label, category: label })))
        .select("id, name, category");

      if (teamsError) {
        setLoading(false);
        setError(teamsError.message);
        return;
      }
      (newTeams ?? []).forEach((t) => {
        if (t.category) registerTeamLabel(t.category, t.id);
      });
    }

    const inviteRows = rows.flatMap((r) => {
      const teamId = teamIdByNorm.get(normalizeLabel(r.label));
      if (!teamId) return [];
      return r.coaches.map((c) => ({ team_id: teamId, email: c.email.toLowerCase() }));
    });

    if (inviteRows.length > 0) {
      // .select() + vérification du nombre de lignes (audit du 31/08) : RLS
      // peut bloquer une écriture sans erreur.
      const { error: inviteError, data: upsertedRows } = await supabase
        .from("team_coach_invites")
        .upsert(inviteRows, { onConflict: "team_id,email" })
        .select("team_id, email");

      if (inviteError) {
        setLoading(false);
        setError(inviteError.message);
        return;
      }
      if ((upsertedRows?.length ?? 0) < inviteRows.length) {
        setLoading(false);
        setError(
          "Enregistrement partiellement bloqué par les droits d'accès (RLS) — certaines invitations n'ont pas été enregistrées. Réessaie."
        );
        return;
      }
    }

    setLoading(false);
    const collisionNote =
      collidedLabels.size > 0
        ? ` Attention : ${collidedLabels.size} libellé(s) correspondent à plusieurs équipes à la fois (${Array.from(collidedLabels).join(", ")}) — vérifie qu'il n'y a pas de doublon d'équipe, les coachs concernés ont été rattachés à une seule d'entre elles au hasard.`
        : "";
    setResult(
      `${uniqueMissing.length} équipe(s) créée(s), ${inviteRows.length} invitation(s) coach enregistrée(s). Chaque coach sera rattaché automatiquement dès son inscription avec l'email correspondant.${collisionNote}`
    );
    setRows(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-zinc-900">
        Importer les emails des coachs (fichier officiel)
      </h3>
      <p className="text-sm text-zinc-500">
        Fichier Excel &quot;Mails des coachs&quot;
      </p>

      <FilePickerButton id="import-coaches-file" fileName={fileName} onChange={handleFile} />

      {rows && (
        <div className="rounded-xl bg-zinc-50 p-4">
          <p className="text-sm font-medium text-zinc-700">
            {rows.length} équipe(s) détectée(s) :
          </p>
          <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto text-xs text-zinc-500">
            {rows.map((r, i) => (
              <li key={i}>
                <strong>{r.label}</strong> ·{" "}
                {r.coaches.map((c) => `${c.name} (${c.email})`).join(", ")}
              </li>
            ))}
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
