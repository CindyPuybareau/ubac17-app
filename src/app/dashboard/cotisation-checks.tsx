"use client";

// Liste "À vérifier" de la page Cotisations (retour de Cindy du 18/11,
// point 5 "nettoyer les données") : les cotisations qui sortent de
// l'ordinaire, signalées au Bureau -- JAMAIS corrigées automatiquement
// (règle n°1). Deux gestes par ligne : "Ouvrir" (la fiche Cotisation &
// Paiements, pour corriger à la main) ou "C'est normal" (retient la date
// dans cotisations.verifiee_le, la ligne ne revient plus ici).
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronUp, ClipboardCheck, FileSearch } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { categoryTheme } from "./team-card";
import { cotisationFirstName, cotisationLastName, formatAmount } from "./cotisation-shared";
import type { AdminCotisation } from "./page";

const CENT = 0.009;

// Les raisons, en clair, pour UNE cotisation (vide = rien à signaler).
// Un trop-perçu n'en fait pas partie : c'est un don HelloAsso, déjà affiché
// "dont X € de don" (cotisation-participants-table.tsx).
export function cotisationCheckReasons(c: AdminCotisation): string[] {
  const reasons: string[] = [];
  const prix = c.prix ?? 0;
  const remise = c.remise ?? 0;
  const paid = c.paiement ?? 0;
  if (c.statut === "OFFERT" && paid > CENT) {
    reasons.push(`Offerte, mais ${formatAmount(paid)} réglés${c.mode_paiement ? ` (${c.mode_paiement.trim()})` : ""}`);
  }
  // Sur une cotisation offerte, la remise porte la valeur de la licence
  // offerte (prix 0, remise 87,25 € : 25 lignes du fichier du club) -- c'est
  // la façon normale de noter une offre, jamais signalée. Ailleurs, une
  // remise plus grande que le tarif ramène le dû à 0 et fait passer la
  // ligne en "Payé" sans aucun versement.
  if (c.statut !== "OFFERT" && remise > prix + CENT) {
    reasons.push(`Remise de ${formatAmount(remise)}, plus grande que le tarif (${formatAmount(prix)})`);
  }
  return reasons;
}

export default function CotisationChecks({
  cotisations,
  onOpen,
}: {
  cotisations: AdminCotisation[];
  onOpen: (id: string) => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  // Masquées tout de suite après "C'est normal", sans attendre le
  // rafraîchissement de la page.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(
    () =>
      cotisations
        .filter((c) => !c.verifieeLe && !hiddenIds.has(c.id))
        .map((c) => ({ c, reasons: cotisationCheckReasons(c) }))
        .filter((item) => item.reasons.length > 0)
        .sort((a, b) => cotisationLastName(a.c).localeCompare(cotisationLastName(b.c), "fr")),
    [cotisations, hiddenIds]
  );

  if (items.length === 0) return null;

  async function markNormal(id: string) {
    setSavingId(id);
    setError(null);
    const supabase = createClient();
    // .select("id") : RLS peut bloquer sans erreur (0 ligne) -- même
    // vérification que les autres écritures de cotisations.
    const { data, error: updateError } = await supabase
      .from("cotisations")
      .update({ verifiee_le: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    setSavingId(null);
    if (updateError || !data || data.length === 0) {
      setError("Impossible d'enregistrer. Réessayez dans un instant.");
      return;
    }
    setHiddenIds((prev) => new Set(prev).add(id));
    router.refresh();
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <FileSearch className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-zinc-900">
            À vérifier · {items.length} cotisation{items.length > 1 ? "s" : ""}
          </span>
          <span className="block text-xs text-zinc-600">
            Des montants qui sortent de l&apos;ordinaire
          </span>
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-zinc-500" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
        )}
      </button>

      {expanded && (
        <div className="flex flex-col gap-2 border-t border-amber-200 px-3 pb-3 pt-3">
          <p className="px-1 text-xs text-zinc-600">
            Rien n&apos;est corrigé automatiquement. « Ouvrir » pour corriger la fiche, ou « C&apos;est
            normal » pour la retirer de cette liste.
          </p>
          {error && <p className="px-1 text-xs font-semibold text-red-600">{error}</p>}
          {items.map(({ c, reasons }) => (
            <div key={c.id} className="rounded-xl border border-zinc-100 bg-white px-3 py-2.5 shadow-sm">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="break-words font-semibold leading-snug text-zinc-900">
                  {cotisationLastName(c)} {cotisationFirstName(c)}
                </p>
                {c.category && (
                  <span
                    className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none ${categoryTheme(c.category).badge}`}
                  >
                    {c.category}
                  </span>
                )}
              </div>
              <ul className="mt-1 flex flex-col gap-0.5">
                {reasons.map((r) => (
                  <li key={r} className="text-xs text-zinc-600">
                    {r}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onOpen(c.id)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-navy/20 bg-navy/5 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-navy/10"
                >
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  Ouvrir
                </button>
                <button
                  type="button"
                  disabled={savingId === c.id}
                  onClick={() => markNormal(c.id)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-court-green/30 bg-court-green/10 px-3 py-1.5 text-xs font-semibold text-court-green hover:bg-court-green/15 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  {savingId === c.id ? "Enregistrement…" : "C'est normal"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
