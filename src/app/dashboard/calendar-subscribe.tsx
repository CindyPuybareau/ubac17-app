"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Check, Copy, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Abonnement à sens unique : une fois le lien collé dans Google/Apple
// Calendar, les matchs et entraînements de l'équipe de l'enfant
// apparaissent tout seuls dans l'agenda que le parent regarde déjà — mis à
// jour automatiquement si un horaire change, sans jamais rouvrir l'appli.
export default function CalendarSubscribe() {
  // undefined = pas encore chargé, null = pas encore de lien généré.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data } = await supabase
        .from("profiles")
        .select("calendar_token")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (!cancelled) setToken((data?.calendar_token as string | null) ?? null);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function generate() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("regenerate_calendar_token");
    setBusy(false);
    if (rpcError || !data) {
      setError("Génération impossible, réessaie.");
      return;
    }
    setToken(data as string);
    setCopied(false);
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copie impossible sur cet appareil — sélectionne le lien manuellement.");
    }
  }

  if (token === undefined) return null;

  const url = token ? `${window.location.origin}/api/calendar/${token}` : null;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
        <CalendarPlus className="h-4 w-4 shrink-0 text-ubac-blue" />
        Recevoir le calendrier dans ton agenda
      </p>
      <p className="text-xs text-zinc-500">
        Les matchs et entraînements de tes enfants apparaissent directement dans Google
        Agenda ou Calendrier (iPhone), mis à jour automatiquement.
      </p>

      {url ? (
        <div className="mt-1 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.target.select()}
              className="w-full min-w-0 flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600"
            />
            <button
              type="button"
              onClick={() => copy(url)}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-dark"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copié" : "Copier"}
            </button>
          </div>
          <p className="text-[11px] text-zinc-400">
            Google Agenda : « Ajouter un agenda » → « À partir de l&apos;URL ». iPhone/iPad :
            Réglages → Calendrier → Comptes → Ajouter un compte → Autre → Calendrier avec
            abonnement.
          </p>
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="flex w-fit items-center gap-1.5 text-[11px] font-medium text-zinc-400 hover:text-zinc-600 disabled:opacity-60"
          >
            <RefreshCw className="h-3 w-3" />
            {busy ? "Génération..." : "Générer un nouveau lien (l'ancien cessera de fonctionner)"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="mt-1 flex w-fit items-center gap-1.5 rounded-full bg-navy px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-navy-dark disabled:opacity-60"
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          {busy ? "Génération..." : "Obtenir mon lien d'abonnement"}
        </button>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
