"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import RoleIcon from "./role-icon";
import type { EventRoleType } from "./event-tasks";
import type { VolunteerNeed } from "./event-volunteer-needs";

function remainingSlots(need: VolunteerNeed) {
  return Math.max(0, need.requiredCount - need.signups.length);
}

// Une ligne affichée : soit un besoin réel (déjà en base), soit un rôle du
// catalogue qui n'a encore aucun besoin défini pour CET événement — auto-
// listé côté Bureau pour affecter en un clic, comme dans l'espace Coach
// (voir échange avec Cindy du 2026-08-19 : "aussi simple que chez Basile").
// Le besoin réel n'est créé qu'au moment de la première affectation, pas
// avant — rien à remplir ni valider en amont.
type Row = { need: VolunteerNeed | null; roleCode: string };

// Besoins en bénévoles d'un événement club (buvette, table de marque...).
// Deux modes dans le même composant plutôt que deux fichiers distincts :
// les deux affichent la même jauge et la même liste, seule l'action change
// (s'inscrire soi-même vs. gérer pour tout le monde) — les dupliquer aurait
// fait vivre deux vérités de la même donnée.
export default function VolunteerNeedsPanel({
  eventId,
  needs,
  roles,
  myPlayerIds,
  canManage,
  roster,
}: {
  eventId: string;
  needs: VolunteerNeed[];
  // Catalogue complet (pas filtré par type d'événement, contrairement à
  // MatchTasksPanel) : un tournoi ou une fête peut avoir besoin de
  // n'importe quel rôle, pas seulement ceux applicables à un match.
  roles: EventRoleType[];
  myPlayerIds: string[];
  canManage: boolean;
  roster: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assignPlayerId, setAssignPlayerId] = useState<Record<string, string>>({});
  // Second créneau pour un rôle déjà couvert (ex. Buvette 14h-16h ET
  // 16h-18h) : cas rare, gardé discret plutôt qu'un vrai formulaire —
  // juste le rôle (déjà connu) et une tranche horaire.
  const [extraSlotFor, setExtraSlotFor] = useState<string | null>(null);
  const [extraSlotTimeRange, setExtraSlotTimeRange] = useState("");

  // Un rôle sans besoin réel pour cet événement devient une ligne "virtuelle"
  // (need: null) — visible côté Bureau uniquement, pour affecter en un clic
  // sans étape de création préalable. Côté Parent/Joueur, seuls les besoins
  // réels comptent : rien à faire tant que le Bureau n'a affecté personne.
  const rows: Row[] = canManage
    ? roles.flatMap((r): Row[] => {
        const existing = needs.filter((n) => n.roleCode === r.code);
        return existing.length > 0
          ? existing.map((n) => ({ need: n, roleCode: r.code }))
          : [{ need: null, roleCode: r.code }];
      })
    : needs.map((n) => ({ need: n, roleCode: n.roleCode }));

  async function createNeedAndSignup(roleCode: string, playerId: string, source: "VOLUNTEER" | "ADMIN") {
    const supabase = createClient();
    const { data: newNeed, error: needError } = await supabase
      .from("event_volunteer_needs")
      .insert({
        event_id: eventId,
        role_code: roleCode,
        required_count: 1,
        sort_order: roles.findIndex((r) => r.code === roleCode),
      })
      .select("id")
      .single();
    if (needError || !newNeed) {
      return needError?.message ?? "Création du besoin impossible.";
    }
    const { error: signupError } = await supabase.from("event_volunteer_signups").insert({
      need_id: newNeed.id,
      player_id: playerId,
      source,
    });
    return signupError?.message ?? null;
  }

  async function volunteer(row: Row) {
    const roleLabel = roles.find((r) => r.code === row.roleCode)?.label ?? row.roleCode;
    const ok = window.confirm(`Confirmer : tu t'occupes de « ${roleLabel} » pour cet événement ?`);
    if (!ok || myPlayerIds.length === 0) return;
    const pendingKey = row.need?.id ?? row.roleCode;
    setPending(pendingKey);
    setError(null);
    let failed: string | null;
    if (row.need) {
      const supabase = createClient();
      const { error: insertError } = await supabase.from("event_volunteer_signups").insert({
        need_id: row.need.id,
        player_id: myPlayerIds[0],
        source: "VOLUNTEER",
      });
      failed = insertError?.message ?? null;
    } else {
      failed = await createNeedAndSignup(row.roleCode, myPlayerIds[0], "VOLUNTEER");
    }
    setPending(null);
    if (failed) {
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

  async function assign(row: Row) {
    const pendingKey = row.need?.id ?? row.roleCode;
    const playerId = assignPlayerId[pendingKey];
    if (!playerId) return;
    setPending(pendingKey);
    setError(null);
    let failed: string | null;
    if (row.need) {
      const supabase = createClient();
      const { error: insertError } = await supabase.from("event_volunteer_signups").insert({
        need_id: row.need.id,
        player_id: playerId,
        source: "ADMIN",
      });
      failed = insertError?.message ?? null;
    } else {
      failed = await createNeedAndSignup(row.roleCode, playerId, "ADMIN");
    }
    setPending(null);
    if (failed) {
      setError("Attribution impossible, réessaie.");
      return;
    }
    setAssignPlayerId((s) => ({ ...s, [pendingKey]: "" }));
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

  async function addExtraSlot(roleCode: string) {
    setPending("extra");
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("event_volunteer_needs").insert({
      event_id: eventId,
      role_code: roleCode,
      time_range: extraSlotTimeRange.trim() || null,
      required_count: 1,
      sort_order: roles.findIndex((r) => r.code === roleCode),
    });
    setPending(null);
    if (insertError) {
      setError("Ajout impossible, réessaie.");
      return;
    }
    setExtraSlotTimeRange("");
    setExtraSlotFor(null);
    router.refresh();
  }

  if (rows.length === 0) return null;

  return (
    <div className="mt-3 flex flex-col gap-2.5 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Besoins en bénévoles
      </p>

      <div className="flex flex-col gap-2">
        {rows.map((row, i) => {
          const need = row.need;
          const role = roles.find((r) => r.code === row.roleCode);
          const remaining = need ? remainingSlots(need) : 1;
          const mySignup = need?.signups.find((s) => myPlayerIds.includes(s.playerId));
          const pendingKey = need?.id ?? row.roleCode;

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
                  ) : (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        remaining > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {need
                        ? remaining > 0
                          ? `${need.signups.length}/${need.requiredCount}`
                          : `Complet (${need.signups.length}/${need.requiredCount})`
                        : "0/1"}
                    </span>
                  )}
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
                  <select
                    value={assignPlayerId[pendingKey] ?? ""}
                    disabled={pending === pendingKey}
                    onChange={(e) =>
                      setAssignPlayerId((s) => ({ ...s, [pendingKey]: e.target.value }))
                    }
                    className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-[11px] disabled:opacity-60"
                  >
                    <option value="">+ Affecter...</option>
                    {roster.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {assignPlayerId[pendingKey] && (
                    <button
                      type="button"
                      disabled={pending === pendingKey}
                      onClick={() => assign(row)}
                      className="rounded-full bg-navy px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-navy-dark disabled:opacity-60"
                    >
                      Valider
                    </button>
                  )}
                  {/* Un second créneau pour ce même rôle (ex. Buvette
                      16h-18h en plus de 14h-16h) : seulement proposé une
                      fois qu'un premier existe déjà, cas rare gardé discret. */}
                  {need &&
                    (extraSlotFor === need.id ? (
                      <span className="flex items-center gap-1">
                        <input
                          type="text"
                          autoFocus
                          placeholder="Horaire du 2e créneau"
                          value={extraSlotTimeRange}
                          onChange={(e) => setExtraSlotTimeRange(e.target.value)}
                          className="w-32 rounded-full border border-zinc-200 px-2 py-1 text-[11px]"
                        />
                        <button
                          type="button"
                          disabled={pending === "extra"}
                          onClick={() => addExtraSlot(row.roleCode)}
                          className="rounded-full bg-navy px-2 py-1 text-[11px] font-semibold text-white hover:bg-navy-dark disabled:opacity-60"
                        >
                          OK
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setExtraSlotFor(need.id)}
                        className="flex items-center gap-0.5 rounded-full px-2 py-1 text-[11px] font-medium text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600"
                      >
                        <Plus className="h-3 w-3" />
                        Créneau
                      </button>
                    ))}
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
              ) : remaining > 0 && myPlayerIds.length > 0 ? (
                <button
                  type="button"
                  disabled={pending === pendingKey}
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
    </div>
  );
}
