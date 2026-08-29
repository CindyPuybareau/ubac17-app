"use client";

import { useEffect, useState } from "react";
import { Check, Lightbulb, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPersonName } from "@/lib/names";

type LinkedParent = { id: string; firstName: string | null; lastName: string | null; email: string | null };
type ProfileMatch = { id: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null };

// Retour de Cindy du 29/08 (cas de Basile LAMOURET, dont les deux enfants
// ont l'email d'un tiers comme contact) : le seul mécanisme existant
// (handle_new_user, trigger d'inscription) relie un parent à un enfant
// UNIQUEMENT par correspondance d'email — rien s'il ne correspond à
// personne, même si le bon compte existe déjà avec le bon téléphone.
// Comparaison volontairement simple (9 derniers chiffres significatifs,
// +33/0 de tête ignorés) : suffisant pour rapprocher "0611223344" et
// "+33611223344", pas la peine d'une lib de parsing téléphonique pour un
// signal qui reste de toute façon une SUGGESTION, jamais appliqué seul.
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  const trimmed = digits.replace(/^\+?33/, "").replace(/^0/, "");
  return trimmed.length >= 6 ? trimmed : null;
}

// Section "Compte(s) parent relié(s)" de la fiche Membre (onglet "Parents
// & Urgence") : le rattachement automatique par email reste la règle
// (handle_new_user), ce composant couvre le cas où il ne suffit pas —
// jamais un rattachement automatique en plus (deux incidents sérieux déjà
// vécus sur ce projet avec des heuristiques "intelligentes" appliquées
// sans confirmation) : la suggestion par téléphone/email secondaire reste
// un simple bouton à cliquer, la recherche par nom/email reste manuelle.
export default function ParentLinkManager({
  playerId,
  candidatePhones,
  candidateSecondaryEmail,
}: {
  playerId: string;
  // Téléphones déjà saisis sur CETTE fiche (mère/père/autres) — comparés
  // au téléphone du compte pour suggérer un rattachement.
  candidatePhones: (string | null)[];
  candidateSecondaryEmail: string | null;
}) {
  const [linked, setLinked] = useState<LinkedParent[] | null>(null);
  const [suggestion, setSuggestion] = useState<ProfileMatch | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadLinked() {
    const supabase = createClient();
    const { data } = await supabase
      .from("parent_player")
      .select("parent_id, profiles(id, first_name, last_name, email)")
      .eq("player_id", playerId);
    setLinked(
      (data ?? [])
        .map((r) => {
          const p = r.profiles as unknown as {
            id: string;
            first_name: string | null;
            last_name: string | null;
            email: string | null;
          } | null;
          return p
            ? { id: p.id, firstName: p.first_name, lastName: p.last_name, email: p.email }
            : null;
        })
        .filter((p): p is LinkedParent => Boolean(p))
    );
  }

  useEffect(() => {
    (async () => {
      await loadLinked();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  // Suggestion par téléphone/email secondaire, cherchée seulement une fois
  // les liens déjà en place connus (pour ne jamais suggérer quelqu'un déjà
  // relié). Un compte sans aucun téléphone renseigné ne peut pas matcher —
  // rien à comparer, pas une absence de résultat à signaler comme un échec.
  useEffect(() => {
    if (linked === null) return;
    let cancelled = false;
    (async () => {
      const normalizedTargets = new Set(
        candidatePhones.map(normalizePhone).filter((p): p is string => Boolean(p))
      );
      if (normalizedTargets.size === 0 && !candidateSecondaryEmail) {
        if (!cancelled) setSuggestion(null);
        return;
      }
      // Pas de filtre sur le téléphone ici : un match peut se faire par
      // email secondaire seul (cas de Basile, dont le compte n'a peut-être
      // pas de téléphone renseigné) — le filtrer en amont excluait à tort
      // ces comptes-là de la comparaison ci-dessous.
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone");
      if (cancelled) return;
      const linkedIds = new Set(linked.map((p) => p.id));
      const match = (data ?? []).find((p) => {
        if (linkedIds.has(p.id)) return false;
        const normalizedPhone = normalizePhone(p.phone);
        if (normalizedPhone && normalizedTargets.has(normalizedPhone)) return true;
        return Boolean(
          candidateSecondaryEmail &&
            p.email &&
            p.email.trim().toLowerCase() === candidateSecondaryEmail.trim().toLowerCase()
        );
      });
      setSuggestion(
        match
          ? {
              id: match.id,
              firstName: match.first_name,
              lastName: match.last_name,
              email: match.email,
              phone: match.phone,
            }
          : null
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [linked, candidatePhones, candidateSecondaryEmail]);

  useEffect(() => {
    const timeout = setTimeout(async () => {
      const trimmed = query.trim();
      if (trimmed.length < 2) {
        setResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone")
        .or(`first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%,email.ilike.%${trimmed}%`)
        .limit(8);
      setSearching(false);
      setResults(
        (data ?? []).map((p) => ({
          id: p.id,
          firstName: p.first_name,
          lastName: p.last_name,
          email: p.email,
          phone: p.phone,
        }))
      );
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  async function linkParent(parentId: string) {
    setBusyId(parentId);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase
      .from("parent_player")
      .insert({ parent_id: parentId, player_id: playerId });
    setBusyId(null);
    if (insertError) {
      setError(
        insertError.code === "23505"
          ? "Ce compte est déjà relié."
          : "Rattachement impossible, réessaie."
      );
      return;
    }
    setQuery("");
    setResults([]);
    await loadLinked();
  }

  async function unlinkParent(parentId: string) {
    setBusyId(parentId);
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("parent_player")
      .delete()
      .eq("parent_id", parentId)
      .eq("player_id", playerId);
    setBusyId(null);
    if (deleteError) {
      setError("Retrait impossible, réessaie.");
      return;
    }
    await loadLinked();
  }

  const linkedIds = new Set((linked ?? []).map((p) => p.id));

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-100 bg-zinc-50 p-3 sm:col-span-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Compte(s) parent relié(s)
      </p>

      {linked === null ? (
        <p className="text-sm text-zinc-400">Chargement...</p>
      ) : linked.length === 0 ? (
        <p className="text-sm text-zinc-500">Aucun compte relié pour l&apos;instant.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {linked.map((p) => (
            <span
              key={p.id}
              className="flex items-center gap-1.5 rounded-full border border-navy/20 bg-white px-2.5 py-1 text-xs font-medium text-navy"
            >
              {formatPersonName(p.firstName, p.lastName)}
              {p.email && <span className="font-normal text-zinc-400">· {p.email}</span>}
              <button
                type="button"
                onClick={() => unlinkParent(p.id)}
                disabled={busyId === p.id}
                className="text-zinc-400 transition-colors hover:text-red-600 disabled:opacity-50"
                title="Retirer ce lien"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {suggestion && !linkedIds.has(suggestion.id) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-ubac-yellow/40 bg-ubac-yellow/10 px-2.5 py-2 text-xs">
          <Lightbulb className="h-3.5 w-3.5 shrink-0 text-ubac-yellow-dark" />
          <span className="text-zinc-700">
            Téléphone ou email correspondant au compte de{" "}
            <b>{formatPersonName(suggestion.firstName, suggestion.lastName)}</b>
            {suggestion.email ? ` (${suggestion.email})` : ""} — relier ?
          </span>
          <button
            type="button"
            onClick={() => linkParent(suggestion.id)}
            disabled={busyId === suggestion.id}
            className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-navy px-2.5 py-1 font-semibold text-white transition-colors hover:bg-navy-dark disabled:opacity-50"
          >
            <Check className="h-3 w-3 shrink-0" /> Relier
          </button>
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher un compte par nom ou email..."
          className="w-full rounded-lg border border-zinc-200 py-1.5 pl-8 pr-2.5 text-sm"
        />
      </div>
      {searching && <p className="text-xs text-zinc-400">Recherche...</p>}
      {results.length > 0 && (
        <div className="flex flex-col gap-1">
          {results
            .filter((r) => !linkedIds.has(r.id))
            .map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => linkParent(r.id)}
                disabled={busyId === r.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-zinc-50 disabled:opacity-50"
              >
                <span>
                  {formatPersonName(r.firstName, r.lastName)}{" "}
                  <span className="text-xs text-zinc-400">{r.email}</span>
                </span>
                <Check className="h-3.5 w-3.5 shrink-0 text-navy" />
              </button>
            ))}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
