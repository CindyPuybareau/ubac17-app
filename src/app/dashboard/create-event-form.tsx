"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Team = { id: string; name: string | null; category: string | null };
type EventType = "MATCH" | "TRAINING" | "OTHER";

const defaultTitles: Record<EventType, string> = {
  MATCH: "Match",
  TRAINING: "Entraînement",
  OTHER: "Événement",
};

export default function CreateEventForm({ teams }: { teams: Team[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState<EventType>("MATCH");
  const [location, setLocation] = useState("");
  const [startTime, setStartTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.from("events").insert({
      team_id: teamId,
      title: title || defaultTitles[eventType],
      event_type: eventType,
      location: location || null,
      start_time: new Date(startTime).toISOString(),
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setTitle("");
    setLocation("");
    setStartTime("");
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

      {teams.length > 1 && (
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.category ? ` · ${t.category}` : ""}
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
          <option value="OTHER">Autre</option>
        </select>
        <input
          placeholder="Titre (optionnel)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        />
      </div>

      <input
        placeholder="Lieu"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
      />

      <input
        type="datetime-local"
        required
        value={startTime}
        onChange={(e) => setStartTime(e.target.value)}
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
