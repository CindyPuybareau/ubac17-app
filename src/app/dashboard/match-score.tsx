"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Trophy, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Piste n°6 de l'audit : le coach saisit le score à la main juste après le
// match, en deux clics — ouvrir le mini-formulaire, valider. Pas d'import
// automatique depuis le site FFBB (page pas faite pour être lue par un
// programme, casse au moindre changement de mise en page) : une saisie
// manuelle est moins automatique mais fiable dès maintenant, comme le
// reste des données de l'appli.
export default function MatchScore({
  eventId,
  teamScore,
  opponentScore,
  canEdit,
}: {
  eventId: string;
  teamScore: number | null;
  opponentScore: number | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [team, setTeam] = useState("");
  const [opponent, setOpponent] = useState("");
  const [saving, setSaving] = useState(false);

  const hasScore = teamScore !== null && opponentScore !== null;

  function openEdit() {
    setTeam(teamScore !== null ? String(teamScore) : "");
    setOpponent(opponentScore !== null ? String(opponentScore) : "");
    setEditing(true);
  }

  async function save() {
    const t = Number(team);
    const o = Number(opponent);
    if (!Number.isInteger(t) || !Number.isInteger(o) || t < 0 || o < 0) return;
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from("events")
      .update({ team_score: t, opponent_score: o })
      .eq("id", eventId);
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          placeholder="UBAC"
          aria-label="Score UBAC"
          className="h-7 w-12 rounded-md border border-zinc-200 text-center text-sm font-semibold tabular-nums"
        />
        <span className="text-xs text-zinc-400">–</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={opponent}
          onChange={(e) => setOpponent(e.target.value)}
          placeholder="Adv."
          aria-label="Score adverse"
          className="h-7 w-12 rounded-md border border-zinc-200 text-center text-sm font-semibold tabular-nums"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving || team === "" || opponent === ""}
          title="Valider"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-white disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          title="Annuler"
          className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (!hasScore) {
    if (!canEdit) return null;
    return (
      <button
        type="button"
        onClick={openEdit}
        className="flex w-fit items-center gap-1 rounded-full border border-dashed border-zinc-300 px-2 py-0.5 text-[11px] font-medium text-zinc-400 transition-colors hover:border-zinc-400 hover:text-zinc-600"
      >
        <Trophy className="h-3 w-3" />
        Ajouter le score
      </button>
    );
  }

  const diff = (teamScore as number) - (opponentScore as number);
  const resultClass =
    diff > 0
      ? "bg-green-100 text-green-700"
      : diff < 0
        ? "bg-red-100 text-red-700"
        : "bg-zinc-100 text-zinc-600";

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums ${resultClass}`}
      >
        {teamScore} – {opponentScore}
      </span>
      {canEdit && (
        <button
          type="button"
          onClick={openEdit}
          title="Modifier le score"
          className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
