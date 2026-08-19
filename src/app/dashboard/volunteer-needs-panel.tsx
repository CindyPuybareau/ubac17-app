"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import RoleIcon from "./role-icon";
import type { EventRoleType } from "./event-tasks";
import { volunteerNeedRoles, type VolunteerNeed } from "./event-volunteer-needs";

function remainingSlots(need: VolunteerNeed) {
  return Math.max(0, need.requiredCount - need.signups.length);
}

// Une ligne affichée : soit un besoin réel (déjà en base), soit un rôle du
// catalogue qui n'a encore aucun besoin défini pour CET événement. Côté
// Bureau/coach, tous les rôles s'affichent pour qu'on sache ce qui existe
// et ce qui manque encore — mais plus aucune affectation manuelle : les
// membres se proposent eux-mêmes ("Je m'en occupe"), et les rôles se
// remplissent automatiquement au fil de leurs réponses (retour de Cindy
// du 2026-08-19 : "puisque les membres vont se mettre en disponible ou
// non disponible, les rôles vont s'afficher en automatique"). Qui gère
// garde la main pour définir/ajuster le nombre requis et retirer
// quelqu'un si besoin, jamais pour choisir la personne à sa place.
type Row = { need: VolunteerNeed | null; roleCode: string };

// Besoins en bénévoles d'un événement club (buvette, table de marque...).
// Deux modes dans le même composant plutôt que deux fichiers distincts :
// les deux affichent la même jauge et la même liste, seule l'action change
// (s'inscrire soi-même vs. gérer pour tout le monde) — les dupliquer aurait
// fait vivre deux vérités de la même donnée.
export default function VolunteerNeedsPanel({
  eventId,
  needs,
  roles: allRoles,
  myPlayerIds,
  canManage,
  bare = false,
}: {
  eventId: string;
  needs: VolunteerNeed[];
  // Catalogue complet (pas filtré par type d'événement, contrairement à
  // MatchTasksPanel) : un tournoi ou une fête peut avoir besoin de
  // n'importe quel rôle, pas seulement ceux applicables à un match. Filtré
  // ci-dessous pour exclure Maillots/Goûter (l'ancien système, event_tasks
  // — un seul responsable, pas de notion de nombre requis).
  roles: EventRoleType[];
  myPlayerIds: string[];
  canManage: boolean;
  // Nu (sans son propre cadre/titre) pour être imbriqué dans le volet
  // déroulant "Rôles d'organisation" (EventRolesEditor) — retour de Cindy
  // du 2026-08-19 : un seul volet plutôt que deux blocs séparés.
  bare?: boolean;
}) {
  const roles = volunteerNeedRoles(allRoles);
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Définir un nouveau créneau pour un rôle — premier besoin (rows sans
  // need réel) ou créneau supplémentaire (ex. Buvette 16h-18h en plus de
  // 14h-16h) : même petit formulaire dans les deux cas, indexé par rôle
  // plutôt que par besoin puisqu'un rôle virtuel n'a pas encore d'id.
  const [addFormFor, setAddFormFor] = useState<string | null>(null);
  const [addFormTimeRange, setAddFormTimeRange] = useState("");
  const [addFormCount, setAddFormCount] = useState("1");

  const rows: Row[] = canManage
    ? roles.flatMap((r): Row[] => {
        const existing = needs.filter((n) => n.roleCode === r.code);
        return existing.length > 0
          ? existing.map((n) => ({ need: n, roleCode: r.code }))
          : [{ need: null, roleCode: r.code }];
      })
    : needs.map((n) => ({ need: n, roleCode: n.roleCode }));

  async function volunteer(row: Row) {
    if (!row.need || myPlayerIds.length === 0) return;
    const roleLabel = roles.find((r) => r.code === row.roleCode)?.label ?? row.roleCode;
    const ok = window.confirm(`Confirmer : tu t'occupes de « ${roleLabel} » pour cet événement ?`);
    if (!ok) return;
    setPending(row.need.id);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("event_volunteer_signups").insert({
      need_id: row.need.id,
      player_id: myPlayerIds[0],
      source: "VOLUNTEER",
    });
    setPending(null);
    if (insertError) {
      setError("Ce créneau est déjà complet.");
      return;
    }
    router.refresh();
  }

  async function withdraw(signupId: string) {
    setPending(signupId);
    const supabase = createClient();
    await supabase.from("event_volunteer_signups").delete().eq("id", signupId);
    setPending(null);
    router.refresh();
  }

  async function removeNeed(needId: string) {
    const ok = window.confirm("Supprimer ce besoin et toutes ses inscriptions ?");
    if (!ok) return;
    setPending(needId);
    const supabase = createClient();
    await supabase.from("event_volunteer_needs").delete().eq("id", needId);
    setPending(null);
    router.refresh();
  }

  // Modifiables après coup, jamais un préalable (voir échange avec Cindy) —
  // enregistré au blur/changement plutôt qu'à chaque frappe.
  async function updateTimeRange(needId: string, value: string) {
    const supabase = createClient();
    await supabase
      .from("event_volunteer_needs")
      .update({ time_range: value.trim() || null })
      .eq("id", needId);
    router.refresh();
  }

  async function updateRequiredCount(needId: string, count: number) {
    if (count < 1) return;
    const supabase = createClient();
    await supabase.from("event_volunteer_needs").update({ required_count: count }).eq("id", needId);
    router.refresh();
  }

  async function submitAddForm(roleCode: string) {
    const count = Number(addFormCount) || 1;
    setPending("add");
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("event_volunteer_needs").insert({
      event_id: eventId,
      role_code: roleCode,
      time_range: addFormTimeRange.trim() || null,
      required_count: count,
      sort_order: roles.findIndex((r) => r.code === roleCode),
    });
    setPending(null);
    if (insertError) {
      setError("Ajout impossible, réessaie.");
      return;
    }
    setAddFormTimeRange("");
    setAddFormCount("1");
    setAddFormFor(null);
    router.refresh();
  }

  if (rows.length === 0) return null;

  const body = (
    <>
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => {
          const need = row.need;
          const role = roles.find((r) => r.code === row.roleCode);
          const remaining = need ? remainingSlots(need) : 0;
          const mySignup = need?.signups.find((s) => myPlayerIds.includes(s.playerId));

          return (
            <div
              key={need?.id ?? `${row.roleCode}-${i}`}
              className="flex flex-col gap-2 rounded-lg bg-white px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <RoleIcon icon={role?.icon ?? null} />
                  <div>
                    <p className="text-xs font-medium text-zinc-700">
                      {role?.label ?? row.roleCode}
                    </p>
                    {canManage && need ? (
                      <input
                        type="text"
                        defaultValue={need.timeRange ?? ""}
                        placeholder="+ tranche horaire"
                        onBlur={(e) => {
                          if (e.target.value.trim() !== (need.timeRange ?? "")) {
                            updateTimeRange(need.id, e.target.value);
                          }
                        }}
                        className="mt-0.5 w-32 rounded border-0 bg-transparent text-[11px] text-zinc-400 placeholder:text-zinc-300 focus:bg-zinc-50 focus:outline-none focus:ring-1 focus:ring-zinc-200"
                      />
                    ) : (
                      need?.timeRange && (
                        <p className="text-[11px] text-zinc-400">{need.timeRange}</p>
                      )
                    )}
                    {!canManage && need && need.signups.length > 0 && (
                      <p className="truncate text-[11px] text-zinc-400">
                        {need.signups.map((s) => s.playerName).join(", ")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {canManage && need ? (
                    <div className="flex items-center gap-0.5 rounded-full bg-zinc-100 px-1 py-0.5">
                      <button
                        type="button"
                        onClick={() => updateRequiredCount(need.id, need.requiredCount - 1)}
                        disabled={need.requiredCount <= 1}
                        className="flex h-5 w-5 items-center justify-center rounded-full text-zinc-500 hover:bg-white disabled:opacity-30"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-10 text-center text-[11px] font-semibold text-zinc-600">
                        {need.signups.length}/{need.requiredCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateRequiredCount(need.id, need.requiredCount + 1)}
                        className="flex h-5 w-5 items-center justify-center rounded-full text-zinc-500 hover:bg-white"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  ) : need ? (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        remaining > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {remaining > 0
                        ? `${need.signups.length}/${need.requiredCount}`
                        : `Complet (${need.signups.length}/${need.requiredCount})`}
                    </span>
                  ) : null}
                  {canManage && need && (
                    <button
                      type="button"
                      onClick={() => removeNeed(need.id)}
                      title="Supprimer ce besoin"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-red-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Confirmation explicite plutôt que la seule jauge
                  numérique — retour de Cindy du 2026-08-19 : elle veut
                  voir clairement quand sa demande est couverte. */}
              {need && need.requiredCount > 0 && remaining === 0 && (
                <p className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                  <Check className="h-3 w-3 shrink-0" />
                  Nombre de bénévoles atteint
                </p>
              )}

              {canManage ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {need?.signups.map((s) => (
                    <span
                      key={s.id}
                      className="flex items-center gap-1 rounded-full bg-navy/10 px-2 py-1 text-[11px] font-medium text-navy"
                    >
                      {s.playerName}
                      <button
                        type="button"
                        disabled={pending === s.id}
                        onClick={() => withdraw(s.id)}
                        className="text-navy/60 hover:text-navy"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {!need && (
                    <p className="text-[11px] text-zinc-400">
                      Pas encore de besoin défini pour ce rôle.
                    </p>
                  )}
                  {/* Définir un premier besoin (rôle sans need réel) ou un
                      créneau supplémentaire (ex. Buvette 16h-18h en plus de
                      14h-16h) — même petit formulaire dans les deux cas. */}
                  {addFormFor === row.roleCode ? (
                    <span className="flex flex-wrap items-center gap-1">
                      <input
                        type="text"
                        autoFocus
                        placeholder="Horaire (optionnel)"
                        value={addFormTimeRange}
                        onChange={(e) => setAddFormTimeRange(e.target.value)}
                        className="w-28 rounded-full border border-zinc-200 px-2 py-1 text-[11px]"
                      />
                      <input
                        type="number"
                        min={1}
                        value={addFormCount}
                        onChange={(e) => setAddFormCount(e.target.value)}
                        className="w-12 rounded-full border border-zinc-200 px-2 py-1 text-center text-[11px]"
                      />
                      <button
                        type="button"
                        disabled={pending === "add"}
                        onClick={() => submitAddForm(row.roleCode)}
                        className="rounded-full bg-navy px-2 py-1 text-[11px] font-semibold text-white hover:bg-navy-dark disabled:opacity-60"
                      >
                        OK
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddFormFor(null)}
                        className="rounded-full px-2 py-1 text-[11px] font-medium text-zinc-400 hover:bg-zinc-50"
                      >
                        Annuler
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddFormFor(row.roleCode)}
                      className="flex items-center gap-0.5 rounded-full px-2 py-1 text-[11px] font-medium text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600"
                    >
                      <Plus className="h-3 w-3" />
                      {need ? "Créneau" : "Définir ce besoin"}
                    </button>
                  )}
                </div>
              ) : mySignup ? (
                <button
                  type="button"
                  disabled={pending === mySignup.id}
                  onClick={() => withdraw(mySignup.id)}
                  className="flex w-fit items-center gap-1 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-50 disabled:opacity-60"
                >
                  <X className="h-3 w-3" />
                  Annuler
                </button>
              ) : need && remaining > 0 && myPlayerIds.length > 0 ? (
                <button
                  type="button"
                  disabled={pending === need.id}
                  onClick={() => volunteer(row)}
                  className="w-fit rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-dark disabled:opacity-60"
                >
                  Je m&apos;en occupe
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </>
  );

  if (bare) return body;

  return (
    <div className="mt-3 flex flex-col gap-2.5 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Besoins en bénévoles
      </p>
      {body}
    </div>
  );
}
