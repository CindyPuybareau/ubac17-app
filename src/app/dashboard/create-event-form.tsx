"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { teamLabel } from "@/lib/teams";
import { SALLES } from "./salles";
import { sendEventPush } from "./event-push";
import DateTimePicker from "./date-time-picker";

type Team = { id: string; name: string | null; category: string | null };
type EventType = "MATCH" | "FRIENDLY" | "TRAINING" | "OTHER" | "TOURNAMENT";

const defaultTitles: Record<EventType, string> = {
  MATCH: "Match",
  FRIENDLY: "Match amical",
  TRAINING: "Entraînement",
  OTHER: "Événement",
  TOURNAMENT: "Tournoi",
};

// Garde-fou plutôt qu'une vraie limite métier : une saison complète
// hebdomadaire tient largement dedans (~43 semaines), au-delà c'est plus
// probablement une erreur de date de fin qu'une vraie intention.
const MAX_OCCURRENCES = 52;

// Ajoute N semaines à un "YYYY-MM-DDTHH:MM" (valeur d'un <input
// datetime-local>) en ne touchant qu'à la date, jamais à l'heure — et en
// restant en local tout du long, contrairement à un aller-retour par
// toISOString() qui peut faire glisser la date d'un jour selon l'heure et
// le fuseau.
function addWeeksToLocalDatetime(datetimeLocal: string, weeks: number): string {
  const [datePart, timePart] = datetimeLocal.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + weeks * 7);
  const newDatePart = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return `${newDatePart}T${timePart}`;
}

// Le choix du type se fait en un geste, avec la couleur qu'aura ensuite
// l'événement dans le calendrier : on voit ce qu'on crée.
const typeChoices: { value: EventType; label: string; active: string }[] = [
  { value: "TRAINING", label: "Entraînement", active: "border-green-400 bg-green-100 text-green-700" },
  { value: "MATCH", label: "Match officiel", active: "border-red-400 bg-red-100 text-red-700" },
  { value: "FRIENDLY", label: "Match amical", active: "border-blue-400 bg-blue-100 text-blue-700" },
  { value: "TOURNAMENT", label: "Tournoi / Plateau", active: "border-amber-400 bg-amber-100 text-amber-800" },
  { value: "OTHER", label: "Événement club", active: "border-purple-400 bg-purple-100 text-purple-700" },
];

