"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { teamLabel } from "@/lib/teams";
import { SALLES } from "./salles";
import { sendEventPush } from "./event-push";
import DateTimePicker from "./date-time-picker";
import RoleIcon from "./role-icon";
import CommissionMultiSelect from "./commission-multi-select";
import { CalendarSync, Plus, X } from "lucide-react";
import {
  CUSTOM_ROLE_CODE,
  STANDARD_VOLUNTEER_ROLES,
  volunteerRoleIcon,
  type VolunteerNeed,
} from "./event-volunteer-needs";
import { useToast } from "./toast-context";
import { getCurrentSeasonStartYear } from "@/lib/season";
import type { AdminBenevole, AdminUpcomingEvent } from "./page";

// Retour de Cindy du 12/09 ("jusqu'à la fin de la saison") : même notion
// de saison que le reste de l'appli (lib/season.ts, bascule au 1er
// juillet) -- jamais une deuxième définition de "saison" ici.
function endOfCurrentSeasonDate(referenceDate: Date): string {
  const startYear = getCurrentSeasonStartYear(referenceDate);
  return `${startYear + 1}-06-30`;
}

// Retour de Cindy du 12/09 ("Répéter") : renvoie une "YYYY-MM-DDTHH:mm"
// (même format que startTime) par occurrence, la première incluse -- même
// heure que le départ à chaque fois, seule la date avance. Toujours en
// heure locale (jamais via toISOString(), qui ferait glisser la date
// selon le fuseau) — même principe que toDatetimeLocal/toTimeLocal plus
// haut. Plafonné à 200 occurrences : un garde-fou, pas une limite pensée
// pour être atteinte (une saison complète hebdomadaire en fait ~40).
function generateRecurrenceDateTimes(
  startDateTimeLocal: string,
  frequency: "weekly" | "biweekly" | "monthly",
  untilDateLocal: string
): string[] {
  const m = startDateTimeLocal.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m || !untilDateLocal) return [];
  const [, y, mo, d, h, min] = m;
  const hour = Number(h);
  const minute = Number(min);
  const until = new Date(`${untilDateLocal}T23:59`);
  let current = new Date(Number(y), Number(mo) - 1, Number(d), hour, minute);
  const pad = (n: number) => String(n).padStart(2, "0");
  const results: string[] = [];
  let safety = 0;
  while (current <= until && safety < 200) {
    results.push(
      `${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(current.getDate())}T${pad(current.getHours())}:${pad(current.getMinutes())}`
    );
    if (frequency === "weekly") {
      current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 7, hour, minute);
    } else if (frequency === "biweekly") {
      current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 14, hour, minute);
    } else {
      current = new Date(current.getFullYear(), current.getMonth() + 1, current.getDate(), hour, minute);
    }
    safety += 1;
  }
  return results;
}

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
  benevoles = [],
  commissionGroups = [],
  existingNeeds = [],
  allowClubWide = false,
  open,
  editingEvent,
  onClose,
  onCreated,
  onUpdated,
}: {
  teams: Team[];
  // Rempli côté Bureau ET Coach depuis le 06/09 (retour de Cindy : "pour
  // tous ceux qui peuvent modifier un événement ou en créer un") — voir le
  // commentaire sur la section "Bénévoles invités" plus bas.
  benevoles?: AdminBenevole[];
  // Retour de Cindy du 10/09 ("Accès Commissions & Administration", puis
  // "un seul choix pour l'événement entier") : transmis à
  // CommissionMultiSelect, un seul sélecteur pour tout l'événement (voir
  // commissionGroupIds plus bas) — même liste que VolunteerNeedsPanel.
  commissionGroups?: { id: string; name: string }[];
  // Retour de Cindy du 10/09 ("recharge et affiche correctement les
  // besoins d'organisation existants") : les besoins déjà en base pour
  // editingEvent (vide en création) — l'appelant (calendar-view.tsx) les a
  // déjà, via volunteerNeedsByEventId, jamais recalculés ici.
  existingNeeds?: VolunteerNeed[];
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
  // Retour de Cindy du 09/09 ("confirmations visuelles immédiates après
  // chaque action clé") : jusqu'ici, la modale se refermait simplement
  // sans aucun accusé de réception -- voir handleSubmit, juste avant
  // onClose(), pour l'unique point de sortie qui correspond à un succès
  // complet (chaque échec partiel plus haut affiche déjà sa propre
  // erreur via setError et garde le formulaire ouvert).
  const { showToast } = useToast();

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
  // Retour de Cindy du 12/09 ("heure d'impact") : heure à laquelle les
  // participants doivent être arrivés/prêts, avant le début officiel (ex.
  // 45 min avant un match à 16h) -- même principe que endTime ci-dessus,
  // une simple heure combinée à la date de startTime, jamais une date
  // séparée à saisir. impactMinutesBefore n'est qu'un raccourci UI
  // (calcule impactTime à partir de startTime) : la valeur réellement
  // envoyée en base reste toujours l'heure absolue impactTime, jamais un
  // delta -- si startTime change après coup, un delta figé aurait
  // silencieusement décalé l'heure d'impact sans que personne s'en rende
  // compte.
  const [impactTime, setImpactTime] = useState(() =>
    editingEvent?.impactTime ? toTimeLocal(editingEvent.impactTime) : ""
  );
  // Retour de Cindy du 12/09 (revue du champ) : "15 min avant le début" par
  // défaut plutôt qu'un menu vide sur "Raccourci..." -- le cas le plus
  // fréquent s'affiche déjà prêt, à changer seulement si besoin (voir
  // handleStartTimeChange plus bas, qui recalcule impactTime quand le
  // début change tant que ce raccourci reste actif). En édition, retrouve
  // le raccourci déjà utilisé si l'écart correspond exactement à l'un
  // d'eux, sinon retombe sur 15 min sans toucher à l'heure déjà enregistrée
  // (impactTime ci-dessus, seule valeur réellement envoyée en base).
  const [impactMinutesBefore, setImpactMinutesBefore] = useState(() => {
    if (editingEvent?.impactTime) {
      const diffMinutes = Math.round(
        (new Date(editingEvent.start_time).getTime() - new Date(editingEvent.impactTime).getTime()) /
          60000
      );
      if ([15, 30, 45, 60].includes(diffMinutes)) return String(diffMinutes);
    }
    return "15";
  });
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
  // Retour de Cindy du 12/09 ("Répéter") : uniquement à la création --
  // repeatOpen reste toujours false en édition (voir le bouton plus bas,
  // masqué si isEditing), une occurrence déjà en base ne peut jamais
  // elle-même redevenir le point de départ d'une nouvelle série. Chaque
  // occurrence générée reste une ligne indépendante (jamais une règle de
  // récurrence virtuelle) -- seriesId (généré une fois, voir handleSubmit)
  // est le seul lien entre elles, pour "cette occurrence uniquement" vs
  // "cette occurrence et les suivantes" à la modification/suppression
  // (calendar-view.tsx).
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [repeatFrequency, setRepeatFrequency] = useState<"weekly" | "biweekly" | "monthly">("weekly");
  const [repeatUntil, setRepeatUntil] = useState("");
  // Besoins d'organisation (buvette, table de marque...) : une liste libre
  // de lignes rôle + effectif, comme dans le formulaire "+ Ajouter un
  // besoin" de la carte événement. Retour de Cindy du 10/09 ("en rouvrant
  // Modifier l'événement, la section a disparu... impossible de les
  // consulter, modifier ou supprimer") : ce champ ne se contentait avant
  // que d'ajouter, jamais en édition -- pré-rempli maintenant depuis
  // existingNeeds (id réel = une ligne déjà en base) dans les deux cas, la
  // sauvegarde (handleSubmit) calculant le diff création/mise à
  // jour/suppression. VolunteerNeedsPanel, sur la carte de l'événement,
  // reste un deuxième endroit possible pour gérer les mêmes besoins --
  // les deux lisent/écrivent la même table.
  const [draftNeeds, setDraftNeeds] = useState<
    {
      // Identifiant React (clé de liste), jamais envoyé à la base -- id
      // ci-dessous, lui, distingue une ligne déjà en base (à mettre à jour)
      // d'une ligne nouvelle (à créer).
      key: string;
      id: string | null;
      roleCode: string;
      customLabel: string;
      count: string;
    }[]
  >(() =>
    existingNeeds.map((n) => ({
      key: n.id,
      id: n.id,
      roleCode: n.roleCode,
      customLabel: n.customLabel ?? "",
      count: String(n.requiredCount),
    }))
  );
  // Retour de Cindy du 10/09 ("l'onglet commission apparaît à chaque
  // besoin créé, pas la peine, les groupes commissions concernés seront
  // informés de tous les besoins créés") : un seul choix pour l'événement
  // ENTIER (pas par besoin) -- tous les besoins d'organisation de cet
  // événement, quel que soit le moment où ils sont ajoutés (ici ou depuis
  // VolunteerNeedsPanel sur la carte), remontent sur la page publique de
  // CES commissions. Porté par events.commission_group_ids, plus du tout
  // par event_volunteer_needs.
  const [commissionGroupIds, setCommissionGroupIds] = useState<string[]>(
    () => editingEvent?.commissionGroupIds ?? []
  );
  // Bénévoles invités à cet événement (retour de Cindy du 2026-08-25) :
  // contrairement à draftNeeds, modifiable en édition comme à la création —
  // le Bureau doit pouvoir ajouter/retirer un bénévole après coup. Diff
  // calculé contre editingEvent?.benevoleIds au moment de l'enregistrement,
  // voir handleSubmit plus bas.
  const [selectedBenevoleIds, setSelectedBenevoleIds] = useState<string[]>(
    () => editingEvent?.benevoleIds ?? []
  );
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
    setSelectedBenevoleIds([]);
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
      {
        key: `new-${Date.now()}-${rows.length}`,
        id: null,
        roleCode: STANDARD_VOLUNTEER_ROLES[0].code,
        customLabel: "",
        count: "1",
      },
    ]);
  }

  function removeDraftNeed(key: string) {
    setDraftNeeds((rows) => rows.filter((r) => r.key !== key));
  }

  function updateDraftNeed(
    key: string,
    patch: Partial<{ roleCode: string; customLabel: string; count: string }>
  ) {
    setDraftNeeds((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function toggleTargetTeam(id: string) {
    setTargetTeamIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function toggleBenevole(id: string) {
    setSelectedBenevoleIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
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

  // Retour de Cindy du 12/09 (revue du champ "Heure d'impact") : tant que
  // le raccourci "X min avant" est actif (impactMinutesBefore non vide,
  // valeur par défaut "15" ci-dessus), l'heure d'arrivée suit le début
  // choisi -- sans ça, "15 min avant le début" par défaut resterait vide
  // jusqu'à ce que l'utilisateur retouche le menu après avoir choisi
  // l'heure. Dès qu'une heure est tapée directement dans le champ heure
  // d'arrivée, impactMinutesBefore repasse à "" (voir son onChange) et ce
  // recalcul automatique s'arrête pour cet événement.
  function handleStartTimeChange(value: string) {
    setStartTime(value);
    if (!impactMinutesBefore || !value) return;
    const start = new Date(value);
    start.setMinutes(start.getMinutes() - Number(impactMinutesBefore));
    const pad = (n: number) => String(n).padStart(2, "0");
    setImpactTime(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
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
    // Retour de Cindy du 12/09 ("Répéter") : mutuellement exclusif avec
    // "Événement payant" -- une série ne prend en charge que les champs de
    // base, jamais la collecte/les participants qui vont avec (voir plus
    // bas). Plutôt qu'ignorer isPaid en silence pour les occurrences
    // générées, on bloque tout de suite pour que ce ne soit jamais une
    // surprise.
    if (repeatOpen && isPaid) {
      setError("Un événement répété ne peut pas être payant pour l'instant — décoche l'un des deux.");
      return;
    }
    if (repeatOpen && !repeatUntil) {
      setError("Choisis une date de fin pour la répétition.");
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

    // Retour de Cindy du 12/09 ("Répéter") : chemin séparé du insert/update
    // simple plus bas -- chaque occurrence reste une ligne indépendante en
    // base (jamais une règle de récurrence virtuelle), seriesId (généré
    // une fois ici) est le seul lien entre elles. Uniquement à la
    // création : repeatOpen reste toujours false en édition (bouton
    // masqué, voir le JSX plus bas). Une série ne prend en charge que les
    // champs de base (équipe, type, horaires, heure d'impact, lieu,
    // notes) -- besoins d'organisation/bénévoles invités/paiement restent
    // à ajouter occurrence par occurrence après coup via "Modifier
    // l'événement", qui les gère déjà un par un.
    if (repeatOpen && !isEditing) {
      const occurrences = generateRecurrenceDateTimes(startTime, repeatFrequency, repeatUntil);
      if (occurrences.length === 0) {
        setLoading(false);
        setError("La date de fin de répétition doit être après la date de début.");
        return;
      }

      // Conflit (retour de Cindy du 12/09, "ignorer cette date") :
      // n'exclut que les occurrences qui tombent exactement sur un
      // événement déjà existant pour la MÊME équipe -- seulement vérifié
      // pour une portée à équipe unique (scopeMode "single"), la seule où
      // "même équipe" a un sens univoque (une portée "spécifique"/"club"
      // n'a pas d'équipe de référence à comparer).
      let conflictingStarts = new Set<string>();
      if (effectiveTeamId) {
        const startIsos = occurrences.map((dt) => new Date(dt).toISOString());
        const { data: existingRows } = await supabase
          .from("events")
          .select("start_time")
          .eq("team_id", effectiveTeamId)
          .in("start_time", startIsos);
        conflictingStarts = new Set((existingRows ?? []).map((r) => r.start_time));
      }

      const seriesId = crypto.randomUUID();
      const rows = occurrences
        .map((dt) => ({
          title: eventName,
          event_type: eventType,
          is_home: isMatch && isHome !== "" ? isHome === "true" : null,
          location: location || null,
          salle: salle || null,
          start_time: new Date(dt).toISOString(),
          end_time: endTime ? new Date(`${dt.slice(0, 10)}T${endTime}`).toISOString() : null,
          impact_time: impactTime ? new Date(`${dt.slice(0, 10)}T${impactTime}`).toISOString() : null,
          notes: notes || null,
          commission_group_ids: commissionGroupIds,
          team_id: effectiveTeamId || null,
          target_team_ids: effectiveTargetTeamIds,
          series_id: seriesId,
        }))
        .filter((row) => !conflictingStarts.has(row.start_time));
      const skipped = occurrences.length - rows.length;

      if (rows.length === 0) {
        setLoading(false);
        setError("Toutes les dates générées existent déjà pour cette équipe, rien à créer.");
        return;
      }

      const { data: insertedRows, error: insertError } = await supabase
        .from("events")
        .insert(rows)
        .select(
          "id, title, event_type, is_home, location, salle, start_time, end_time, impact_time, series_id, notes, team_id, target_team_ids"
        );

      setLoading(false);
      if (insertError || !insertedRows) {
        setError(insertError?.message ?? "La création de la série a échoué.");
        return;
      }

      const teamName = resolveTeamNameClient(effectiveTeamId || null, effectiveTargetTeamIds, teams);
      onCreated?.(
        insertedRows.map((row) => ({
          id: row.id,
          title: row.title,
          event_type: row.event_type,
          isHome: row.is_home,
          attendanceRequestedAt: null,
          teamScore: null,
          opponentScore: null,
          location: row.location,
          salle: row.salle,
          start_time: row.start_time,
          end_time: row.end_time,
          impactTime: row.impact_time,
          seriesId: row.series_id,
          notes: row.notes,
          isPaid: false,
          collecteId: null,
          paidAmount: null,
          paymentLink: null,
          paidParticipants: [],
          teamId: row.team_id,
          targetTeamIds: row.target_team_ids,
          teamName,
          commissionGroupIds,
          rsvpCounts: { present: 0, absent: 0, late: 0, pending: 0 },
          benevoleIds: [],
          benevoleInvites: [],
        }))
      );

      showToast(
        skipped > 0
          ? `${rows.length} occurrences créées (${skipped} déjà existante${skipped > 1 ? "s" : ""}, ignorée${skipped > 1 ? "s" : ""}).`
          : `${rows.length} occurrences créées.`
      );
      resetFields();
      onClose();
      return;
    }

    const eventPayload: {
      title: string;
      event_type: EventType;
      is_home: boolean | null;
      location: string | null;
      salle: string | null;
      start_time: string;
      end_time: string | null;
      impact_time: string | null;
      notes: string | null;
      team_id?: string | null;
      target_team_ids?: string[] | null;
      commission_group_ids: string[];
    } = {
      title: eventName,
      event_type: eventType,
      is_home: isMatch && isHome !== "" ? isHome === "true" : null,
      location: location || null,
      salle: salle || null,
      start_time: new Date(startTime).toISOString(),
      end_time: endTime ? new Date(`${startTime.slice(0, 10)}T${endTime}`).toISOString() : null,
      // Retour de Cindy du 12/09 ("heure d'impact") : même date que
      // startTime, comme endTime ci-dessus -- toujours l'heure absolue
      // envoyée, jamais un delta (voir impactMinutesBefore, purement un
      // raccourci de saisie côté UI).
      impact_time: impactTime ? new Date(`${startTime.slice(0, 10)}T${impactTime}`).toISOString() : null,
      notes: notes || null,
      // Retour de Cindy du 10/09 : un seul choix pour l'événement entier
      // (voir commissionGroupIds plus haut) -- toujours envoyé, en création
      // comme en édition, aucune restriction par rôle contrairement à
      // team_id/target_team_ids plus bas (ça ne change jamais la portée de
      // l'événement, juste qui est informé des besoins d'organisation).
      commission_group_ids: commissionGroupIds,
    };
    // La portée club-wide/équipes spécifiques n'est modifiable que par qui
    // peut créer un événement club (allowClubWide) — un coach n'a même pas
    // le sélecteur de portée dans son formulaire (voir plus bas, "allowClubWide
    // &&"), donc scopeMode reste figé à sa valeur initiale pour lui : jamais
    // question d'écraser silencieusement une portée club/multi-équipes qu'il
    // ne maîtrise pas.
    //
    // Mais retour de Cindy du 10/09 ("un coach doit pouvoir modifier les
    // événements de son équipe, c'est une règle de base") : Basile ne
    // pouvait pas re-affecter un entraînement de U13M1 à U13M alors qu'il
    // coache les deux -- le menu équipe (plus bas, affiché dès qu'un coach a
    // plusieurs équipes) restait modifiable à l'écran, "Événement modifié."
    // s'affichait, mais team_id n'était jamais envoyé. Un événement DÉJÀ à
    // équipe unique (scopeMode "single" dès l'ouverture) peut être
    // réaffecté sans risque : le menu ne liste que `teams`, déjà limité aux
    // équipes que CE coach coache lui-même, et la policy RLS
    // "coach update own team events" revérifie de toute façon que la
    // nouvelle équipe choisie est bien une des siennes.
    if (!isEditing || allowClubWide || scopeMode === "single") {
      eventPayload.team_id = effectiveTeamId || null;
      eventPayload.target_team_ids = effectiveTargetTeamIds;
    }

    const query = isEditing
      ? supabase.from("events").update(eventPayload).eq("id", editingEvent!.id)
      : supabase.from("events").insert(eventPayload);
    const { data: inserted, error } = await query
      .select(
        "id, title, event_type, is_home, location, salle, start_time, end_time, impact_time, series_id, notes, team_id, target_team_ids"
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
          .update({
            name: eventName,
            prix: amountNum,
            payment_link: paymentLink,
            // Tenu à jour tant que l'événement existe encore (ex. date
            // déplacée) — voir event_date plus bas pour pourquoi il ne
            // faut jamais lire cette date uniquement via la jointure vers
            // events.
            event_date: inserted.start_time,
          })
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
            // Instantané indépendant de la jointure collecte -> événement
            // (retour de Cindy du 29/08, "j'aimerai voir la date... quand
            // a til lieu ?") : event_id passe à null si l'événement est
            // supprimé ou "Événement payant" décoché en modification (voir
            // plus bas), sans jamais supprimer la collecte elle-même — sans
            // cet instantané, la date de l'événement devenait irrécupérable
            // pile au moment où elle devient utile (une collecte orpheline
            // qu'on essaie de retrouver/comprendre).
            event_date: inserted.start_time,
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
    // Retour de Cindy du 06/09 ("vision des bénévoles qui ont répondu
    // présent") : affichage optimiste construit ici, comme le reste de ce
    // patch -- garde le statut déjà connu pour un bénévole déjà invité
    // (editingEvent.benevoleInvites), "PENDING" par défaut pour un
    // nouvellement ajouté (il n'a pas encore pu répondre).
    const previousInvitesById = new Map(
      (editingEvent?.benevoleInvites ?? []).map((inv) => [inv.id, inv])
    );
    const optimisticBenevoleInvites = selectedBenevoleIds.map((id) => {
      const previous = previousInvitesById.get(id);
      if (previous) return previous;
      const b = benevoles.find((x) => x.id === id);
      return {
        id,
        firstName: b?.firstName ?? "",
        lastName: b?.lastName ?? "",
        status: "PENDING" as const,
      };
    });
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
        impactTime: inserted.impact_time,
        seriesId: inserted.series_id,
        notes: inserted.notes,
        isPaid,
        collecteId,
        paidAmount: isPaid ? amountNum : null,
        paymentLink,
        paidParticipants,
        teamId: inserted.team_id,
        targetTeamIds: inserted.target_team_ids,
        teamName,
        commissionGroupIds,
        benevoleIds: selectedBenevoleIds,
        benevoleInvites: optimisticBenevoleInvites,
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
          impactTime: inserted.impact_time,
          seriesId: inserted.series_id,
          notes: inserted.notes,
          isPaid,
          collecteId,
          paidAmount: isPaid ? amountNum : null,
          paymentLink,
          paidParticipants,
          teamId: inserted.team_id,
          targetTeamIds: inserted.target_team_ids,
          teamName,
          commissionGroupIds,
          rsvpCounts: { present: 0, absent: 0, late: 0, pending: 0 },
          benevoleIds: selectedBenevoleIds,
          benevoleInvites: optimisticBenevoleInvites,
        },
      ]);
    }

    // Besoins d'organisation : retour de Cindy du 10/09 ("en rouvrant
    // Modifier l'événement, la section... a disparu... impossible de les
    // consulter, modifier ou supprimer") -- ce bloc gérait jusqu'ici
    // uniquement la création (insert brut, jamais en édition). Diff contre
    // les besoins déjà existants (existingNeeds, chargés par l'appelant
    // depuis volunteerNeedsByEventId) désormais dans les deux cas, même
    // principe que selectedBenevoleIds juste en dessous : id présent -> une
    // ligne déjà en base, à mettre à jour ou laisser telle quelle ; id
    // absent (retiré du formulaire) -> à supprimer ; ligne sans id -> à
    // créer. Best-effort : une erreur ici ne doit pas faire croire que
    // l'événement lui-même n'a pas été créé/modifié, il l'a bien été.
    const validDraftNeeds = draftNeeds
      .map((n, i) => ({
        id: n.id,
        roleCode: n.roleCode,
        customLabel: n.roleCode === CUSTOM_ROLE_CODE ? n.customLabel.trim() : null,
        count: Number(n.count) || 0,
        sortOrder: i,
      }))
      .filter((n) => n.count > 0);
    const needsToInsert = validDraftNeeds.filter((n) => n.id === null);
    const validDraftNeedIds = new Set(validDraftNeeds.map((n) => n.id).filter((id): id is string => id !== null));
    const needsToDelete = existingNeeds
      .map((n) => n.id)
      .filter((id) => !validDraftNeedIds.has(id));
    // Une ligne existante changée (rôle/nom/effectif/ordre) — comparaison
    // simple champ à champ, jamais réécrite si rien n'a changé.
    const needsToUpdate = validDraftNeeds.filter((n) => {
      if (n.id === null) return false;
      const original = existingNeeds.find((e) => e.id === n.id);
      if (!original) return false;
      return (
        original.roleCode !== n.roleCode ||
        (original.customLabel ?? "") !== (n.customLabel ?? "") ||
        original.requiredCount !== n.count
      );
    });

    if (needsToDelete.length > 0) {
      const { error: deleteNeedsError } = await supabase
        .from("event_volunteer_needs")
        .delete()
        .in("id", needsToDelete);
      if (deleteNeedsError) {
        setError(
          `Événement enregistré, mais la suppression d'un besoin d'organisation a échoué : ${deleteNeedsError.message}`
        );
        return;
      }
    }
    for (const n of needsToUpdate) {
      const { error: updateNeedError } = await supabase
        .from("event_volunteer_needs")
        .update({
          role_code: n.roleCode,
          custom_label: n.customLabel,
          required_count: n.count,
          sort_order: n.sortOrder,
        })
        .eq("id", n.id);
      if (updateNeedError) {
        setError(
          `Événement enregistré, mais la mise à jour d'un besoin d'organisation a échoué : ${updateNeedError.message}`
        );
        return;
      }
    }
    if (needsToInsert.length > 0) {
      const { error: needsError } = await supabase.from("event_volunteer_needs").insert(
        needsToInsert.map((n) => ({
          event_id: inserted.id,
          role_code: n.roleCode,
          custom_label: n.customLabel,
          required_count: n.count,
          sort_order: n.sortOrder,
        }))
      );
      if (needsError) {
        // On garde le formulaire ouvert : fermer maintenant masquerait ce
        // message alors que l'événement, lui, a bien été créé/modifié.
        setError(
          `Événement enregistré, mais l'ajout d'un besoin d'organisation a échoué : ${needsError.message}`
        );
        return;
      }
    }

    // Bénévoles invités : modifiable en édition (contrairement à
    // draftNeeds ci-dessus), donc calculé en diff contre la liste déjà
    // invitée plutôt qu'en simple insert. Bureau ET coach depuis le 06/09
    // (retour de Cindy) — la RLS sur event_benevole_invites (Bureau ou
    // is_team_coach(e.team_id)) tranche qui peut réellement écrire, pas ce
    // code : un coach qui verrait ce formulaire pour un événement qu'il ne
    // gère pas se ferait simplement refuser l'écriture. Best-effort, comme
    // les besoins d'organisation : une erreur ici ne doit pas laisser
    // croire que l'événement n'a pas été créé/modifié.
    {
      const previousBenevoleIds = editingEvent?.benevoleIds ?? [];
      const toAdd = selectedBenevoleIds.filter((id) => !previousBenevoleIds.includes(id));
      const toRemove = previousBenevoleIds.filter((id) => !selectedBenevoleIds.includes(id));
      if (toAdd.length > 0) {
        const { error: inviteError } = await supabase
          .from("event_benevole_invites")
          .insert(toAdd.map((benevoleId) => ({ event_id: inserted.id, benevole_id: benevoleId })));
        if (inviteError) {
          setError(
            `Événement enregistré, mais l'invitation des bénévoles a échoué : ${inviteError.message}`
          );
          return;
        }
        // Retour de Cindy du 06/09 ("ajouter aux bénévoles les
        // notifications... quand un événement les concerne") : best-effort,
        // jamais bloquant (même principe que member-notifications.ts) --
        // rate ces alertes ne doit jamais faire croire que l'invitation
        // elle-même a échoué, elle a bien été enregistrée juste au-dessus.
        const { error: notifyError } = await supabase.from("notifications").insert(
          toAdd.map((benevoleId) => ({
            benevole_id: benevoleId,
            event_id: inserted.id,
            title: "Tu es invité(e) à un événement",
            body: `${inserted.title ?? "Événement"} — ${new Date(inserted.start_time).toLocaleDateString(
              "fr-FR",
              { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }
            )}`,
          }))
        );
        if (notifyError) {
          console.error("[create-event-form] notification bénévole échouée:", notifyError);
        }
      }
      if (toRemove.length > 0) {
        const { error: uninviteError } = await supabase
          .from("event_benevole_invites")
          .delete()
          .eq("event_id", inserted.id)
          .in("benevole_id", toRemove);
        if (uninviteError) {
          setError(
            `Événement enregistré, mais le retrait de certains bénévoles a échoué : ${uninviteError.message}`
          );
          return;
        }
      }
    }

    showToast(isEditing ? "Événement modifié." : "Événement créé.");
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
          <DateTimePicker value={startTime} onChange={handleStartTimeChange} />
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

      {/* Retour de Cindy du 12/09 ("heure d'impact") : optionnel, jamais
          requis quel que soit le type d'événement -- pertinent surtout
          pour un match, mais rien n'empêche un entraînement d'en avoir
          une aussi. Le menu "X min avant" ne fait que préremplir le champ
          heure ci-contre : la valeur réellement envoyée reste toujours
          cette heure absolue (impactTime), jamais un delta -- une saisie
          directe dans le champ heure garde donc la main, sans jamais être
          recalculée en silence si startTime change ensuite. */}
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">
          Heure d&apos;arrivée (optionnel)
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={impactMinutesBefore}
            onChange={(e) => {
              const minutes = e.target.value;
              setImpactMinutesBefore(minutes);
              if (!minutes || !startTime) return;
              const start = new Date(startTime);
              start.setMinutes(start.getMinutes() - Number(minutes));
              const pad = (n: number) => String(n).padStart(2, "0");
              setImpactTime(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
            }}
            className="rounded-lg border border-zinc-200 px-2 py-2 text-sm text-zinc-600"
          >
            <option value="15">15 min avant le début</option>
            <option value="30">30 min avant le début</option>
            <option value="45">45 min avant le début</option>
            <option value="60">1h avant le début</option>
          </select>
          <input
            type="time"
            value={impactTime}
            onChange={(e) => {
              setImpactTime(e.target.value);
              setImpactMinutesBefore("");
            }}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
          {impactTime && (
            <button
              type="button"
              onClick={() => {
                setImpactTime("");
                setImpactMinutesBefore("");
              }}
              className="text-xs text-zinc-400 hover:text-zinc-600 hover:underline"
            >
              Effacer
            </button>
          )}
        </div>
      </div>

      {/* Retour de Cindy du 12/09 ("Répéter") : uniquement à la création
          (jamais en édition, voir !isEditing) -- une occurrence déjà en
          base ne redevient pas le point de départ d'une nouvelle série.
          Mutuellement exclusif avec "Événement payant" juste en dessous
          (voir la validation dans handleSubmit) : une série ne prend en
          charge que les champs de base pour l'instant. */}
      {!isEditing && (
        <div className="flex flex-col gap-2 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <input
              type="checkbox"
              checked={repeatOpen}
              onChange={(e) => setRepeatOpen(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-navy focus:ring-navy"
            />
            <CalendarSync className="h-4 w-4 shrink-0 text-navy" />
            Répéter cet événement
          </label>
          {repeatOpen && (
            <div className="flex flex-col gap-2 pl-6">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { value: "weekly", label: "Toutes les semaines" },
                    { value: "biweekly", label: "Toutes les 2 semaines" },
                    { value: "monthly", label: "Tous les mois" },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setRepeatFrequency(f.value)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      repeatFrequency === f.value
                        ? "border-navy bg-navy text-white"
                        : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-medium text-zinc-600">Jusqu&apos;au</label>
                <input
                  type="date"
                  value={repeatUntil}
                  onChange={(e) => setRepeatUntil(e.target.value)}
                  min={startTime.slice(0, 10) || undefined}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() =>
                    setRepeatUntil(endOfCurrentSeasonDate(startTime ? new Date(startTime) : new Date()))
                  }
                  className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                >
                  Jusqu&apos;à la fin de la saison
                </button>
              </div>
              <p className="text-xs text-zinc-400">
                Chaque date créée est un événement indépendant. Besoins, bénévoles et
                paiement s&apos;ajoutent ensuite, date par date, via &quot;Modifier
                l&apos;événement&quot;.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Retour de Cindy du 2026-08-25 : remplace "Répéter chaque semaine"
          (voir le commentaire sur isPaid plus haut). Retour de Cindy du
          12/09 : désactivé pendant que "Répéter" est coché juste au-dessus
          -- une série ne prend pas encore en charge le paiement (voir
          handleSubmit), plutôt que de le laisser cocher pour rien. */}
      <div
        className={`flex flex-col gap-2 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 ${
          repeatOpen ? "opacity-50" : ""
        }`}
      >
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <input
            type="checkbox"
            checked={isPaid}
            disabled={repeatOpen}
            onChange={(e) => setIsPaid(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-navy focus:ring-navy disabled:opacity-60"
          />
          Événement payant{repeatOpen ? " (indisponible pour une série répétée)" : ""}
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

      {/* Même liste standard que sur la carte de l'événement (VolunteerNeedsPanel)
          — les deux lisent/écrivent la même table. Retour de Cindy du 10/09 :
          maintenant pré-rempli avec les besoins déjà en base en édition
          (existingNeeds), modifiables/supprimables ici comme sur la carte. */}
      <div className="flex flex-col gap-2 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-zinc-600">
              Besoins d&apos;organisation (optionnel)
            </p>
            {/* Retour de Cindy du 10/09 (suite) : "l'onglet commission
                apparaît à chaque besoin créé, pas la peine, les groupes
                commissions concernés seront informés de tous les besoins
                créés" -- un seul choix pour l'événement entier, plus par
                besoin (voir commissionGroupIds plus haut). */}
            <CommissionMultiSelect
              commissions={commissionGroups}
              selectedIds={commissionGroupIds}
              onChange={setCommissionGroupIds}
            />
          </div>
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

      {/* Bénévoles invités (retour de Cindy du 2026-08-25 : "le bureau
          devrait... pouvoir selectionner ses membres, pour que ces meme
          membres voient l'evenement avec les besoins", étendu au coach le
          06/09) — Bureau ET coach, seulement s'il existe des bénévoles
          enregistrés (benevoles vide par défaut partout ailleurs, voir
          calendar-view.tsx). */}
      {benevoles.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
          <p className="text-xs font-medium text-zinc-600">Bénévoles invités (optionnel)</p>
          <div className="flex flex-wrap gap-1.5">
            {benevoles
              .filter((b) => !b.archivedAt || selectedBenevoleIds.includes(b.id))
              .map((b) => {
                const checked = selectedBenevoleIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleBenevole(b.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      checked
                        ? "border-navy bg-navy text-white"
                        : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100"
                    }`}
                  >
                    {b.firstName} {b.lastName}
                  </button>
                );
              })}
          </div>
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
