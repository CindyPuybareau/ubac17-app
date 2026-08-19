"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { teamLabel } from "@/lib/teams";
import { SALLES } from "./salles";
import { sendEventPush } from "./event-push";
import DateTimePicker from "./date-time-picker";
import RoleIcon from "./role-icon";
import { Plus, X } from "lucide-react";
import {
  CUSTOM_ROLE_CODE,
  STANDARD_VOLUNTEER_ROLES,
  volunteerRoleIcon,
} from "./event-volunteer-needs";

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
  // Portée de l'événement : un choix à plat, direct, plutôt que de faire
  // passer "équipes spécifiques" par un détour via "Tous les groupes" —
  // c'est ce détour qui donnait l'impression qu'on ne pouvait choisir
  // qu'une seule équipe (retour de Cindy du 2026-08-20 : "à l'heure
  // actuelle, quand je créer un evenement, je ne peux choisir qu'une
  // equipe"). "specific"/"club" n'ont de sens que si allowClubWide.
  const [scopeMode, setScopeMode] = useState<"single" | "specific" | "club">("single");
  const [targetTeamIds, setTargetTeamIds] = useState<string[]>([]);
  // Besoins d'organisation définis dès la création (buvette, table de
  // marque...) : une liste libre de lignes rôle + effectif, comme dans le
  // formulaire "+ Ajouter un besoin" de la carte événement — rattachés à
  // la première occurrence seulement si "Répéter chaque semaine" est
  // coché, un besoin par séance n'aurait pas le même sens (voir retour de
  // Cindy du 2026-08-19 : elle veut pouvoir chiffrer sa demande dès la
  // création, pas seulement après coup, mais sans catalogue à gérer).
  const [draftNeeds, setDraftNeeds] = useState<
    { key: number; roleCode: string; customLabel: string; count: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function addDraftNeed() {
    setDraftNeeds((rows) => [
      ...rows,
      { key: Date.now() + rows.length, roleCode: STANDARD_VOLUNTEER_ROLES[0].code, customLabel: "", count: "1" },
    ]);
  }

  function removeDraftNeed(key: number) {
    setDraftNeeds((rows) => rows.filter((r) => r.key !== key));
  }

  function updateDraftNeed(key: number, patch: Partial<{ roleCode: string; customLabel: string; count: string }>) {
    setDraftNeeds((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

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
    if (scopeMode === "specific" && targetTeamIds.length === 0) {
      setError("Choisis au moins une équipe pour un événement réservé.");
      return;
    }
    const missingCustomLabel = draftNeeds.some(
      (n) => n.roleCode === CUSTOM_ROLE_CODE && !n.customLabel.trim()
    );
    if (missingCustomLabel) {
      setError("Précise le nom de chaque besoin \"Autre\".");
      return;
    }

    // null = "Tous les groupes" (comportement historique) — seulement
    // rempli quand la portée "Équipes spécifiques" est choisie explicitement.
    const effectiveTeamId = scopeMode === "single" ? teamId : "";
    const effectiveTargetTeamIds = scopeMode === "specific" ? targetTeamIds : null;

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
      team_id: effectiveTeamId || null,
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
      const team = teams.find((t) => t.id === effectiveTeamId);
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

    // Besoins d'organisation chiffrés dès la création — rattachés à la
    // première occurrence seulement (voir le commentaire sur draftNeeds
    // plus haut). Best-effort : une erreur ici ne doit pas faire croire
    // que l'événement lui-même n'a pas été créé, il l'a bien été.
    const validNeeds = draftNeeds
      .map((n, i) => ({
        roleCode: n.roleCode,
        customLabel: n.roleCode === CUSTOM_ROLE_CODE ? n.customLabel.trim() : null,
        count: Number(n.count) || 0,
        sortOrder: i,
      }))
      .filter((n) => n.count > 0);
    if (first && validNeeds.length > 0) {
      const { error: needsError } = await supabase.from("event_volunteer_needs").insert(
        validNeeds.map((n) => ({
          event_id: first.id,
          role_code: n.roleCode,
          custom_label: n.customLabel,
          required_count: n.count,
          sort_order: n.sortOrder,
        }))
      );
      if (needsError) {
        // On garde le formulaire ouvert : fermer maintenant masquerait ce
        // message alors que l'événement, lui, a bien été créé.
        setError(
          `Événement créé, mais l'ajout des besoins d'organisation a échoué : ${needsError.message}`
        );
        router.refresh();
        return;
      }
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
    setScopeMode("single");
    setTargetTeamIds([]);
    setDraftNeeds([]);
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

      {/* Portée : un choix à plat, direct, plutôt qu'un détour par "Tous
          les groupes" pour arriver à "équipes spécifiques" (retour de
          Cindy du 2026-08-20 — voir le commentaire sur scopeMode plus
          haut). "Équipes spécifiques"/"Tout le club" n'ont de sens que
          pour qui peut créer un événement club (allowClubWide) ; sinon,
          un simple menu déroulant suffit comme avant. */}
      {allowClubWide && (
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { value: "single" as const, label: "Une équipe" },
              { value: "specific" as const, label: "Équipes spécifiques" },
              { value: "club" as const, label: "Tout le club" },
            ]
          ).map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setScopeMode(c.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                scopeMode === c.value
                  ? "border-navy bg-navy/10 text-navy"
                  : "border-zinc-200 text-zinc-500 hover:bg-white"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {(!allowClubWide ? teams.length > 1 : scopeMode === "single") && (
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {teamLabel(t)}
            </option>
          ))}
        </select>
      )}

      {allowClubWide && scopeMode === "specific" && (
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

      {/* Chiffrer sa demande dès la création (ex. "3 pour la buvette") avec
          la même liste standard que sur la carte de l'événement une fois
          créé (VolunteerNeedsPanel) — ceci n'est qu'un raccourci pour ne
          pas avoir à y retourner tout de suite ; les besoins restent de
          toute façon ajoutables/modifiables après coup. */}
      <div className="flex flex-col gap-2 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
        <p className="text-xs font-medium text-zinc-600">
          Besoins d&apos;organisation (optionnel)
        </p>
        {draftNeeds.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {draftNeeds.map((n) => (
              <div key={n.key} className="flex flex-wrap items-center gap-1.5">
                <RoleIcon icon={volunteerRoleIcon(n.roleCode)} className="h-3.5 w-3.5 shrink-0" />
                <select
                  value={n.roleCode}
                  onChange={(e) => updateDraftNeed(n.key, { roleCode: e.target.value })}
                  className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs"
                >
                  {STANDARD_VOLUNTEER_ROLES.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                  <option value={CUSTOM_ROLE_CODE}>Autre...</option>
                </select>
                {n.roleCode === CUSTOM_ROLE_CODE && (
                  <input
                    type="text"
                    placeholder="Nom du besoin"
                    value={n.customLabel}
                    onChange={(e) => updateDraftNeed(n.key, { customLabel: e.target.value })}
                    className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs"
                  />
                )}
                <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-600">
                  Nombre de personnes requises
                  <input
                    type="number"
                    min={1}
                    value={n.count}
                    onChange={(e) => updateDraftNeed(n.key, { count: e.target.value })}
                    className="w-14 shrink-0 rounded-lg border border-zinc-200 px-2 py-1 text-center"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeDraftNeed(n.key)}
                  title="Retirer ce besoin"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-white hover:text-red-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={addDraftNeed}
          className="flex w-fit items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter un besoin
        </button>
      </div>

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