export default function CreateEventForm({
  teams,
  allowClubWide = false,
  open,
  onClose,
}: {
  teams: Team[];
  allowClubWide?: boolean;
  // Ouverture pilotee par l appelant : le bouton "+ Creer un evenement"
  // vit dans l en-tete du calendrier, a cote de la navigation de date,
  // pas au-dessus du formulaire.
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState<EventType>("TRAINING");
  const [isHome, setIsHome] = useState<"" | "true" | "false">("");
  const [location, setLocation] = useState("");
  const [salle, setSalle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatUntil, setRepeatUntil] = useState("");
  // Portée d'un événement "Tous les groupes" (teamId === "") : soit
  // vraiment tout le club (comportement historique), soit réservé à
  // quelques équipes précises (target_team_ids, voir 20261012000000). Sans
  // objet dès qu'une équipe précise est choisie dans le select ci-dessus.
  const [clubScope, setClubScope] = useState<"all" | "specific">("all");
  const [targetTeamIds, setTargetTeamIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleTargetTeam(id: string) {
    setTargetTeamIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  const isMatch = eventType === "MATCH" || eventType === "FRIENDLY";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Plus de <input required> natif depuis le passage au DateTimePicker
    // (ce n'est plus un vrai champ de formulaire) — la validation devient
    // explicite ici, au même endroit que celle de l'heure de fin.
    if (!startTime) {
      setError("La date et l'heure de début sont requises.");
      return;
    }
    if (eventType === "TRAINING" && !endTime) {
      setError("L'heure de fin est obligatoire pour un entraînement.");
      return;
    }
    if (repeatWeekly && !repeatUntil) {
      setError("Choisis une date de fin pour la répétition.");
      return;
    }
    if (!teamId && clubScope === "specific" && targetTeamIds.length === 0) {
      setError("Choisis au moins une équipe pour un événement réservé.");
      return;
    }

    // null = "Tous les groupes" (comportement historique) — seulement
    // rempli quand la portée "Équipes spécifiques" est choisie explicitement.
    const effectiveTargetTeamIds =
      !teamId && clubScope === "specific" ? targetTeamIds : null;

    // Une occurrence par semaine, même jour même heure, jusqu'à la date de
    // fin incluse — pas un moteur de récurrence : chaque ligne est un
    // événement normal comme un autre une fois créée, modifiable ou
    // supprimable seule sans toucher aux autres.
    const occurrences = [startTime];
    if (repeatWeekly && repeatUntil) {
      for (let i = 1; i <= MAX_OCCURRENCES; i += 1) {
        const candidate = addWeeksToLocalDatetime(startTime, i);
        if (candidate.slice(0, 10) > repeatUntil) break;
        occurrences.push(candidate);
      }
      if (occurrences.length > MAX_OCCURRENCES) {
        setError(
          `Trop de séances (${occurrences.length}) pour une seule création — choisis une date de fin plus proche (${MAX_OCCURRENCES} maximum).`
        );
        return;
      }
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const rows = occurrences.map((dt) => ({
      team_id: teamId || null,
      target_team_ids: effectiveTargetTeamIds,
      title: title || defaultTitles[eventType],
      event_type: eventType,
      is_home: isMatch && isHome !== "" ? isHome === "true" : null,
      location: location || null,
      salle: salle || null,
      start_time: new Date(dt).toISOString(),
      // Même jour que le début de CETTE occurrence — pas celui de la
      // première : sinon toute la série hériterait de la date du premier
      // entraînement pour son heure de fin.
      end_time: endTime ? new Date(`${dt.slice(0, 10)}T${endTime}`).toISOString() : null,
      notes: notes || null,
    }));

    const { data: inserted, error } = await supabase
      .from("events")
      .insert(rows)
      .select("id, start_time")
      .order("start_time", { ascending: true });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // Bonus, pas bloquant : voir event-push.ts. La famille apprend le
    // nouveau rendez-vous sans avoir à ouvrir l'appli ni passer par
    // WhatsApp. Une seule notification même pour une série entière : dix
    // pushs d'affilée pour dix entraînements identiques serait du bruit,
    // pas un service.
    const first = inserted?.[0];
    if (first) {
      const team = teams.find((t) => t.id === teamId);
      const when = new Date(first.start_time).toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      const heure = new Date(first.start_time).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const lieu = salle || location;
      const label = typeChoices.find((c) => c.value === eventType)?.label ?? "Événement";
      const body =
        inserted.length > 1
          ? `Nouveau : ${label} chaque semaine (${inserted.length} séances), à partir du ${when} à ${heure}${lieu ? ` · ${lieu}` : ""}.`
          : `Nouveau : ${label}, ${when} à ${heure}${lieu ? ` · ${lieu}` : ""}.`;
      sendEventPush(first.id, `UBAC — ${team ? teamLabel(team) : "Tous les groupes"}`, body);
    }

    setTitle("");
    setIsHome("");
    setLocation("");
    setSalle("");
    setStartTime("");
    setEndTime("");
    setNotes("");
    setRepeatWeekly(false);
    setRepeatUntil("");
    setClubScope("all");
    setTargetTeamIds([]);
    onClose();
    router.refresh();
  }

  if (!open) return null;

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

      {/* "Tous les groupes" se précise en deux sous-cas : vraiment tout le
          club, ou réservé à quelques équipes (ex. Octobre Rose pour U18M
          et U13M seulement) — sans objet dès qu'une équipe précise est
          choisie dans le select ci-dessus. */}
      {allowClubWide && !teamId && (
        <div className="flex flex-col gap-2 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
          <div className="flex gap-1.5">
            {(
              [
                { value: "all" as const, label: "Tout le club" },
                { value: "specific" as const, label: "Équipes spécifiques" },
              ]
            ).map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setClubScope(c.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  clubScope === c.value
                    ? "border-navy bg-navy/10 text-navy"
                    : "border-zinc-200 text-zinc-500 hover:bg-white"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          {clubScope === "specific" && (
            <div className="grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-2">
              {teams.map((t) => (
                <label key={t.id} className="flex items-center gap-1.5 text-xs text-zinc-700">
                  <input
                    type="checkbox"
                    checked={targetTeamIds.includes(t.id)}
                    onChange={() => toggleTargetTeam(t.id)}
                    className="h-3.5 w-3.5 rounded border-zinc-300 text-navy focus:ring-navy"
                  />
                  {teamLabel(t)}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-zinc-600">Type d&apos;événement</span>
        <div className="flex flex-wrap gap-1.5">
          {typeChoices.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setEventType(c.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                eventType === c.value
                  ? c.active
                  : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {isMatch && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-zinc-600">Lieu du match</span>
          <div className="flex flex-wrap gap-1.5">
            {[
              { value: "true", label: "Domicile" },
              { value: "false", label: "Extérieur" },
            ].map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setIsHome(isHome === c.value ? "" : (c.value as "true" | "false"))}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isHome === c.value
                    ? "border-navy bg-navy/10 text-navy"
                    : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <input
        placeholder="Titre (optionnel)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <input
            placeholder="Adresse ou lieu"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
          {/* Une des trois salles du club a déjà son adresse complète : ce
              champ ne sert que pour un lieu hors club (déplacement), d'où
              le rappel — sinon l'itinéraire pointerait juste sur le centre
              de la ville tapée, pas sur le gymnase. */}
          <p className="mt-1 text-[11px] text-zinc-400">
            Utilisée pour l&apos;itinéraire (Waze/Maps) et le covoiturage — une
            adresse précise vaut mieux qu&apos;un nom de ville.
          </p>
        </div>
        <select
          value={salle}
          onChange={(e) => setSalle(e.target.value)}
          className="h-fit rounded-lg border border-zinc-200 px-3 py-2 text-sm"
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
          <DateTimePicker value={startTime} onChange={setStartTime} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">
            Heure de fin{eventType === "TRAINING" ? " *" : " (optionnel)"}
          </label>
          <input
            type="time"
            required={eventType === "TRAINING"}
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <input
            type="checkbox"
            checked={repeatWeekly}
            onChange={(e) => setRepeatWeekly(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-navy focus:ring-navy"
          />
          Répéter chaque semaine
        </label>
        {repeatWeekly && (
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Jusqu&apos;au (inclus)
            </label>
            <input
              type="date"
              required={repeatWeekly}
              min={startTime ? startTime.slice(0, 10) : undefined}
              value={repeatUntil}
              onChange={(e) => setRepeatUntil(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[11px] text-zinc-400">
              Une séance créée chaque semaine, même jour et même heure, jusqu&apos;à
              cette date incluse ({MAX_OCCURRENCES} séances maximum en une fois).
              Chacune reste ensuite modifiable ou supprimable indépendamment.
            </p>
          </div>
        )}
      </div>

      <textarea
        placeholder="Notes (optionnel)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
      />

      {/* Plus de section "Besoins en bénévoles" ici : une fois l'événement
          créé, tous les rôles du catalogue apparaissent automatiquement sur
          sa carte dans le calendrier (VolunteerNeedsPanel) — un seul clic
          pour affecter quelqu'un, sans étape de création préalable. Voir
          l'échange avec Cindy du 2026-08-19 : plus simple et fluide que ce
          formulaire multi-champs. */}

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
          onClick={onClose}
          className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
