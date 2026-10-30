"use client";

import { useState } from "react";
import { Check, Pencil, QrCode, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Retour du comptable de Cindy (30/10, via Cindy) : il lui faut le code
// e-Marque de chaque match officiel à domicile -- même patron que
// match-score.tsx (saisie en deux clics directement sur la carte), mais un
// texte libre plutôt qu'un score, et réservé au Bureau (canEdit vient de
// allowClubWide côté calendar-view.tsx, jamais Coach/Famille/Enfant).
export default function MatchEmarqueCode({
  eventId,
  code,
  canEdit,
  onSaved,
}: {
  eventId: string;
  code: string | null;
  canEdit: boolean;
  onSaved?: (code: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openEdit() {
    setValue(code ?? "");
    setError(null);
    setEditing(true);
  }

  async function save() {
    const trimmed = value.trim();
    setSaving(true);
    setError(null);
    const supabase = createClient();
    // .select().single() plutôt qu'un simple .update() : même garde-fou
    // qu'ailleurs (match-score.tsx) -- une policy RLS qui ne matche pas ne
    // remonte normalement aucune erreur, elle filtre juste la ligne.
    const { error: updateError } = await supabase
      .from("events")
      .update({ emarque_code: trimmed || null })
      .eq("id", eventId)
      .select("id")
      .single();
    setSaving(false);
    if (updateError) {
      setError("Enregistrement impossible, réessaie.");
      return;
    }
    setEditing(false);
    onSaved?.(trimmed || null);
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Code e-Marque"
          aria-label="Code e-Marque"
          className="h-7 w-32 rounded-md border border-zinc-200 px-2 text-sm font-semibold"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          title="Valider"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-white disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          title="Annuler"
          className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        {error && <p className="w-full text-[11px] text-red-600">{error}</p>}
      </div>
    );
  }

  if (!code) {
    if (!canEdit) return null;
    return (
      <button
        type="button"
        onClick={openEdit}
        className="flex w-fit items-center gap-1 rounded-full border border-dashed border-ubac-yellow-dark/50 px-2 py-0.5 text-[11px] font-medium text-ubac-yellow-dark transition-colors hover:border-ubac-yellow-dark hover:bg-ubac-yellow/10"
      >
        <QrCode className="h-3 w-3" />
        Ajouter le code e-Marque
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="flex items-center gap-1 rounded-full bg-ubac-yellow/15 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-ubac-yellow-dark">
        <QrCode className="h-3 w-3 shrink-0" />
        e-Marque {code}
      </span>
      {canEdit && (
        <button
          type="button"
          onClick={openEdit}
          title="Modifier le code e-Marque"
          className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
