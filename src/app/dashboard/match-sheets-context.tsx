"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { FileText, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Retour de Cindy du 12/11 ("feuilles de match... visibles par le Bureau
// et les coachs seulement... et si on ne met que le lien du Drive ?") : le
// comptable dépose les feuilles dans un dossier Google Drive ; l'appli ne
// fait qu'afficher, sur chaque carte de MATCH OFFICIEL (jamais amical ni
// tournoi), une icône qui ouvre ce dossier.
//
// Visibilité : le lien n'est fourni (MatchSheetsProvider, page.tsx) qu'aux
// onglets Bureau et Coach -- absent du contexte partout ailleurs (Famille,
// Mon équipe, Enfant), donc jamais rendu ni même envoyé à leur page.
// Lien stocké dans club_settings.match_sheets_url (modifiable par le
// Bureau, Matchs officiels → FFBB, voir MatchSheetsLinkSetting).
const MatchSheetsContext = createContext<string | null>(null);

export function MatchSheetsProvider({ url, children }: { url: string | null; children: ReactNode }) {
  return <MatchSheetsContext.Provider value={url}>{children}</MatchSheetsContext.Provider>;
}

export function MatchSheetsLink({ eventType }: { eventType: string | null }) {
  const url = useContext(MatchSheetsContext);
  if (!url || eventType !== "MATCH") return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title="Feuilles de match (Google Drive)"
      className="inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-600 transition-colors hover:border-navy/40 hover:text-navy"
    >
      <FileText className="h-3 w-3 shrink-0" />
      Feuilles de match
    </a>
  );
}

// Réglage Bureau : le lien du dossier Drive (club_settings, règle
// "admin manage club_settings").
export function MatchSheetsLinkSetting() {
  const current = useContext(MatchSheetsContext);
  const [value, setValue] = useState(current ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = value.trim();
    if (trimmed && !/^https:\/\//.test(trimmed)) {
      setError("Le lien doit commencer par https://");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    const { error: updateError } = await createClient()
      .from("club_settings")
      .update({ match_sheets_url: trimmed || null })
      .eq("id", true);
    setSaving(false);
    if (updateError) {
      setError("Enregistrement impossible, réessaie.");
      return;
    }
    setMessage("Enregistré. Visible par le Bureau et les coachs d'ici une minute.");
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
        <FileText className="h-4 w-4 shrink-0 text-navy" />
        Feuilles de match
      </p>
      <p className="text-xs text-zinc-500">
        Lien du dossier Google Drive où sont déposées les feuilles de match. Une icône l&apos;ouvre sur chaque
        carte de match officiel, pour le Bureau et les coachs uniquement.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://drive.google.com/..."
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-ubac-blue focus:outline-none focus:ring-1 focus:ring-ubac-blue"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-ubac-yellow px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Enregistrer
        </button>
      </div>
      {message && <p className="text-xs text-status-success">{message}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
