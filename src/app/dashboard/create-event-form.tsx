"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { teamLabel } from "@/lib/teams";
import { SALLES } from "./salles";

type Team = { id: string; name: string | null; category: string | null };
type EventType = "MATCH" | "TRAINING" | "OTHER" | "TOURNAMENT";

const defaultTitles: Record<EventType, string> = {
  MATCH: "Match",
  TRAINING: "Entraînement",
  OTHER: "Événement",
  TOURNAMENT: "Tournoi",
};

export default function CreateEventForm({
  teams,
  allowClubWide = false,
}: {
  teams: Team[];
  allowClubWide?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState<EventType>("MATCH");
  const [location, setLocation] = useState("");
  const [salle, setSalle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (eventType === "TRAINING" && !endTime) {
      setError("L'heure de fin est obligatoire pour un entraînement.");
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.from("events").insert({
      team_id: teamId || null,
      title: title || defaultTitles[eventType],
      event_type: eventType,
      location: location || null,
      salle: salle || null,
      start_time: new Date(startTime).toISOString(),
      end_time: endTime ? new Date(endTime).toISOString() : null,
      notes: notes || null,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setTitle("");
    setLocation("");
    setSalle("");
    setStartTime("");
    setEndTime("");
    setNotes("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-fit rounded-full border border-ubac-blue px-4 py-2 text-sm font-semibold text-ubac-blue transition-colors hover:bg-ubac-blue/10"
      >
        + Créer un événement
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm"
    >
      <h3 className="font-semibold text-zinc-900">Créer un événement</h3>

      {(teams.length > 1 || allowClubWide) && (
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        >
          {allowClubWide && (
            <option value="">Tous les groupes (stage club)</option>
          )}
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {teamLabel(t)}
            </option>
          ))}
        </select>
      )}

      <div className="grid grid-cols-2 gap-3">
        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value as EventType)}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        >
          <option value="MATCH">Match</option>
          <option value="TRAINING">Entraînement</option>
          <option value="TOURNAMENT">Tournoi / Coupe</option>
          <option value="OTHER">Autre</option>
        </select>
        <input
          placeholder="Titre (optionnel)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <input
          placeholder="Lieu"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        />
        <select
          value={salle}
          onChange={(e) => setSalle(e.target.value)}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        >
          <option value="">Salle (optionnel)</option>
          {SALLES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">
            Début
          </label>
          <input
            type="datetime-local"
            required
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">
            Fin{eventType === "TRAINING" ? " *" : " (optionnel)"}
          </label>
          <input
            type="datetime-local"
            required={eventType === "TRAINING"}
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <textarea
        placeholder="Notes (optionnel)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-ubac-yellow px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
        >
          {loading ? "Création..." : "Créer"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
