"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Check, ChevronDown, ChevronUp, Copy, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Replié par défaut à CHAQUE ouverture de page, sans exception : la
// quasi-totalité des familles ne s'en sert qu'une fois (récupérer le
// lien), pas à chaque visite du tableau de bord — le garder ouvert en
// permanence ne faisait qu'allonger la page pour rien. Toujours accessible
// en un clic sur la flèche pour qui veut y revenir. Une précédente version
// mémorisait "resté ouvert" par appareil (localStorage) — retiré : ça
// laissait le bloc bloqué ouvert indéfiniment dès qu'on l'avait dépliĕ une
// fois, ce qui ressemblait à un bug plutôt qu'à un choix.
//
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
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          if (!cancelled) setToken(null);
          return;
        }
        // Passe par my_calendar_token() plutôt qu'une lecture directe de
        // profiles.calendar_token (retour d'audit du 28/08) : la colonne
        // n'est plus lisible par personne, même son propre titulaire, en
        // dehors de cette fonction (voir la migration
        // 20261028010000_lock_down_profile_secrets.sql).
        const { data } = await supabase.rpc("my_calendar_token");
        if (!cancelled) setToken((data as string | null) ?? null);
      } catch {
        // Un raté réseau ne doit jamais laisser le bloc bloqué en
        // "chargement" pour toujours : mieux vaut proposer de générer le
        // lien, quitte à réessayer, que de rester invisible sans un mot.
        if (!cancelled) setToken(null);
      }
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

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-100 bg-white px-4 py-2.5 text-left shadow-sm transition-colors hover:bg-zinc-50"
      >
        <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-600">
          <CalendarPlus className="h-4 w-4 shrink-0 text-ubac-blue" />
          Calendrier UBAC dans ton agenda
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
      </button>
    );
  }

  const url = token ? `${window.location.origin}/api/calendar/${token}` : null;
  // iPhone/iPad reconnaissent ce protocole et proposent directement l'écran
  // d'abonnement — un seul tap, sans passer par les Réglages. Android n'a
  // pas d'équivalent fiable : Google n'accepte ce type de lien que depuis
  // le site complet de Google Agenda, jamais depuis l'appli mobile.
  const webcalUrl = url ? url.replace(/^https?:/, "webcal:") : null;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
          <CalendarPlus className="h-4 w-4 shrink-0 text-ubac-blue" />
          Calendrier UBAC dans ton agenda
        </p>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Réduire"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>

      {url && webcalUrl ? (
        <div className="mt-1 flex flex-col gap-3">
          <a
            href={webcalUrl}
            className="flex w-fit items-center gap-1.5 rounded-full bg-navy px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-navy-dark"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            Ajouter à mon calendrier (iPhone/iPad)
          </a>

          <div className="flex flex-col gap-1.5 rounded-xl bg-zinc-50 p-3">
            <p className="text-[11px] font-medium text-zinc-600">
              Sur Android : Google Agenda → Autres agendas → + → À partir de l&apos;URL, puis
              colle le lien ci-dessous.
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                className="w-full min-w-0 flex-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600"
              />
              <button
                type="button"
                onClick={() => copy(url)}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copié" : "Copier"}
              </button>
            </div>
          </div>

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
