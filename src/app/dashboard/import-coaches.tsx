"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";

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

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);

    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

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

    const teamIdByNorm = new Map<string, string>();
    existingTeams.forEach((t) => {
      if (t.category) teamIdByNorm.set(normalizeLabel(t.category), t.id);
      if (t.name) teamIdByNorm.set(normalizeLabel(t.name), t.id);
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
        if (t.category) teamIdByNorm.set(normalizeLabel(t.category), t.id);
      });
    }

    const inviteRows = rows.flatMap((r) => {
      const teamId = teamIdByNorm.get(normalizeLabel(r.label));
      if (!teamId) return [];
      return r.coaches.map((c) => ({ team_id: teamId, email: c.email.toLowerCase() }));
    });

    if (inviteRows.length > 0) {
      const { error: inviteError } = await supabase
        .from("team_coach_invites")
        .upsert(inviteRows, { onConflict: "team_id,email" });

      if (inviteError) {
        setLoading(false);
        setError(inviteError.message);
        return;
      }
    }

    setLoading(false);
    setResult(
      `${uniqueMissing.length} équipe(s) créée(s), ${inviteRows.length} invitation(s) coach enregistrée(s). Chaque coach sera rattaché automatiquement dès son inscription avec l'email correspondant.`
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
        Fichier Excel &quot;Mails des coachs&quot;. Une équipe est créée par
        ligne (sauf si elle existe déjà sous un nom équivalent).
      </p>

      <input type="file" accept=".xlsx" onChange={handleFile} className="text-sm" />

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
            className="mt-3 rounded-full bg-ubac-blue px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ubac-blue-dark disabled:opacity-60"
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
