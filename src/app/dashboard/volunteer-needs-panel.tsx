"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import RoleIcon from "./role-icon";
import type { EventRoleType } from "./event-tasks";
import type { VolunteerNeed } from "./event-volunteer-needs";

function remainingSlots(need: VolunteerNeed) {
  return Math.max(0, need.requiredCount - need.signups.length);
}

// Besoins en bénévoles d'un événement club (buvette, table de marque...).
// Deux modes dans le même composant plutôt que deux fichiers distincts :
// les deux affichent la même jauge et la même liste de besoins, seule
// l'action change (s'inscrire soi-même vs. gérer pour tout le monde) — les
// dupliquer aurait fait vivre deux vérités de la même donnée.
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
  const [addOpen, setAddOpen] = useState(false);
  const [newRoleCode, setNewRoleCode] = useState(roles[0]?.code ?? "");
  const [newTimeRange, setNewTimeRange] = useState("");
  const [newRequiredCount, setNewRequiredCount] = useState("1");
  const [assignPlayerId, setAssignPlayerId] = useState<Record<string, string>>({});

  async function volunteer(need: VolunteerNeed) {
    const roleLabel = roles.find((r) => r.code === need.roleCode)?.label ?? need.roleCode;
    const ok = window.confirm(`Confirmer : tu t'occupes de « ${roleLabel} » pour cet événement ?`);
    if (!ok || myPlayerIds.length === 0) return;
    setPending(need.id);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("event_volunteer_signups").insert({
      need_id: need.id,
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

  async function assign(need: VolunteerNeed) {
    const playerId = assignPlayerId[need.id];
    if (!playerId) return;
    setPending(need.id);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("event_volunteer_signups").insert({
      need_id: need.id,
      player_id: playerId,
      source: "ADMIN",
    });
    setPending(null);
    if (insertError) {
      setError("Attribution impossible, réessaie.");
      return;
    }
    setAssignPlayerId((s) => ({ ...s, [need.id]: "" }));
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

  async function addNeed() {
    const requiredCount = Number(newRequiredCount);
    if (!newRoleCode || !requiredCount || requiredCount <= 0) {
      setError("Choisis un rôle et un nombre de bénévoles valide.");
      return;
    }
    setPending("add");
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("event_volunteer_needs").insert({
      event_id: eventId,
      role_code: newRoleCode,
      time_range: newTimeRange.trim() || null,
      required_count: requiredCount,
      sort_order: needs.length,
    });
    setPending(null);
    if (insertError) {
      setError("Ajout impossible, réessaie.");
      return;
    }
    setNewTimeRange("");
    setNewRequiredCount("1");
    setAddOpen(false);
    router.refresh();
  }

  if (needs.length === 0 && !canManage) return null;

  return (
    <div className="mt-3 flex flex-col gap-2.5 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Besoins en bénévoles
      </p>

      {needs.length === 0 && (
        <p className="text-xs text-zinc-400">Aucun besoin défini pour cet événement.</p>
      )}

      <div className="flex flex-col gap-2">
        {needs.map((need) => {
          const role = roles.find((r) => r.code === need.roleCode);
          const remaining = remainingSlots(need);
          const mySignup = need.signups.find((s) => myPlayerIds.includes(s.playerId));
          return (
            <div key={need.id} className="flex flex-col gap-2 rounded-lg bg-white px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <RoleIcon icon={role?.icon ?? null} />
                  <div>
                    <p className="text-xs font-medium text-zinc-700">
                      {role?.label ?? need.roleCode}
                      {need.timeRange && (
                        <span className="ml-1.5 font-normal text-zinc-400">{need.timeRange}</span>
                      )}
                    </p>
                    {need.signups.length > 0 && (
                      <p className="truncate text-[11px] text-zinc-400">
                        {need.signups.map((s) => s.playerName).join(", ")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      remaining > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {remaining > 0
                      ? `${need.signups.length}/${need.requiredCount}`
                      : `Complet (${need.signups.length}/${need.requiredCount})`}
                  </span>
                  {canManage && (
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
                  {need.signups.map((s) => (
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
                    value={assignPlayerId[need.id] ?? ""}
                    disabled={pending === need.id}
                    onChange={(e) =>
                      setAssignPlayerId((s) => ({ ...s, [need.id]: e.target.value }))
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
                  {assignPlayerId[need.id] && (
                    <button
                      type="button"
                      disabled={pending === need.id}
                      onClick={() => assign(need)}
                      className="rounded-full bg-navy px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-navy-dark disabled:opacity-60"
                    >
                      Valider
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
              ) : remaining > 0 && myPlayerIds.length > 0 ? (
                <button
                  type="button"
                  disabled={pending === need.id}
                  onClick={() => volunteer(need)}
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

      {canManage && (
        <div className="flex flex-col gap-2">
          {addOpen ? (
            <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-2.5">
              <div className="flex flex-wrap gap-2">
                <select
                  value={newRoleCode}
                  onChange={(e) => setNewRoleCode(e.target.value)}
                  className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs"
                >
                  {roles.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Tranche horaire (ex: 14h-16h)"
                  value={newTimeRange}
                  onChange={(e) => setNewTimeRange(e.target.value)}
                  className="flex-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs"
                />
                <input
                  type="number"
                  min={1}
                  value={newRequiredCount}
                  onChange={(e) => setNewRequiredCount(e.target.value)}
                  className="w-16 rounded-lg border border-zinc-200 px-2 py-1.5 text-center text-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-white"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={pending === "add"}
                  onClick={addNeed}
                  className="rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-dark disabled:opacity-60"
                >
                  {pending === "add" ? "Ajout..." : "Ajouter"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex w-fit items-center gap-1 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-white"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter un besoin
            </button>
          )}
        </div>
      )}
    </div>
  );
}
