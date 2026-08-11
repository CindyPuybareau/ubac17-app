"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Plus, Settings, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import RoleIcon, { ROLE_ICONS, ROLE_ICON_NAMES } from "./role-icon";
import { styleFor } from "./calendar-view";
import type { EventRoleType } from "./event-tasks";

// Les types d'événement proposés à la restriction. Une table de marque
// n'a de sens que sur un match ; laisser la case vide = tous les types.
const EVENT_TYPES = ["MATCH", "TRAINING", "TOURNAMENT", "OTHER"] as const;

// Un code stable est dérivé du libellé : c'est lui qui est stocké dans
// event_tasks, il ne doit contenir ni accent ni espace.
function toCode(label: string) {
  return label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export default function EventRolesEditor({ roles }: { roles: EventRoleType[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState<string>("ClipboardList");
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<EventRoleType | null>(null);

  async function addRole() {
    const trimmed = label.trim();
    if (!trimmed) return;
    const code = toCode(trimmed);
    if (!code) {
      setError("Ce libellé ne permet pas de générer un identifiant.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const payload = {
      code,
      label: trimmed,
      icon,
      event_types: eventTypes,
      sort_order: (roles[roles.length - 1]?.sortOrder ?? 0) + 10,
    };
    const { error: insertError } = await supabase.from("event_role_types").insert(payload);

    if (insertError) {
      // Un rôle archivé conserve son identifiant : il est invisible dans la
      // liste mais bloque toute recréation du même nom. Le réactiver est ce
      // que l'utilisateur veut réellement — refuser serait une impasse dont
      // rien à l'écran n'expliquerait la cause.
      if (insertError.code === "23505") {
        const { error: reviveError } = await supabase
          .from("event_role_types")
          .update({ ...payload, archived_at: null })
          .eq("code", code);
        setSaving(false);
        if (reviveError) {
          setError(reviveError.message);
          return;
        }
      } else {
        setSaving(false);
        setError(insertError.message);
        return;
      }
    } else {
      setSaving(false);
    }
    setLabel("");
    setEventTypes([]);
    setIcon("ClipboardList");
    router.refresh();
  }

  // Archivage et non suppression : les attributions passées référencent ce
  // code (clé étrangère), les effacer réécrirait l'historique du bilan.
  async function archiveRole() {
    if (!removeTarget) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("event_role_types")
      .update({ archived_at: new Date().toISOString() })
      .eq("code", removeTarget.code);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setRemoveTarget(null);
    router.refresh();
  }

  function toggleEventType(t: string) {
    setEventTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 bg-ubac-yellow/15 px-4 py-3 text-left transition-colors hover:bg-ubac-yellow/25"
      >
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ubac-yellow text-navy">
            <Settings className="h-4 w-4" />
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-bold text-navy">Rôles d&apos;organisation</span>
            <span className="text-xs font-medium text-zinc-500">
              {roles.length} rôle{roles.length > 1 ? "s" : ""} · commun à tout le club
            </span>
          </span>
        </span>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-navy/15 bg-white text-navy">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-zinc-100 px-4 py-3">
          <p className="text-xs text-zinc-500">
            Ces rôles apparaissent sur chaque événement, côté coach comme côté parent.
            Un rôle restreint à certains types n&apos;est proposé que sur ceux-là.
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <ul className="flex flex-col gap-1.5">
            {roles.map((role) => (
              <li
                key={role.code}
                className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <RoleIcon icon={role.icon} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-zinc-800">
                      {role.label}
                    </span>
                    <span className="block text-xs text-zinc-500">
                      {role.eventTypes.length === 0
                        ? "Tous les événements"
                        : role.eventTypes.map((t) => styleFor(t).label).join(", ")}
                    </span>
                  </span>
                </span>
                <button
                  onClick={() => setRemoveTarget(role)}
                  title="Archiver ce rôle"
                  className="shrink-0 rounded-lg p-1.5 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-zinc-200 p-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Ajouter un rôle
            </span>
            <input
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                // Sinon l'erreur d'une tentative précédente reste affichée
                // pendant la saisie suivante et laisse croire à un échec.
                if (error) setError(null);
              }}
              placeholder="Table de marque, arbitre de touche..."
              className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm outline-none focus:border-ubac-yellow"
            />

            <span className="text-xs text-zinc-500">Icône</span>
            <div className="flex flex-wrap gap-1.5">
              {ROLE_ICON_NAMES.map((name) => (
                <button
                  key={name}
                  onClick={() => setIcon(name)}
                  title={ROLE_ICONS[name].label}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                    icon === name
                      ? "border-navy bg-navy/10"
                      : "border-zinc-200 hover:bg-zinc-50"
                  }`}
                >
                  <RoleIcon icon={name} />
                </button>
              ))}
            </div>

            <span className="text-xs text-zinc-500">
              Types d&apos;événement (aucun coché = tous)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_TYPES.map((t) => (
                <label
                  key={t}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    eventTypes.includes(t)
                      ? "border-navy bg-navy/10 text-navy"
                      : "border-zinc-200 text-zinc-600"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={eventTypes.includes(t)}
                    onChange={() => toggleEventType(t)}
                    className="h-3.5 w-3.5 rounded border-zinc-300"
                  />
                  {styleFor(t).label}
                </label>
              ))}
            </div>

            <button
              onClick={addRole}
              disabled={saving || !label.trim()}
              className="flex w-fit items-center gap-1.5 rounded-full bg-ubac-yellow px-3.5 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {saving ? "Ajout..." : "Ajouter"}
            </button>
          </div>
        </div>
      )}

      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-zinc-900">Archiver ce rôle ?</h3>
              <button
                onClick={() => setRemoveTarget(null)}
                className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-4 text-sm text-zinc-600">
              <span className="font-semibold text-zinc-900">{removeTarget.label}</span> ne
              sera plus proposé sur les prochains événements. Les attributions déjà
              enregistrées sont conservées et restent comptées dans le bilan de la saison.
            </p>
            {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRemoveTarget(null)}
                className="flex-1 rounded-full border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Annuler
              </button>
              <button
                onClick={archiveRole}
                disabled={saving}
                className="flex-1 rounded-full bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                {saving ? "Archivage..." : "Archiver"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
