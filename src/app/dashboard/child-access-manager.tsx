"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, KeyRound, Link2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatFirstName } from "@/lib/names";
import { isValidPinFormat } from "@/lib/pin";

type Child = { id: string; name: string; hasPin: boolean };

// Gestion de l'accès enfant (lien privé par famille + PIN par enfant) —
// entièrement autonome : ne dépend d'aucune donnée déjà chargée par
// page.tsx, tout est relu ici via les fonctions SQL dédiées
// (regenerate_family_access_code / set_child_pin, voir la migration
// 20261008000000_child_pin_access.sql), jamais par écriture directe sur
// profiles/players.
export default function ChildAccessManager() {
  const [code, setCode] = useState<string | null>(null);
  const [children, setChildren] = useState<Child[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingChildId, setEditingChildId] = useState<string | null>(null);
  const [pinDraft, setPinDraft] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [savingPin, setSavingPin] = useState(false);
  // Replié par défaut à chaque ouverture de page, sans mémorisation par
  // appareil (voir calendar-subscribe.tsx pour l'explication complète du
  // même choix) : une préférence "resté ouvert" stockée en localStorage
  // laissait ce bloc bloqué ouvert indéfiniment dès qu'on l'avait déplié
  // une fois.
  const [collapsed, setCollapsed] = useState(true);

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // Passe par my_family_access_code() plutôt qu'une lecture directe de
    // profiles.family_access_code (retour d'audit du 28/08) : la colonne
    // n'est plus lisible par personne, même son propre titulaire, en
    // dehors de cette fonction (voir la migration
    // 20261028010000_lock_down_profile_secrets.sql).
    const [codeRes, linksRes] = await Promise.all([
      supabase.rpc("my_family_access_code"),
      supabase
        .from("parent_player")
        .select("players(id, first_name, profile_id, pin_set_at)")
        .eq("parent_id", user.id),
    ]);

    setCode((codeRes.data as string | null) ?? null);

    const kids = (linksRes.data ?? [])
      .map((l) => l.players as unknown as { id: string; first_name: string | null; profile_id: string | null; pin_set_at: string | null } | null)
      .filter(
        (p): p is { id: string; first_name: string | null; profile_id: string | null; pin_set_at: string | null } =>
          Boolean(p) && p!.profile_id !== user.id
      )
      .map((p) => ({
        id: p.id,
        name: formatFirstName(p.first_name),
        hasPin: Boolean(p.pin_set_at),
      }));
    setChildren(kids);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generateLink() {
    setGenerating(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("regenerate_family_access_code");
    setGenerating(false);
    if (!error && data) setCode(data as string);
  }

  function copyLink(link: string) {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function savePin(childId: string) {
    if (!isValidPinFormat(pinDraft)) {
      setPinError("4 chiffres exactement.");
      return;
    }
    setSavingPin(true);
    setPinError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_child_pin", {
      p_player_id: childId,
      p_pin: pinDraft,
    });
    setSavingPin(false);
    if (error) {
      setPinError(error.message);
      return;
    }
    setChildren((prev) => prev?.map((c) => (c.id === childId ? { ...c, hasPin: true } : c)) ?? null);
    setEditingChildId(null);
    setPinDraft("");
  }

  if (loading) return null;
  if (!children || children.length === 0) return null;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-100 bg-white px-4 py-2.5 text-left shadow-sm transition-colors hover:bg-zinc-50"
      >
        <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-600">
          <KeyRound className="h-4 w-4 shrink-0 text-navy" />
          Accès enfant (sans email)
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
      </button>
    );
  }

  const link = code && typeof window !== "undefined" ? `${window.location.origin}/enfant/${code}` : null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <KeyRound className="h-3.5 w-3.5 text-navy" />
          Accès enfant (sans email)
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
      <p className="text-xs text-zinc-500">
        Un lien privé pour votre foyer, à garder sur l&apos;appareil familial —
        chaque enfant s&apos;y connecte ensuite seul avec son code à 4 chiffres,
        en lecture seule (ses matchs et entraînements uniquement).
      </p>

      {link ? (
        <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5">
          <Link2 className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          <span className="flex-1 truncate text-xs text-zinc-600">{link}</span>
          <button
            onClick={() => copyLink(link)}
            className="shrink-0 rounded-full bg-navy px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-navy/90"
          >
            {copied ? "Copié !" : "Copier"}
          </button>
        </div>
      ) : (
        <button
          onClick={generateLink}
          disabled={generating}
          className="w-fit rounded-full bg-ubac-yellow px-3.5 py-1.5 text-xs font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
        >
          {generating ? "Création..." : "Créer le lien d'accès enfant"}
        </button>
      )}

      <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
        {children.map((c) => (
          <div key={c.id} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-zinc-800">{c.name}</span>
              {editingChildId !== c.id && (
                <button
                  onClick={() => {
                    setEditingChildId(c.id);
                    setPinDraft("");
                    setPinError(null);
                  }}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    c.hasPin
                      ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  {c.hasPin ? "Code configuré · modifier" : "Configurer un code"}
                </button>
              )}
            </div>

            {editingChildId === c.id && (
              <div className="flex items-center gap-2 rounded-lg bg-zinc-50 p-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  autoFocus
                  value={pinDraft}
                  onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="4 chiffres"
                  className="w-24 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-center text-sm tracking-widest"
                />
                <button
                  onClick={() => savePin(c.id)}
                  disabled={savingPin}
                  className="flex items-center gap-1 rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy/90 disabled:opacity-60"
                >
                  {savingPin && <Loader2 className="h-3 w-3 animate-spin" />}
                  Valider
                </button>
                <button
                  onClick={() => {
                    setEditingChildId(null);
                    setPinError(null);
                  }}
                  className="text-xs text-zinc-500 hover:underline"
                >
                  Annuler
                </button>
              </div>
            )}
            {editingChildId === c.id && pinError && (
              <p className="text-xs text-red-600">{pinError}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
