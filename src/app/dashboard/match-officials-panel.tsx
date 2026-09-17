"use client";

import { useEffect, useState } from "react";
import { Bell, ShieldCheck, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPersonName } from "@/lib/names";
import RoleIcon from "./role-icon";
import { useToast } from "./toast-context";
import {
  MATCH_OFFICIAL_ROLES,
  REFEREE_ROLE_CODES,
  REFEREE_CONFIRMED_LABEL,
  notifyMatchOfficialAssigned,
  notifyMatchOfficialReminder,
  type MatchOfficialAssignment,
  type MatchOfficialRoleCode,
} from "./match-official-roles";

type ClubMember = { id: string; name: string };

// "Organisation match à domicile" (retour de Cindy du 17/09) : palette
// corail-rouge --terracotta (voir globals.css), volontairement distincte de
// --coral (réservée à l'Espace Enfant, règle du 2026-08-23) et de
// --status-urgent (rouge sémantique "urgent/impayé") -- même mise en page
// que VolunteerNeedsPanel (une carte par rôle, bare pour s'insérer sous le
// même titre "Organisation"), jamais fusionné avec lui : ici toujours
// exactement UNE personne par rôle, jamais un compteur, et trois façons
// bien distinctes de pourvoir un rôle (voir RoleSlot plus bas).
export default function MatchOfficialsPanel({
  eventId,
  eventTitle,
  startTime,
  teamId,
  assignments,
  canManage,
}: {
  eventId: string;
  eventTitle: string | null;
  startTime: string;
  teamId: string | null;
  assignments: MatchOfficialAssignment[];
  canManage: boolean;
}) {
  const [localAssignments, setLocalAssignments] = useState(assignments);
  useEffect(() => {
    setLocalAssignments(assignments);
  }, [assignments]);

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [relancing, setRelancing] = useState(false);
  const { showToast } = useToast();

  // Chargées à la demande (jamais pour un simple joueur/parent lecture
  // seule, qui n'utilise que "Se proposer" -- voir selfIdentity plus bas)
  // plutôt qu'au montage du panneau : club_member_names couvre tout le
  // club, inutile de la charger sur chaque carte de match affichée.
  const [clubMembers, setClubMembers] = useState<ClubMember[] | null>(null);
  async function loadClubMembers() {
    if (clubMembers) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("club_member_names")
      .select("id, first_name, last_name, archived_at")
      .is("archived_at", null)
      .order("last_name", { ascending: true });
    setClubMembers(
      (data ?? []).map((row) => ({
        id: row.id as string,
        name: formatPersonName(row.first_name, row.last_name),
      }))
    );
  }

  // Id de qui consulte (retrait de sa propre proposition -- voir
  // canWithdraw plus bas). Retour de Cindy du 17/09 : "Se proposer" ouvre
  // des champs texte Prénom/Nom à remplir soi-même, jamais un nom déduit
  // du compte -- un parent ne se propose pas forcément sous le nom de son
  // enfant. Chargé seulement côté lecture seule (canManage=false) : le
  // Bureau/Coach ne se propose jamais lui-même via ce bouton, il a déjà
  // "Choisir un membre"/"Écrire un nom" pour s'affecter lui-même.
  const [selfProfileId, setSelfProfileId] = useState<string | null>(null);
  useEffect(() => {
    if (canManage) return;
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!cancelled && user) setSelfProfileId(user.id);
    });
    return () => {
      cancelled = true;
    };
  }, [canManage]);

  async function notify(roleCode: string, assigneeName: string) {
    await notifyMatchOfficialAssigned(createClient(), {
      eventId,
      eventTitle,
      startTime,
      teamId,
      roleCode,
      assigneeName,
    });
  }

  async function assignMember(roleCode: MatchOfficialRoleCode, playerId: string, name: string) {
    setPending(roleCode);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("match_official_roles")
      .insert({ event_id: eventId, role_code: roleCode, player_id: playerId })
      .select("id")
      .single();
    setPending(null);
    if (insertError) {
      setError(`Attribution impossible : ${insertError.message}`);
      return;
    }
    setLocalAssignments((prev) => [
      ...prev,
      { id: data.id, roleCode, playerId, guestName: null, createdBy: null, displayName: name },
    ]);
    void notify(roleCode, name);
  }

  async function assignGuest(roleCode: MatchOfficialRoleCode, name: string, createdBy: string | null) {
    setPending(roleCode);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("match_official_roles")
      .insert({ event_id: eventId, role_code: roleCode, guest_name: name, created_by: createdBy })
      .select("id")
      .single();
    setPending(null);
    if (insertError) {
      setError(`Attribution impossible : ${insertError.message}`);
      return;
    }
    setLocalAssignments((prev) => [
      ...prev,
      { id: data.id, roleCode, playerId: null, guestName: name, createdBy, displayName: name },
    ]);
    void notify(roleCode, name);
  }

  // "Arbitre officiel" (retour de Cindy du 17/09, après une première version
  // à tort basée sur un membre du club qualifié : "l'arbitre officiel n'est
  // pas un membre, juste un choix arbitre officiel c'est tout") : un match
  // officiel a déjà ses arbitres désignés par la ligue -- le Bureau/Coach
  // confirme juste que le rôle est couvert, en un clic, sans choisir ni
  // taper de nom. Réservé au Bureau/Coach (canManage) : jamais aux
  // familles, qui ne peuvent rien "confirmer" côté ligue.
  async function confirmReferee(roleCode: MatchOfficialRoleCode) {
    await assignGuest(roleCode, REFEREE_CONFIRMED_LABEL, null);
  }

  // "Relancer" (retour de Cindy du 17/09, "également comme besoin classique
  // avec notif cloche et push") : même bouton manuel que
  // volunteer-needs-panel.tsx (relanceNeeds), jamais désactivé après un
  // premier clic -- même principe, pas de compteur de relances à gérer.
  async function relance() {
    setRelancing(true);
    setError(null);
    const { error: relanceError } = await notifyMatchOfficialReminder(createClient(), {
      eventId,
      eventTitle,
      startTime,
      teamId,
      assignments: localAssignments,
    });
    setRelancing(false);
    if (relanceError) {
      setError(relanceError);
      return;
    }
    showToast("Relance envoyée aux personnes concernées.");
  }

  async function unassign(assignment: MatchOfficialAssignment) {
    setPending(assignment.id);
    setError(null);
    const previous = localAssignments;
    setLocalAssignments((prev) => prev.filter((a) => a.id !== assignment.id));
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("match_official_roles").delete().eq("id", assignment.id);
    setPending(null);
    if (deleteError) {
      setLocalAssignments(previous);
      setError("Retrait impossible, réessaie.");
    }
  }

  const hasUnfilledRole = MATCH_OFFICIAL_ROLES.some(
    (r) => !localAssignments.some((a) => a.roleCode === r.code)
  );

  return (
    <div className="flex flex-col gap-1.5">
      {/* Retour de Cindy du 17/09 ("en haut à droite à l'intérieur des
          onglets concernés", puis "remonter les besoins à hauteur du
          bouton") : pas de libellé interne (redondant avec le titre
          "Organisation match officiel" de la carte) -- ce rang ne porte
          plus que "Relancer", toujours en haut à gauche (retour de Cindy,
          "pardon, en fait en haut à gauche") ;
          gap-1.5 du conteneur racine (au lieu de 2.5) rapproche la liste
          des rôles de ce bouton plutôt que de laisser un blanc entre eux.
          flex-wrap : reste correct même très étroit (mobile), le bouton
          passe sous le reste plutôt que déborder. */}
      {canManage && hasUnfilledRole && (
        <div className="flex flex-wrap items-center">
          <button
            type="button"
            disabled={relancing}
            onClick={relance}
            className="flex w-fit items-center gap-1 rounded-full bg-ubac-yellow px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
          >
            <Bell className="h-3.5 w-3.5" />
            {relancing ? "Envoi..." : "Relancer"}
          </button>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {MATCH_OFFICIAL_ROLES.map((role) => {
          const assignment = localAssignments.find((a) => a.roleCode === role.code);
          const canWithdraw =
            canManage || (assignment && selfProfileId && assignment.createdBy === selfProfileId);
          const isReferee = REFEREE_ROLE_CODES.includes(role.code);
          return (
            <div key={role.code} className="flex flex-col gap-2 rounded-lg bg-white px-3 py-2.5">
              <div className="flex items-center gap-2">
                <RoleIcon icon={role.icon} />
                <p className="text-xs font-medium text-zinc-700">{role.label}</p>
              </div>
              {assignment ? (
                <div className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1 rounded-full bg-terracotta/10 px-2 py-1 text-[11px] font-medium text-terracotta-dark">
                    {assignment.displayName}
                    {canWithdraw && (
                      <button
                        type="button"
                        disabled={pending === assignment.id}
                        onClick={() => unassign(assignment)}
                        className="text-terracotta-dark/60 hover:text-terracotta-dark"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                </div>
              ) : canManage ? (
                // Retour de Cindy du 18/09 ("il doit pouvoir être cliquable
                // l'arbitre officiel, ce ne sera pas forcément un arbitre
                // officiel... ça doit être un choix pour le Bureau/les
                // coachs, ou un membre du club") : pour Arbitre 1/2, un
                // bouton de confirmation rapide en plus des deux façons
                // habituelles -- jamais un choix exclusif, la ligue désigne
                // parfois l'arbitre, parfois c'est un membre du club.
                <RoleSlotManage
                  clubMembers={clubMembers}
                  onOpen={loadClubMembers}
                  pending={pending === role.code}
                  onAssignMember={(playerId, name) => assignMember(role.code, playerId, name)}
                  onAssignGuest={(name) => assignGuest(role.code, name, null)}
                  onConfirmReferee={isReferee ? () => confirmReferee(role.code) : undefined}
                />
              ) : selfProfileId ? (
                <SelfVolunteerSlot
                  pending={pending === role.code}
                  onSubmit={(name) => assignGuest(role.code, name, selfProfileId)}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// "Se proposer" (retour de Cindy du 17/09, après une première version qui
// pré-remplissait automatiquement le nom du compte) : ouvre deux champs
// texte Prénom/Nom à remplir soi-même -- un parent ne se propose pas
// forcément sous le nom de son enfant, jamais de nom déduit du compte.
function SelfVolunteerSlot({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const name = `${firstName.trim()} ${lastName.trim()}`.trim();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-fit shrink-0 items-center gap-1 rounded-full bg-terracotta px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-terracotta-dark disabled:opacity-60"
      >
        <UserPlus className="h-3.5 w-3.5" />
        Se proposer
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        autoFocus
        placeholder="Prénom"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
        className="w-28 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs"
      />
      <input
        type="text"
        placeholder="Nom"
        value={lastName}
        onChange={(e) => setLastName(e.target.value)}
        className="w-28 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs"
      />
      <button
        type="button"
        disabled={pending || !name}
        onClick={() => onSubmit(name)}
        className="rounded-full bg-terracotta px-3 py-1.5 text-xs font-semibold text-white hover:bg-terracotta-dark disabled:opacity-60"
      >
        Valider
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs font-medium text-zinc-500 hover:text-zinc-700"
      >
        Annuler
      </button>
    </div>
  );
}

// Deux façons de pourvoir un rôle côté Bureau/Coach (retour de Cindy du
// 17/09) : un membre du club ou un nom tapé pour quelqu'un hors club --
// jamais les deux en même temps, un seul mode ouvert à la fois.
// onConfirmReferee (retour de Cindy du 18/09) : troisième bouton fourni
// seulement pour Arbitre 1/2, en plus des deux ci-dessus -- jamais
// exclusif, la ligue désigne parfois l'arbitre (confirmation en un clic,
// sans nom), sinon c'est un membre du club (les deux boutons habituels).
function RoleSlotManage({
  clubMembers,
  onOpen,
  pending,
  onAssignMember,
  onAssignGuest,
  onConfirmReferee,
}: {
  clubMembers: ClubMember[] | null;
  onOpen: () => void;
  pending: boolean;
  onAssignMember: (playerId: string, name: string) => void;
  onAssignGuest: (name: string) => void;
  onConfirmReferee?: () => void;
}) {
  const [mode, setMode] = useState<"NONE" | "MEMBER" | "GUEST">("NONE");
  const [guestName, setGuestName] = useState("");
  const options = clubMembers ?? [];

  if (mode === "MEMBER") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <select
          disabled={pending}
          defaultValue=""
          onChange={(e) => {
            const member = options.find((m) => m.id === e.target.value);
            if (member) onAssignMember(member.id, member.name);
          }}
          className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs"
        >
          <option value="" disabled>
            {clubMembers === null ? "Chargement..." : "Choisir..."}
          </option>
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setMode("NONE")}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-700"
        >
          Annuler
        </button>
      </div>
    );
  }

  if (mode === "GUEST") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          autoFocus
          placeholder="Nom et prénom"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          className="flex-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          disabled={pending || !guestName.trim()}
          onClick={() => onAssignGuest(guestName.trim())}
          className="rounded-full bg-terracotta px-3 py-1.5 text-xs font-semibold text-white hover:bg-terracotta-dark disabled:opacity-60"
        >
          Valider
        </button>
        <button
          type="button"
          onClick={() => setMode("NONE")}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-700"
        >
          Annuler
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {onConfirmReferee && (
        <button
          type="button"
          disabled={pending}
          onClick={onConfirmReferee}
          className="flex w-fit items-center gap-1 rounded-full bg-terracotta px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-terracotta-dark disabled:opacity-60"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Arbitre officiel
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          setMode("MEMBER");
          onOpen();
        }}
        className="flex w-fit items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
      >
        Choisir un membre
      </button>
      {/* Retour de Cindy du 18/09 : jamais "Écrire un nom" pour Arbitre 1/2
          (onConfirmReferee présent) -- seuls "Arbitre officiel" et
          "Choisir un membre" ont du sens pour ces deux rôles précis. */}
      {!onConfirmReferee && (
        <button
          type="button"
          onClick={() => setMode("GUEST")}
          className="flex w-fit items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Écrire un nom
        </button>
      )}
    </div>
  );
}
