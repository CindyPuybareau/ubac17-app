"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
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
import type { AdminUpcomingEvent } from "./page";

type Team = { id: string; name: string | null; category: string | null };
type EventType = "MATCH" | "FRIENDLY" | "TRAINING" | "OTHER" | "TOURNAMENT";

// Même logique que resolveEventTeamName (page.tsx), rejouée côté client
// pour construire une carte affichable immédiatement — voir onCreated/
// onUpdated plus bas.
function resolveTeamNameClient(
  teamId: string | null,
  targetTeamIds: string[] | null,
  teams: Team[]
): string {
  if (teamId) return teams.find((t) => t.id === teamId)?.name ?? "Équipe";
  if (targetTeamIds && targetTeamIds.length > 0) {
    const names = targetTeamIds
      .map((id) => teams.find((t) => t.id === id)?.name)
      .filter((n): n is string => Boolean(n));
    return names.length > 0 ? names.join(", ") : "Équipes sélectionnées";
  }
  return "Tous les groupes";
}

// "YYYY-MM-DDTHH:MM" (valeur d'un <input datetime-local> / DateTimePicker)
// et "HH:MM", pour préremplir le formulaire depuis un événement existant
// en mode édition — mêmes fonctions que l'ancienne modale de modification
// (calendar-view.tsx), reprises ici puisque c'est ce formulaire-ci qui gère
// désormais la modification.
function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toTimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const defaultTitles: Record<EventType, string> = {
  MATCH: "Match",
  FRIENDLY: "Match amical",
  TRAINING: "Entraînement",
  OTHER: "Événement",
  TOURNAMENT: "Tournoi",
};

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
  editingEvent,
  onClose,
  onCreated,
  onUpdated,
}: {
  teams: Team[];
  allowClubWide?: boolean;
  // Ouverture pilotee par l appelant : le bouton "+ Creer un evenement"
  // vit dans l en-tete du calendrier, a cote de la navigation de date,
  // pas au-dessus du formulaire.
  open: boolean;
  // Retour de Cindy du 2026-08-25 ("je ne peux pas modifier ce que je
  // veux, il faudrait qu'il se réouvre comme lors d'une création, meme
  // visuel, pas un popup") : ce même formulaire sert aussi à la
  // modification — non-null = mode édition, préremplit tous les champs
  // (y compris "Événement payant") et fait un UPDATE au lieu d'un INSERT.
  editingEvent?: AdminUpcomingEvent | null;
  onClose: () => void;
  // Affiche la ou les occurrences créées sur le calendrier dès la
  // validation, sans attendre le rafraîchissement temps réel (débounce
  // ~0,8s + un aller-retour serveur complet qui recharge tout le tableau
  // de bord) — retour de Cindy du 2026-08-21 : "7-8 secondes... c'est
  // long". Même correctif que les panneaux Organisation.
  onCreated?: (events: AdminUpcomingEvent[]) => void;
  onUpdated?: (event: AdminUpcomingEvent) => void;
}) {
  const isEditing = Boolean(editingEvent);
  const formRef = useRef<HTMLFormElement>(null);

  // Préremplissage en mode édition : initialiseurs paresseux plutôt qu'un
  // useEffect qui viendrait setState après coup (retour de lint
  // react-hooks/set-state-in-effect — et surtout, l'appelant remonte ce
  // composant à chaque changement d'événement édité via key={editingEvent
  // ?.id ?? "create"} sur <CreateEventForm>, voir calendar-view.tsx, donc
  // ces initialiseurs se rejouent bien à chaque nouvelle édition).
  const [teamId, setTeamId] = useState(() => editingEvent?.teamId ?? teams[0]?.id ?? "");
  const [title, setTitle] = useState(() => editingEvent?.title ?? "");
  const [eventType, setEventType] = useState<EventType>(
    () => (editingEvent?.event_type as EventType) ?? "TRAINING"
  );
  const [isHome, setIsHome] = useState<"" | "true" | "false">(() =>
    !editingEvent || editingEvent.isHome === null ? "" : editingEvent.isHome ? "true" : "false"
  );
  const [location, setLocation] = useState(() => editingEvent?.location ?? "");
  const [salle, setSalle] = useState(() => editingEvent?.salle ?? "");
  const [startTime, setStartTime] = useState(() =>
    editingEvent ? toDatetimeLocal(editingEvent.start_time) : ""
  );
  const [endTime, setEndTime] = useState(() =>
    editingEvent?.end_time ? toTimeLocal(editingEvent.end_time) : ""
  );
  const [notes, setNotes] = useState(() => editingEvent?.notes ?? "");
  // Retour de Cindy du 2026-08-25 : remplace "Répéter chaque semaine" (voir
  // git history pour l'ancienne version) — un événement payant crée
  // automatiquement sa collecte de suivi (Cotisations -> Événements
  // payants), avec les participants pré-remplis d'après la portée choisie
  // ci-dessus (équipe/équipes/tout le club), et un lien de paiement externe
  // (HelloAsso...) affiché directement sur la carte de l'événement pour que
  // chaque famille paie elle-même.
  const [isPaid, setIsPaid] = useState(() => editingEvent?.isPaid ?? false);
  const [paidAmount, setPaidAmount] = useState(() =>
    editingEvent?.paidAmount != null ? String(editingEvent.paidAmount) : ""
  );
  const [paidLink, setPaidLink] = useState(() => editingEvent?.paymentLink ?? "");
  // Portée de l'événement : un choix à plat, direct, plutôt que de faire
  // passer "équipes spécifiques" par un détour via "Tous les groupes" —
  // c'est ce détour qui donnait l'impression qu'on ne pouvait choisir
  // qu'une seule équipe (retour de Cindy du 2026-08-20 : "à l'heure
  // actuelle, quand je créer un evenement, je ne peux choisir qu'une
  // equipe"). "specific"/"club" n'ont de sens que si allowClubWide.
  const [scopeMode, setScopeMode] = useState<"single" | "specific" | "club">(() =>
    editingEvent?.teamId
      ? "single"
      : editingEvent?.targetTeamIds && editingEvent.targetTeamIds.length > 0
        ? "specific"
        : editingEvent
          ? "club"
          : "single"
  );
  const [targetTeamIds, setTargetTeamIds] = useState<string[]>(() => editingEvent?.targetTeamIds ?? []);
  // Besoins d'organisation définis dès la création (buvette, table de
  // marque...) : une liste libre de lignes rôle + effectif, comme dans le
  // formulaire "+ Ajouter un besoin" de la carte événement. Non proposé en
  // mode édition : ce champ ne sait qu'ajouter, jamais éditer/retirer un
  // besoin déjà existant — VolunteerNeedsPanel, sur la carte de
  // l'événement, reste le seul endroit fiable pour ça une fois l'événement
  // créé.
  const [draftNeeds, setDraftNeeds] = useState<
    { key: number; roleCode: string; customLabel: string; count: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function resetFields() {
    setTeamId(teams[0]?.id ?? "");
    setTitle("");
    setEventType("TRAINING");
    setIsHome("");
    setLocation("");
    setSalle("");
    setStartTime("");
    setEndTime("");
    setNotes("");
    setIsPaid(false);
    setPaidAmount("");
    setPaidLink("");
    setScopeMode("single");
    setTargetTeamIds([]);
    setDraftNeeds([]);
    setError(null);
  }

  // Réaffiche le formulaire à l'écran dès qu'une édition démarre : le
  // crayon peut être cliqué sur une carte loin en bas de la liste, alors
  // que le formulaire, lui, s'affiche toujours en haut (retour de Cindy :
  // "il faudrait qu'il se réouvre comme lors d'une création, meme
  // visuel"). Pas de setState ici, seulement un défilement — aucun conflit
  // avec le remontage par key ci-dessus.
  useEffect(() => {
    if (editingEvent) {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [editingEvent]);

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

  async function computePaidParticipantIds(
    supabase: ReturnType<typeof createClient>,
    effectiveTeamId: string,
    effectiveTargetTeamIds: string[] | null
  ): Promise<string[]> {
    if (effectiveTeamId) {
      const { data: rosterRows } = await supabase
        .from("team_players")
        .select("player_id")
        .eq("team_id", effectiveTeamId);
      return (rosterRows ?? []).map((r) => r.player_id);
    }
    if (effectiveTargetTeamIds && effectiveTargetTeamIds.length > 0) {
      const { data: rosterRows } = await supabase
        .from("team_players")
        .select("player_id")
        .in("team_id", effectiveTargetTeamIds);
      return Array.from(new Set((rosterRows ?? []).map((r) => r.player_id)));
    }
    // "Tout le club" : tous les membres actifs (retour de Cindy — un
    // événement payant sans équipe précise, ex. une AG ou un loto, concerne
    // tout le monde).
    const { data: allPlayers } = await supabase.from("players").select("id").is("archived_at", null);
    return (allPlayers ?? []).map((p) => p.id);
  }

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
    const amountNum = Number(paidAmount);
    if (isPaid && (!paidAmount || !Number.isFinite(amountNum) || amountNum <= 0)) {
      setError("Indique un tarif pour un événement payant.");
      return;
    }

    // null = "Tous les groupes" (comportement historique) — seulement
    // rempli quand la portée "Équipes spécifiques" est choisie explicitement.
    const effectiveTeamId = scopeMode === "single" ? teamId : "";
    const effectiveTargetTeamIds = scopeMode === "specific" ? targetTeamIds : null;

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const eventName = title || defaultTitles[eventType];
    const eventPayload: {
      title: string;
      event_type: EventType;
      is_home: boolean | null;
      location: string | null;
      salle: string | null;
      start_time: string;
      end_time: string | null;
      notes: string | null;
      team_id?: string | null;
      target_team_ids?: string[] | null;
    } = {
      title: eventName,
      event_type: eventType,
      is_home: isMatch && isHome !== "" ? isHome === "true" : null,
      location: location || null,
      salle: salle || null,
      start_time: new Date(startTime).toISOString(),
      end_time: endTime ? new Date(`${startTime.slice(0, 10)}T${endTime}`).toISOString() : null,
      notes: notes || null,
    };
    // La portée (équipe/équipes/tout le club) n'est modifiable que par qui
    // peut créer un événement club (allowClubWide) — un coach qui édite un
    // événement d'une portée qu'il ne maîtrise pas ne doit jamais l'écraser
    // silencieusement (même garde-fou que l'ancienne modale de modification).
    if (!isEditing || allowClubWide) {
      eventPayload.team_id = effectiveTeamId || null;
      eventPayload.target_team_ids = effectiveTargetTeamIds;
    }

    const query = isEditing
      ? supabase.from("events").update(eventPayload).eq("id", editingEvent!.id)
      : supabase.from("events").insert(eventPayload);
    const { data: inserted, error } = await query
      .select(
        "id, title, event_type, is_home, location, salle, start_time, end_time, notes, team_id, target_team_ids"
      )
      .single();

    if (error || !inserted) {
      setLoading(false);
      setError(error?.message ?? (isEditing ? "La modification a échoué." : "La création a échoué."));
      return;
    }

    // Événement payant (retour de Cindy du 2026-08-25) : crée ou met à jour
    // la collecte de suivi (Cotisations -> Événements payants) rattachée à
    // cet événement. En modification, si l'événement était déjà payant, on
    // ne touche qu'au tarif/lien — jamais aux participants déjà ajoutés
    // (gérés depuis Cotisations). Si "Événement payant" vient d'être
    // décoché, la collecte est détachée (event_id -> null) plutôt que
    // supprimée : l'historique des paiements déjà enregistrés reste intact.
    let paymentLink: string | null = null;
    let collecteId: string | null = editingEvent?.collecteId ?? null;
    let paidParticipants = editingEvent?.paidParticipants ?? [];
    if (isPaid) {
      paymentLink = paidLink.trim() || null;
      if (collecteId) {
        const { error: updateError } = await supabase
          .from("collectes")
          .update({ name: eventName, prix: amountNum, payment_link: paymentLink })
          .eq("id", collecteId);
        if (updateError) {
          setLoading(false);
          setError(
            `Événement enregistré, mais la mise à jour du suivi de paiement a échoué : ${updateError.message}`
          );
          return;
        }
        // Participants inchangés : cette collecte existait déjà, on ne
        // touche qu'à son tarif/lien.
      } else {
        const { data: collecte, error: collecteError } = await supabase
          .from("collectes")
          .insert({
            name: eventName,
            type: "EVENEMENT",
            prix: amountNum,
            event_id: inserted.id,
            payment_link: paymentLink,
          })
          .select("id")
          .single();

        if (collecteError || !collecte) {
          setLoading(false);
          setError(
            `Événement enregistré, mais la création du suivi de paiement a échoué : ${collecteError?.message ?? "erreur inconnue"}`
          );
          return;
        }
        collecteId = collecte.id;

        const participantIds = await computePaidParticipantIds(
          supabase,
          effectiveTeamId,
          effectiveTargetTeamIds
        );
        if (participantIds.length > 0) {
          const { error: cotisationsError } = await supabase.from("cotisations").insert(
            participantIds.map((playerId) => ({
              player_id: playerId,
              collecte_id: collecte.id,
              saison: eventName,
              prix: amountNum,
              remise: 0,
              paiement: 0,
              statut: null,
            }))
          );
          if (cotisationsError) {
            setLoading(false);
            setError(
              `Événement payant enregistré, mais l'ajout des participants a échoué : ${cotisationsError.message}`
            );
            return;
          }
        }
        // Liste vide ici : les noms des participants arrivent au prochain
        // rafraîchissement temps réel (cotisations/collectes sont
        // surveillées, voir realtime-sync.tsx).
        paidParticipants = [];
      }
    } else if (editingEvent?.collecteId) {
      const { error: detachError } = await supabase
        .from("collectes")
        .update({ event_id: null })
        .eq("id", editingEvent.collecteId);
      if (detachError) {
        setLoading(false);
        setError(
          `Événement enregistré, mais le détachement du suivi de paiement a échoué : ${detachError.message}`
        );
        return;
      }
      collecteId = null;
      paidParticipants = [];
    }

    setLoading(false);

    // Bonus, pas bloquant : voir event-push.ts. En modification, seul un
    // vrai changement d'horaire ou de lieu justifie de déranger les
    // familles — pas une note ou un titre corrigé (même règle que
    // l'ancienne modale). Tolérance d'une minute sur l'heure pour ignorer
    // un arrondi de saisie sans rapport avec un vrai déplacement.
    const when = new Date(inserted.start_time).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const heure = new Date(inserted.start_time).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const lieu = salle || location;
    if (isEditing && editingEvent) {
      const timeMoved =
        Math.abs(new Date(inserted.start_time).getTime() - new Date(editingEvent.start_time).getTime()) >
        60000;
      const placeMoved =
        (location || "") !== (editingEvent.location ?? "") || (salle || "") !== (editingEvent.salle ?? "");
      if (timeMoved || placeMoved) {
        sendEventPush(
          inserted.id,
          `UBAC — ${editingEvent.teamName}`,
          `Changement : ${when} à ${heure}${lieu ? ` · ${lieu}` : ""}.`
        );
      }
    } else {
      const team = teams.find((t) => t.id === effectiveTeamId);
      const label = typeChoices.find((c) => c.value === eventType)?.label ?? "Événement";
      sendEventPush(
        inserted.id,
        `UBAC — ${team ? teamLabel(team) : "Tous les groupes"}`,
        `Nouveau : ${label}, ${when} à ${heure}${lieu ? ` · ${lieu}` : ""}.`
      );
    }

    // Affichage immédiat sur le calendrier (voir le commentaire sur
    // onCreated/onUpdated plus haut) : construit ici plutôt qu'attendu du
    // serveur — corrigé silencieusement par le prochain rafraîchissement
    // temps réel si besoin.
    const teamName = resolveTeamNameClient(inserted.team_id, inserted.target_team_ids, teams);
    if (isEditing && editingEvent) {
      onUpdated?.({
        ...editingEvent,
        title: inserted.title,
        event_type: inserted.event_type,
        isHome: inserted.is_home,
        location: inserted.location,
        salle: inserted.salle,
        start_time: inserted.start_time,
        end_time: inserted.end_time,
        notes: inserted.notes,
        isPaid,
        collecteId,
        paidAmount: isPaid ? amountNum : null,
        paymentLink,
        paidParticipants,
        teamId: inserted.team_id,
        targetTeamIds: inserted.target_team_ids,
        teamName,
      });
    } else {
      onCreated?.([
        {
          id: inserted.id,
          title: inserted.title,
          event_type: inserted.event_type,
          isHome: inserted.is_home,
          attendanceRequestedAt: null,
          teamScore: null,
          opponentScore: null,
          location: inserted.location,
          salle: inserted.salle,
          start_time: inserted.start_time,
          end_time: inserted.end_time,
          notes: inserted.notes,
          isPaid,
          collecteId,
          paidAmount: isPaid ? amountNum : null,
          paymentLink,
          paidParticipants,
          teamId: inserted.team_id,
          targetTeamIds: inserted.target_team_ids,
          teamName,
          rsvpCounts: { present: 0, absent: 0, late: 0, pending: 0 },
        },
      ]);
    }

    // Besoins d'organisation chiffrés dès la création (jamais en édition,
    // voir le commentaire sur draftNeeds plus haut). Best-effort : une
    // erreur ici ne doit pas faire croire que l'événement lui-même n'a pas
    // été créé, il l'a bien été.
    const validNeeds = draftNeeds
      .map((n, i) => ({
        roleCode: n.roleCode,
        customLabel: n.roleCode === CUSTOM_ROLE_CODE ? n.customLabel.trim() : null,
        count: Number(n.count) || 0,
        sortOrder: i,
      }))
      .filter((n) => n.count > 0);
    if (!isEditing && validNeeds.length > 0) {
      const { error: needsError } = await supabase.from("event_volunteer_needs").insert(
        validNeeds.map((n) => ({
          event_id: inserted.id,
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
        return;
      }
    }

    resetFields();
    onClose();
    // Pas de router.refresh() explicite : events/event_volunteer_needs/
    // cotisations/collectes sont surveillées en temps réel
    // (realtime-sync.tsx) — le garder ici en plus rechargeait la page deux
    // fois pour une seule création/modification (retour de Cindy du
    // 2026-08-20, même correctif que partout ailleurs dans ce chantier).
  }

  if (!open) return null;

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm"
    >
      <h3 className="font-semibold text-zinc-900">
        {isEditing ? "Modifier l'événement" : "Créer un événement"}
      </h3>

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
              onClick={() => {
                setScopeMode(c.value);
                // Un événement jusque-là "Tout le club" ou "Équipes
                // spécifiques" n'a pas d'équipe unique en mémoire :
                // préremplir la première plutôt que de laisser le menu
                // vide au passage sur "Une équipe".
                if (c.value === "single" && !teamId) {
                  setTeamId(teams[0]?.id ?? "");
                }
              }}
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

      {/* Retour de Cindy du 2026-08-25 : remplace "Répéter chaque semaine"
          (voir le commentaire sur isPaid plus haut). */}
      <div className="flex flex-col gap-2 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <input
            type="checkbox"
            checked={isPaid}
            onChange={(e) => setIsPaid(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-navy focus:ring-navy"
          />
          Événement payant
        </label>
        {isPaid && (
          <div className="flex flex-col gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Tarif (€) *
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                required={isPaid}
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Lien HelloAsso (optionnel)
              </label>
              <input
                type="url"
                placeholder="https://www.helloasso.com/..."
                value={paidLink}
                onChange={(e) => setPaidLink(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
            <p className="text-[11px] text-zinc-400">
              {isEditing && editingEvent?.collecteId
                ? "Le tarif et le lien sont mis à jour sur le suivi de paiement existant (Cotisations → Événements payants) — les participants déjà ajoutés ne sont pas modifiés."
                : "Crée automatiquement un suivi de paiement dans Cotisations → Événements payants, avec les familles concernées déjà ajoutées d'après l'équipe (ou les équipes) choisie ci-dessus."}
              {" "}Le lien, s&apos;il est renseigné, s&apos;affiche directement sur la
              carte de l&apos;événement pour que chaque famille paie
              elle-même.
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
          toute façon ajoutables/modifiables après coup. Jamais en édition
          (voir le commentaire sur draftNeeds plus haut) — VolunteerNeedsPanel,
          sur la carte, reste le seul endroit pour gérer les besoins déjà
          existants. */}
      {!isEditing && (
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
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-ubac-yellow px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
        >
          {loading
            ? isEditing
              ? "Enregistrement..."
              : "Création..."
            : isEditing
              ? "Enregistrer"
              : "Créer"}
        </button>
        <button
          type="button"
          onClick={() => {
            resetFields();
            onClose();
          }}
          className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
