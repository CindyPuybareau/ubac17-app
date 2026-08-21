"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type AutomationKey =
  | "match_reminder_enabled"
  | "expiry_alert_enabled"
  | "cotisation_relance_enabled";

const AUTOMATIONS: { key: AutomationKey; title: string; description: string }[] = [
  {
    key: "match_reminder_enabled",
    title: "Rappels de match (la veille)",
    description: "Notification envoyée aux joueurs/parents/coachs la veille de chaque match.",
  },
  {
    key: "expiry_alert_enabled",
    title: "Alertes licence & certificat médical",
    description: "Email envoyé aux membres dont un document arrive à échéance (30 jours).",
  },
  {
    key: "cotisation_relance_enabled",
    title: "Relances de cotisation impayée",
    description: "Email de rappel envoyé tous les 14 jours pour chaque cotisation encore due.",
  },
];

// Panneau de contrôle unique pour tous les envois automatiques du club :
// aucun n'est actif tant que le Bureau ne l'a pas explicitement allumé ici
// (club_settings, une ligne singleton, tout à false par défaut). Placé sur
// l'Accueil pour être le premier réglage que le Bureau croise, plutôt que
// dispersé dans chaque onglet concerné.
export default function AutomationSettings({
  settings,
}: {
  settings: Record<AutomationKey, boolean>;
}) {
  const router = useRouter();
  const [state, setState] = useState(settings);
  const [savingKey, setSavingKey] = useState<AutomationKey | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  // Repliable (retour de Cindy du 2026-08-21, même demande et même flèche
  // visible que OrganisationCard) : une fois réglé, ce bloc n'a plus besoin
  // d'être vu à chaque ouverture d'Accueil — surtout maintenant qu'Accueil
  // porte aussi le calendrier juste en dessous. Ouvert par défaut : ne
  // change rien pour qui ne touche jamais au chevron.
  const [open, setOpen] = useState(true);

  async function toggle(key: AutomationKey) {
    const next = !state[key];
    setSavingKey(key);
    setToggleError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("club_settings")
      .update({ [key]: next, updated_at: new Date().toISOString() })
      .eq("id", true);
    setSavingKey(null);
    if (error) {
      setToggleError(error.message);
      return;
    }
    setState((prev) => ({ ...prev, [key]: next }));
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-sm font-semibold text-zinc-900 transition-colors hover:text-navy"
      >
        Envois automatiques
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy/10 text-navy">
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && (
      <div className="mt-3 flex flex-col gap-2.5">
        {AUTOMATIONS.map((a) => {
          const enabled = state[a.key];
          return (
            <div
              key={a.key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-2.5"
            >
              <div className="flex items-start gap-2.5">
                {enabled ? (
                  <Bell className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                )}
                <div>
                  <p className="text-sm font-medium text-zinc-800">{a.title}</p>
                  <p className="max-w-md text-xs text-zinc-500">{a.description}</p>
                </div>
              </div>
              <button
                onClick={() => toggle(a.key)}
                disabled={savingKey === a.key}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                  enabled
                    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                    : "bg-zinc-200 text-zinc-600 hover:bg-zinc-300"
                }`}
              >
                {savingKey === a.key ? "..." : enabled ? "Activé" : "Désactivé"}
              </button>
            </div>
          );
        })}
      </div>
      )}
      {toggleError && <p className="mt-2 text-xs text-red-600">{toggleError}</p>}
    </div>
  );
}
