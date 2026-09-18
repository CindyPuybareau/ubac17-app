"use client";

import { useEffect, useState } from "react";
import { Bell, Briefcase, Check, Minus, Plus, Trash2, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import RoleIcon from "./role-icon";
import ConfirmDialog from "./confirm-dialog";
import CommissionMultiSelect from "./commission-multi-select";
import { useToast } from "./toast-context";
import { formatPersonName } from "@/lib/names";
import {
  CUSTOM_ROLE_CODE,
  STANDARD_VOLUNTEER_ROLES,
  notifyVolunteerNeedReminder,
  volunteerRoleIcon,
  volunteerRoleLabel,
  type VolunteerNeed,
} from "./event-volunteer-needs";

type AssignableMember = { id: string; name: string; isSalarie: boolean };

function remainingSlots(need: VolunteerNeed) {
  return Math.max(0, need.requiredCount - need.signups.length);
}

// Besoins d'organisation d'un événement (buvette, table de marque...).
// Simplifié à l'inspiration de SportEasy (retour de Cindy du 2026-08-19) :
// liste FIXE de rôles standard (+ "Autre" en texte libre), plus de
// catalogue à gérer. Deux modes dans le même composant plutôt que deux
// fichiers distincts : les deux affichent la même jauge et la même liste,
// seule l'action change (s'inscrire soi-même vs. gérer pour tout le
// monde) — les dupliquer aurait fait vivre deux vérités de la même donnée.
export default function VolunteerNeedsPanel({
  eventId,
  needs,
  myPlayerIds,
  canManage,
  bare = false,
  commissionGroups = [],
  commissionGroupIds = [],
  onCommissionGroupIdsChange,
  onNeedAdded,
}: {
  eventId: string;
  needs: VolunteerNeed[];
  myPlayerIds: string[];
  canManage: boolean;
  // Sans cadre ni titre propres : utilisé quand l'appelant regroupe ce
  // panneau et MatchTasksPanel sous un seul titre "Organisation" partagé
  // (retour de Cindy du 2026-08-20).
  bare?: boolean;
  // Retour de Cindy du 12/09 ("ajoute-le aussi directement sur la carte") :
  // même sélecteur que create-event-form.tsx (CommissionMultiSelect), mais
  // ici modifiable directement depuis la carte, sans repasser par
  // "Modifier l'événement" -- porté par events.commission_group_ids, un
  // seul choix pour l'événement entier (jamais par besoin), voir son
  // commentaire dans create-event-form.tsx. commissionGroups=[] masque le
  // sélecteur (CommissionMultiSelect se cache déjà tout seul si vide) --
  // jamais fourni côté lecture seule (canManage=false).
  commissionGroups?: { id: string; name: string }[];
  commissionGroupIds?: string[];
  // Optionnel : permet à l'appelant (calendar-view.tsx...) de refléter
  // immédiatement le nouveau choix dans son état local (event.commission
  // GroupIds), pour qu'une prochaine ouverture de "Modifier l'événement"
  // reparte de la bonne valeur sans attendre le rafraîchissement temps réel.
  onCommissionGroupIdsChange?: (next: string[]) => void;
  // Retour de Cindy du 13/09 ("notifier... dès qu'une ligne est ajoutée") :
  // ce panneau ne connaît que eventId, pas l'équipe/les commissions de
  // l'événement (déjà en scope chez l'appelant, calendar-view.tsx) --
  // plutôt que lui faire porter des props supplémentaires rien que pour un
  // envoi de notification, l'appelant se charge lui-même de l'appel à
  // notifyNewVolunteerNeed() une fois prévenu qu'un besoin vient d'être
  // créé. Jamais fourni côté lecture seule (canManage=false, ce panneau n'y
  // crée jamais de besoin).
  onNeedAdded?: (need: { roleCode: string; customLabel: string | null; requiredCount: number }) => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [removeNeedTarget, setRemoveNeedTarget] = useState<string | null>(null);
  const [newRoleCode, setNewRoleCode] = useState(STANDARD_VOLUNTEER_ROLES[0].code);
  const [newCustomLabel, setNewCustomLabel] = useState("");
  const [newCount, setNewCount] = useState("1");
  const [savingCommissions, setSavingCommissions] = useState(false);
  const [relancing, setRelancing] = useState(false);
  const { showToast } = useToast();

  // Retour de Cindy du 18/09 ("les coachs et le bureau puissent rechercher
  // un membre et l'attribuer... si un message WhatsApp envoyé je fais la
  // buvette et que le parent a oublié de le mettre dans l'appli") : même
  // principe que ProfilePicker (create-event-form.tsx) et "Choisir un
  // membre" (match-officials-panel.tsx) -- chargé une seule fois à la
  // première ouverture, jamais au montage du panneau (club_member_names
  // couvre tout le club, inutile de la charger sur chaque carte affichée).
  const [assignMembers, setAssignMembers] = useState<AssignableMember[] | null>(null);
  const [assignOpenNeedId, setAssignOpenNeedId] = useState<string | null>(null);
  const [assignSearch, setAssignSearch] = useState("");

  async function loadAssignMembers() {
    if (assignMembers) return;
    const supabase = createClient();
    const { data, error: fetchError } = await supabase
      .from("club_member_names")
      .select("id, first_name, last_name, archived_at, is_salarie")
      .is("archived_at", null)
      .order("last_name", { ascending: true });
    if (fetchError) {
      setError(`Chargement des membres impossible : ${fetchError.message}`);
      return;
    }
    setAssignMembers(
      (data ?? []).map((row) => ({
        id: row.id as string,
        name: formatPersonName(row.first_name, row.last_name),
        isSalarie: Boolean(row.is_salarie),
      }))
    );
  }

  function toggleAssignOpen(needId: string) {
    if (assignOpenNeedId === needId) {
      setAssignOpenNeedId(null);
      return;
    }
    setAssignOpenNeedId(needId);
    setAssignSearch("");
    void loadAssignMembers();
  }

  // Case cochée = présent (retour de Cindy) : coche pour attribuer, décoche
  // pour retirer -- même geste, un seul contrôle, pas un bouton "Ajouter"
  // séparé d'un bouton "Retirer" (déjà porté par le X sur chaque pastille
  // plus bas, laissé pour la cohérence avec le reste de la carte).
  async function toggleAssignMember(need: VolunteerNeed, member: AssignableMember) {
    const existing = need.signups.find((s) => s.playerId === member.id);
    if (existing) {
      await withdraw(existing.id);
      return;
    }
    setPending(`assign-${need.id}-${member.id}`);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("event_volunteer_signups")
      .insert({
        need_id: need.id,
        player_id: member.id,
        source: "ADMIN",
      })
      .select("id")
      .single();
    setPending(null);
    if (insertError) {
      setError(
        insertError.code === "23505"
          ? "Ce créneau est déjà complet."
          : `Attribution impossible : ${insertError.message}`
      );
      return;
    }
    setLocalNeeds((prev) =>
      prev.map((n) =>
        n.id === need.id
          ? {
              ...n,
              signups: [
                ...n.signups,
                {
                  id: data.id,
                  playerId: member.id,
                  benevoleId: null,
                  commissionGroupId: null,
                  guestName: null,
                  playerName: member.name,
                  source: "ADMIN" as const,
                },
              ],
            }
          : n
      )
    );
  }

  // Copie locale affichée immédiatement au clic, plutôt que d'attendre le
  // rafraîchissement temps réel (débounce ~0,8s + un aller-retour serveur
  // complet qui recharge toutes les données du tableau de bord) pour voir
  // le changement à l'écran — retour de Cindy du 2026-08-21 : "8 secondes
  // au moins... vraiment trop long". Le rafraîchissement différé reste en
  // place (realtime-sync.tsx) : il ne fait plus que confirmer en
  // arrière-plan et resynchroniser les autres onglets/appareils, la copie
  // locale ci-dessous étant écrasée par les props fraîches à son arrivée.
  const [localNeeds, setLocalNeeds] = useState(needs);
  useEffect(() => {
    setLocalNeeds(needs);
  }, [needs]);

  // Un popup de confirmation bloquait ce geste jusqu'ici ; "Annuler" juste
  // à côté une fois pris suffit à se désengager aussi facilement — retour
  // de Cindy du 2026-08-21, même correctif que match-tasks-panel.tsx.
  async function volunteer(need: VolunteerNeed) {
    if (myPlayerIds.length === 0) return;
    setPending(need.id);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("event_volunteer_signups")
      .insert({
        need_id: need.id,
        player_id: myPlayerIds[0],
        source: "VOLUNTEER",
      })
      .select("id")
      .single();
    setPending(null);
    if (insertError) {
      // Message générique fixe par le passé ("Ce créneau est déjà
      // complet.") même quand la vraie cause était tout autre chose (droit
      // refusé, etc.) — retour de Cindy du 2026-08-20 : "on ne comprend pas
      // qui a pris l'organisation de quel évènement", un message qui ment
      // sur la cause rend le diagnostic impossible depuis l'appli.
      setError(
        insertError.code === "23505"
          ? "Ce créneau est déjà complet."
          : `Inscription impossible : ${insertError.message}`
      );
      return;
    }
    // playerName vide : sans effet ici puisque cette branche (mySignup)
    // n'affiche jamais le nom, seulement le bouton "Annuler" — le nom
    // réel arrive avec le prochain rafraîchissement.
    setLocalNeeds((prev) =>
      prev.map((n) =>
        n.id === need.id
          ? {
              ...n,
              signups: [
                ...n.signups,
                {
                  id: data.id,
                  playerId: myPlayerIds[0],
                  benevoleId: null,
                  commissionGroupId: null,
                  guestName: null,
                  playerName: "",
                  source: "VOLUNTEER",
                },
              ],
            }
          : n
      )
    );
    // Pas de router.refresh() explicite ici : event_volunteer_signups est
    // surveillée en temps réel (realtime-sync.tsx) depuis l'audit du
    // 2026-08-20, qui déclenche déjà son propre rafraîchissement — le
    // garder en plus faisait recharger la page DEUX fois de suite pour un
    // seul clic (une fois ici, une fois ~0,8s après via le temps réel),
    // perçu comme un délai anormalement long (retour de Cindy). Un seul
    // rafraîchissement, légèrement différé, reste plus rapide que deux.
  }

  // Retour d'audit du 28/08 : contrairement à volunteer()/addNeed(),
  // withdraw/removeNeed/updateRequiredCount ignoraient le retour de
  // Supabase — un refus RLS effaçait quand même la ligne à l'écran, sans
  // message, avant qu'elle ne revienne silencieusement au rafraîchissement
  // temps réel suivant. Rollback explicite de la copie locale en cas
  // d'échec, comme le reste du fichier.
  async function withdraw(signupId: string) {
    setPending(signupId);
    setError(null);
    const previous = localNeeds;
    setLocalNeeds((prev) =>
      prev.map((n) => ({ ...n, signups: n.signups.filter((s) => s.id !== signupId) }))
    );
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("event_volunteer_signups")
      .delete()
      .eq("id", signupId);
    setPending(null);
    if (deleteError) {
      setLocalNeeds(previous);
      setError("Désinscription impossible, réessaie.");
    }
  }

  // Confirmation déplacée dans removeNeedTarget + le <ConfirmDialog> rendu
  // plus bas — retour de Cindy du 2026-08-21 : window.confirm() affiche le
  // chrome du navigateur ("ubac17-app.vercel.app indique..."), impossible
  // à styler pour ressembler à l'appli.
  async function removeNeed(needId: string) {
    setRemoveNeedTarget(null);
    setPending(needId);
    setError(null);
    const previous = localNeeds;
    setLocalNeeds((prev) => prev.filter((n) => n.id !== needId));
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("event_volunteer_needs").delete().eq("id", needId);
    setPending(null);
    if (deleteError) {
      setLocalNeeds(previous);
      setError("Suppression impossible, réessaie.");
    }
  }

  async function updateRequiredCount(needId: string, count: number) {
    if (count < 1) return;
    setError(null);
    const previous = localNeeds;
    setLocalNeeds((prev) =>
      prev.map((n) => (n.id === needId ? { ...n, requiredCount: count } : n))
    );
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("event_volunteer_needs")
      .update({ required_count: count })
      .eq("id", needId);
    if (updateError) {
      setLocalNeeds(previous);
      setError("Modification impossible, réessaie.");
    }
  }

  async function addNeed() {
    // Retour d'audit du 28/08 : `Number("-3") || 1` vaut -3 (un nombre
    // négatif est "truthy"), envoyé tel quel vers l'insert et rejeté
    // seulement par la contrainte `check (required_count > 0)` en base,
    // avec le message Postgres brut affiché tel quel — même correctif que
    // match-tasks-panel.tsx (proposeOffer) pour le covoiturage.
    const rawCount = Number(newCount);
    const count = Number.isFinite(rawCount) && rawCount > 0 ? rawCount : 1;
    const trimmedCustom = newCustomLabel.trim();
    if (newRoleCode === CUSTOM_ROLE_CODE && !trimmedCustom) {
      setError("Précise le nom de ce besoin.");
      return;
    }
    setPending("add");
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("event_volunteer_needs")
      .insert({
        event_id: eventId,
        role_code: newRoleCode,
        custom_label: newRoleCode === CUSTOM_ROLE_CODE ? trimmedCustom : null,
        required_count: count,
        sort_order: localNeeds.length,
      })
      .select("id")
      .single();
    setPending(null);
    if (insertError) {
      // Même correctif de clarté que volunteer()/removeNeed() plus haut
      // (retour de Cindy du 2026-08-20) : la vraie cause plutôt qu'un
      // message générique qui ne dit rien en cas d'échec.
      setError(`Ajout impossible : ${insertError.message}`);
      return;
    }
    setLocalNeeds((prev) => [
      ...prev,
      {
        id: data.id,
        eventId,
        roleCode: newRoleCode,
        customLabel: newRoleCode === CUSTOM_ROLE_CODE ? trimmedCustom : null,
        requiredCount: count,
        signups: [],
      },
    ]);
    onNeedAdded?.({
      roleCode: newRoleCode,
      customLabel: newRoleCode === CUSTOM_ROLE_CODE ? trimmedCustom : null,
      requiredCount: count,
    });
    setNewRoleCode(STANDARD_VOLUNTEER_ROLES[0].code);
    setNewCustomLabel("");
    setNewCount("1");
    setAddOpen(false);
  }

  // Retour de Cindy du 12/09 : même écriture que create-event-form.tsx
  // (handleSubmit) -- toujours le tableau complet, jamais null même vide.
  // Rollback local si l'écriture échoue, même principe que
  // updateRequiredCount ci-dessus.
  async function saveCommissionGroupIds(next: string[]) {
    const previous = commissionGroupIds;
    setSavingCommissions(true);
    setError(null);
    onCommissionGroupIdsChange?.(next);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("events")
      .update({ commission_group_ids: next })
      .eq("id", eventId);
    setSavingCommissions(false);
    if (updateError) {
      onCommissionGroupIdsChange?.(previous);
      setError("Modification impossible, réessaie.");
    }
  }

  // Retour de Cindy du 17/09 ("un petit bouton... côté coach") : relance à
  // la demande, en plus de celle automatique à J-7 (voir
  // notifyVolunteerNeedReminder) -- jamais désactivé après un premier clic,
  // décidé avec Cindy plutôt qu'un compteur de relances à gérer.
  async function relanceNeeds() {
    setRelancing(true);
    setError(null);
    const supabase = createClient();
    const { error: relanceError } = await notifyVolunteerNeedReminder(
      supabase,
      eventId,
      localNeeds
    );
    setRelancing(false);
    if (relanceError) {
      setError(relanceError);
      return;
    }
    showToast("Relance envoyée aux personnes concernées.");
  }

  if (localNeeds.length === 0 && !canManage) return null;

  return (
    <div
      className={
        bare
          ? "flex flex-col gap-1.5"
          : "mt-3 flex flex-col gap-1.5 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3"
      }
    >
      {(!bare || canManage) && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Retour de Cindy du 17/09 ("en haut à gauche à l'intérieur des
              onglets concernés") : déplacé depuis le bas de la carte,
              premier élément du rang pour rester en haut à GAUCHE (pas de
              ml-auto/justify-between, qui l'auraient poussé à droite) --
              n'a de sens que s'il reste au moins un besoin non pourvu. */}
          {canManage && localNeeds.some((n) => remainingSlots(n) > 0) && (
            <button
              type="button"
              disabled={relancing}
              onClick={relanceNeeds}
              className="flex w-fit items-center gap-1 rounded-full bg-ubac-yellow px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
            >
              <Bell className="h-3.5 w-3.5" />
              {relancing ? "Envoi..." : "Relancer"}
            </button>
          )}
          {!bare && (
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Besoins d&apos;organisation
            </p>
          )}
          {/* Retour de Cindy du 12/09 ("ajoute-le aussi directement sur la
              carte") : même contrôle que create-event-form.tsx, modifiable
              ici sans repasser par "Modifier l'événement". Absent en
              lecture seule (canManage=false) : ce choix reste une décision
              de gestion, jamais du ressort d'un simple joueur/parent. */}
          {/* Masqué temporairement (retour de Cindy du 17/09, "je pense que
              j'en aurai pas besoin pour le moment") -- composant/props
              gardés intacts, juste `false &&` à retirer pour réactiver. */}
          {false && canManage && (
            <CommissionMultiSelect
              commissions={commissionGroups}
              selectedIds={commissionGroupIds}
              onChange={saveCommissionGroupIds}
            />
          )}
        </div>
      )}
      {savingCommissions && <p className="text-xs text-zinc-400">Enregistrement...</p>}

      {localNeeds.length === 0 && (
        <p className="text-xs text-zinc-400">Aucun besoin défini pour cet événement.</p>
      )}

      <div className="flex flex-col gap-2">
        {localNeeds.map((need) => {
          const label = volunteerRoleLabel(need.roleCode, need.customLabel);
          const icon = volunteerRoleIcon(need.roleCode);
          const remaining = remainingSlots(need);
          const mySignup = need.signups.find((s) => s.playerId != null && myPlayerIds.includes(s.playerId));

          return (
            <div key={need.id} className="flex flex-col gap-2 rounded-lg bg-white px-3 py-2.5">
              {/* Retour de Cindy du 17/09 ("le responsive sur téléphone est
                  bof", puis "on devrait voir le texte... c'est limite") :
                  la première tentative (libellé tronqué sur la même ligne
                  que le compteur) allait jusqu'à ne plus montrer aucune
                  lettre pour un libellé un peu long ("Table de marque",
                  "Lavage maillots") sur un téléphone étroit -- illisible.
                  Repli sur deux lignes distinctes à la place : le libellé
                  (jamais tronqué, quitte à passer sur 2 lignes lui-même)
                  au-dessus, le compteur/la corbeille en dessous -- chacun a
                  alors toute la largeur de la carte pour lui, jamais à se
                  partager la même ligne. */}
              <div className="flex items-center gap-2">
                <RoleIcon icon={icon} />
                <p className="text-xs font-medium text-zinc-700">{label}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {canManage ? (
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
                      {remaining > 0
                        ? `${need.signups.length}/${need.requiredCount}`
                        : `Complet (${need.signups.length}/${need.requiredCount})`}
                    </span>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setRemoveNeedTarget(need.id)}
                      title="Supprimer ce besoin"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-red-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
              </div>

              {/* Confirmation explicite plutôt que la seule jauge
                  numérique — retour de Cindy du 2026-08-19 : elle veut
                  voir clairement quand sa demande est couverte. */}
              {need.requiredCount > 0 && remaining === 0 && (
                <p className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                  <Check className="h-3 w-3 shrink-0" />
                  Nombre de bénévoles atteint
                </p>
              )}

              {/* Qui s'en occupe, visible partout (Bureau/Coach/Famille) —
                  pas seulement en gestion. Avant ce correctif, un simple
                  joueur voyait juste "1/4" sans jamais savoir qui, et devait
                  demander autour de lui (retour de Cindy du 2026-08-21).
                  Le bouton de retrait individuel (X sur le nom) reste
                  réservé à la gestion ; côté lecture seule, seul "Annuler"
                  sur SA PROPRE inscription reste possible, juste en dessous. */}
              {need.signups.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {need.signups.map((s) => (
                    <span
                      key={s.id}
                      className="flex items-center gap-1 rounded-full bg-navy/10 px-2 py-1 text-[11px] font-medium text-navy"
                    >
                      {s.playerName}
                      {canManage && (
                        <button
                          type="button"
                          disabled={pending === s.id}
                          onClick={() => withdraw(s.id)}
                          className="text-navy/60 hover:text-navy"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {/* Retour de Cindy du 18/09 ("si un message WhatsApp envoyé je
                  fais la buvette et que le parent a oublié de le mettre
                  dans l'appli") : le Bureau/Coach attribue directement un
                  besoin classique à un membre, même principe que
                  "Personnes spécifiques" -- recherche + cases à cocher,
                  jamais un simple bouton "Ajouter" qui rouvrirait un
                  formulaire séparé. */}
              {canManage && (
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggleAssignOpen(need.id)}
                    className="flex w-fit items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Attribuer un membre
                  </button>
                  {assignOpenNeedId === need.id && (
                    <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-200 bg-white p-2">
                      <input
                        type="text"
                        placeholder="Rechercher un membre..."
                        value={assignSearch}
                        onChange={(e) => setAssignSearch(e.target.value)}
                        className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs"
                      />
                      <div className="max-h-40 overflow-y-auto">
                        {assignMembers === null ? (
                          <p className="px-1 py-1 text-xs text-zinc-400">Chargement...</p>
                        ) : (
                          (() => {
                            const filtered = assignMembers
                              .map((m, index) => ({ ...m, index }))
                              .filter((m) =>
                                m.name.toLowerCase().includes(assignSearch.trim().toLowerCase())
                              )
                              .sort(
                                (a, b) => Number(b.isSalarie) - Number(a.isSalarie) || a.index - b.index
                              );
                            return filtered.length === 0 ? (
                              <p className="px-1 py-1 text-xs text-zinc-400">Aucun membre trouvé.</p>
                            ) : (
                              filtered.map((m) => {
                                const checked = need.signups.some((s) => s.playerId === m.id);
                                return (
                                  <label
                                    key={m.id}
                                    className={`flex items-center gap-1.5 px-1 py-1 text-xs ${
                                      m.isSalarie ? "font-semibold text-blue-700" : "text-zinc-700"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={pending === `assign-${need.id}-${m.id}`}
                                      onChange={() => toggleAssignMember(need, m)}
                                      className="h-3.5 w-3.5 rounded border-zinc-300 text-terracotta focus:ring-terracotta"
                                    />
                                    {m.isSalarie && <Briefcase className="h-3 w-3 shrink-0" />}
                                    {m.name}
                                  </label>
                                );
                              })
                            );
                          })()
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!canManage &&
                (mySignup ? (
                  // Vert plutôt qu'un gris neutre : une fois inscrit, le
                  // bouton doit lire "c'est confirmé, c'est toi" au premier
                  // coup d'œil (retour de Cindy du 2026-08-20). Même style
                  // que match-tasks-panel.tsx, une seule vérité visuelle.
                  <button
                    type="button"
                    disabled={pending === mySignup.id}
                    onClick={() => withdraw(mySignup.id)}
                    className="flex w-fit shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-60"
                  >
                    <X className="h-3 w-3" />
                    Annuler
                  </button>
                ) : remaining > 0 && myPlayerIds.length > 0 ? (
                  <button
                    type="button"
                    disabled={pending === need.id}
                    onClick={() => volunteer(need)}
                    className="w-fit shrink-0 rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-dark disabled:opacity-60"
                  >
                    Je m&apos;en occupe
                  </button>
                ) : null)}
            </div>
          );
        })}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {canManage && (
        <div className="flex flex-col gap-2">
          {addOpen ? (
            <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={newRoleCode}
                  onChange={(e) => setNewRoleCode(e.target.value)}
                  className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs"
                >
                  {STANDARD_VOLUNTEER_ROLES.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                  <option value={CUSTOM_ROLE_CODE}>Autre...</option>
                </select>
                {newRoleCode === CUSTOM_ROLE_CODE && (
                  <input
                    type="text"
                    autoFocus
                    placeholder="Nom du besoin"
                    value={newCustomLabel}
                    onChange={(e) => setNewCustomLabel(e.target.value)}
                    className="flex-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs"
                  />
                )}
                <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                  Nombre de personnes requises
                  <input
                    type="number"
                    min={1}
                    value={newCount}
                    onChange={(e) => setNewCount(e.target.value)}
                    className="w-14 rounded-lg border border-zinc-200 px-2 py-1 text-center"
                  />
                </label>
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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="flex w-fit items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter un besoin
              </button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(removeNeedTarget)}
        title="Supprimer ce besoin ?"
        message="Êtes-vous sûr de vouloir supprimer ce besoin et toutes ses inscriptions ?"
        confirmLabel="Supprimer"
        onConfirm={() => removeNeedTarget && removeNeed(removeNeedTarget)}
        onCancel={() => setRemoveNeedTarget(null)}
      />
    </div>
  );
}
