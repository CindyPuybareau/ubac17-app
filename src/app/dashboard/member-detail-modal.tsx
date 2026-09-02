"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useScrollTopOnChange } from "@/lib/use-scroll-top-on-change";
import {
  AlertTriangle,
  Copy,
  Shield,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPersonName } from "@/lib/names";
import { formatLocalDateFr } from "@/lib/local-date";
import { teamLabel } from "@/lib/teams";
import { notifyCoachesOfNewTeamMember } from "@/lib/member-notifications";
import { buildAppDeepLink } from "@/lib/whatsapp";
import { sameCategoryFamily, teamCategoryLabel } from "@/lib/teams";
import ConfirmDialog from "./confirm-dialog";
import ParentLinkManager from "./parent-link-manager";
import type { AdminMember, AdminMemberTeam, MemberDetail } from "./page";

const BUREAU_ROLE_OPTIONS = [
  "Président / Vice-Président",
  "Trésorier / Trésorier Adjoint",
  "Secrétaire / Secrétaire Adjoint",
  "Membre du Bureau",
  "Responsable Commission (Sponsors, Com, Animations, etc.)",
];

const TABS = [
  { key: "identity", label: "Identité", icon: User },
  { key: "license", label: "Licence & Équipe", icon: Shield },
  { key: "family", label: "Parents & Urgence", icon: Users },
  { key: "medical", label: "Santé & Chartes", icon: AlertTriangle },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function formatBirthDate(iso: string | null) {
  if (!iso) return null;
  return formatLocalDateFr(iso) ?? iso;
}

// Exported so AddMemberModal (creation form) can reuse the exact same
// styled input/select/textarea instead of duplicating this markup — the
// two modals should look identical since they edit the same data model.
export function Field({
  label,
  value,
  displayValue,
  editable,
  onChange,
  multiline,
  options,
  type = "text",
}: {
  label: string;
  value: string;
  displayValue?: string | null;
  editable: boolean;
  onChange: (v: string) => void;
  multiline?: boolean;
  options?: string[];
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {label}
      </span>
      {!editable ? (
        <span className="whitespace-pre-wrap text-sm text-zinc-800">
          {(displayValue ?? value)?.trim() || "—"}
        </span>
      ) : options ? (
        <select
          value={value}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
          className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : multiline ? (
        <textarea
          value={value}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          rows={2}
          className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
        />
      )}
    </div>
  );
}

function ReadOnlyField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {label}
      </span>
      {children}
    </div>
  );
}

export default function MemberDetailModal({
  member,
  readOnly,
  onClose,
  onArchive,
  onSaved,
  archivedAt = null,
  teams = [],
  profileId = null,
  bureauRole: initialBureauRole = null,
  coachTeams: initialCoachTeams = [],
  pendingCoachTeams: initialPendingCoachTeams = [],
  // Réaffecter une équipe, désigner un coach ou donner l'accès Bureau
  // restent des gestes du Bureau. Un coach ouvre la même fiche, mais
  // limitée aux informations pratiques — d'autant que la réaffectation
  // d'équipe ci-dessous supprime TOUS les rattachements du joueur, ce qui
  // effacerait au passage un prêt à une autre équipe.
  canManageTeamAndRoles = true,
  // Droit dédié plutôt que canManageTeamAndRoles (retour de Cindy du 29/08 :
  // le bloc "Compte(s) parent relié(s)" restait invisible depuis l'onglet
  // Équipes, où team-card.tsx coupe canManageTeamAndRoles pour TOUT appelant
  // — Bureau inclus — car la réaffectation d'équipe/rôles a sa propre UI là-
  // bas. Le rattachement parent n'a aucun équivalent ailleurs : il doit donc
  // rester ouvert au Bureau quel que soit l'onglet d'où la fiche est ouverte,
  // et seulement fermé pour un Coach.
  canManageParentLinks = true,
  // Retour de Cindy du 30/08 : un coach ne doit corriger que les
  // coordonnées de contact d'un joueur qu'il gère (email, téléphone,
  // adresse) — jamais son nom, sa catégorie, sa licence ou ses notes
  // médicales. Voir aussi le déclencheur protect_sensitive_player_fields
  // côté base, qui applique la même règle même hors de cette interface :
  // ce prop-ci ne fait qu'aligner l'écran sur ce qui sera de toute façon
  // accepté ou non à l'enregistrement.
  canEditFullProfile = true,
}: {
  member: MemberDetail;
  readOnly: boolean;
  onClose: () => void;
  // Already-confirmed by confirmArchiveClick below — this callback performs
  // the archive directly (no second confirm dialog of its own), unlike
  // members-table.tsx's row-menu/bulk-toolbar handleArchive which owns its
  // own confirmation because it isn't gated by a modal already.
  onArchive?: () => void | Promise<void>;
  // Appelé juste avant la fermeture, avec les champs modifiés : permet à
  // members-table.tsx de patcher sa copie locale immédiatement plutôt que
  // d'attendre router.refresh() — retour de Cindy du 2026-08-21 : ce
  // rechargement complet du tableau de bord faisait aussi apparaître le
  // nouvel écran de chargement plein écran (loading.tsx), qui remplace
  // toute la page et fait perdre la position de défilement dans le
  // tableau ("je reviens au début du tableau, c'est chiant").
  onSaved?: (patch: Partial<AdminMember>) => void;
  archivedAt?: string | null;
  teams?: AdminMemberTeam[];
  profileId?: string | null;
  bureauRole?: string | null;
  coachTeams?: AdminMemberTeam[];
  pendingCoachTeams?: AdminMemberTeam[];
  canManageTeamAndRoles?: boolean;
  canManageParentLinks?: boolean;
  canEditFullProfile?: boolean;
}) {
  const [tab, setTab] = useState<TabKey>("identity");
  const [linkCopied, setLinkCopied] = useState(false);
  const tabBodyRef = useRef<HTMLDivElement>(null);
  useScrollTopOnChange(tab, tabBodyRef);

  function copyAppLink() {
    navigator.clipboard
      .writeText(buildAppDeepLink("members", { openMember: member.id }))
      .then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      });
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState(member.teams[0]?.id ?? "");
  // The "Équipe" select only lists teams with a sort_order set — if this
  // member is still on a leftover row without one, it wouldn't match any
  // <option>, so the browser silently displays "Aucune équipe" while
  // teamId still holds that id. Save would then see no change and do
  // nothing. Surface the current team as an extra option so it genuinely
  // shows selected, and switching away from it (including to "Aucune
  // équipe") actually fires onChange.
  const currentTeam = member.teams[0];
  const teamOptions =
    currentTeam && !teams.some((t) => t.id === currentTeam.id)
      ? [...teams, currentTeam]
      : teams;

  // Équipes "en plus" de la principale (prêts additifs, voir team-card.tsx
  // "Affecter à une autre équipe") — retour de Cindy du 02/09 : ce même
  // geste doit aussi être possible depuis la fiche Membres, pas seulement
  // depuis la carte de l'équipe. État local propre (pas juste member.teams,
  // qui est un prop figé) pour refléter chaque ajout/retrait immédiatement,
  // même s'il n'est pas rattaché au bouton "Enregistrer" du reste de la
  // fiche : mêmes mutations directes, immédiates, que team-card.tsx.
  const [extraTeams, setExtraTeams] = useState<AdminMemberTeam[]>(member.teams.slice(1));
  const [addingExtraTeam, setAddingExtraTeam] = useState(false);
  const [extraTeamPickId, setExtraTeamPickId] = useState("");
  const [extraTeamError, setExtraTeamError] = useState<string | null>(null);
  const [removingExtraTeamId, setRemovingExtraTeamId] = useState<string | null>(null);

  // Équipes de la même famille (U13M/U13M-1/U13M-2...) où le joueur n'est
  // pas encore, en excluant la principale ET les prêts déjà en cours —
  // même logique que sameFamilyTeams/switchableTeams dans team-card.tsx.
  const assignedTeamIds = new Set(
    [currentTeam, ...extraTeams].filter((t): t is AdminMemberTeam => Boolean(t)).map((t) => t.id)
  );
  const addableExtraTeams = teams.filter(
    (t) =>
      !assignedTeamIds.has(t.id) &&
      sameCategoryFamily(
        teamCategoryLabel(currentTeam ?? { name: null, category: member.category }),
        teamCategoryLabel(t)
      )
  );

  function openAddExtraTeam() {
    setAddingExtraTeam(true);
    setExtraTeamPickId("");
    setExtraTeamError(null);
  }

  async function confirmAddExtraTeam() {
    if (!extraTeamPickId) return;
    setExtraTeamError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase
      .from("team_players")
      .insert({ team_id: extraTeamPickId, player_id: member.id });
    if (insertError) {
      setExtraTeamError(
        insertError.code === "23505"
          ? "Ce membre fait déjà partie de cette équipe."
          : insertError.message
      );
      return;
    }
    const addedTeam = addableExtraTeams.find((t) => t.id === extraTeamPickId);
    const nextExtraTeams = addedTeam ? [...extraTeams, addedTeam] : extraTeams;
    setExtraTeams(nextExtraTeams);
    setAddingExtraTeam(false);
    onSaved?.({ teams: [currentTeam, ...nextExtraTeams].filter((t): t is AdminMemberTeam => Boolean(t)) });
    if (addedTeam) {
      notifyCoachesOfNewTeamMember(
        supabase,
        addedTeam.id,
        `${member.firstName ?? ""} ${member.lastName ?? ""} vient d'être affecté(e) à ${teamLabel(addedTeam)}.`
      );
    }
  }

  async function removeExtraTeam(team: AdminMemberTeam) {
    setRemovingExtraTeamId(team.id);
    setExtraTeamError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("team_players")
      .delete()
      .eq("player_id", member.id)
      .eq("team_id", team.id);
    setRemovingExtraTeamId(null);
    if (deleteError) {
      setExtraTeamError(`Retrait impossible : ${deleteError.message}`);
      return;
    }
    const nextExtraTeams = extraTeams.filter((t) => t.id !== team.id);
    setExtraTeams(nextExtraTeams);
    onSaved?.({ teams: [currentTeam, ...nextExtraTeams].filter((t): t is AdminMemberTeam => Boolean(t)) });
  }

  const [coachTeamIds, setCoachTeamIds] = useState<Set<string>>(
    () => new Set([...initialCoachTeams, ...initialPendingCoachTeams].map((t) => t.id))
  );
  const [isCoach, setIsCoach] = useState(() => coachTeamIds.size > 0);
  // Fades the coached-teams block in on the frame after it mounts, rather
  // than mounting it already at full opacity — a plain conditional render
  // has nothing to transition from otherwise.
  const [coachTeamsVisible, setCoachTeamsVisible] = useState(isCoach);

  useEffect(() => {
    if (!isCoach) {
      setCoachTeamsVisible(false);
      return;
    }
    const id = setTimeout(() => setCoachTeamsVisible(true), 10);
    return () => clearTimeout(id);
  }, [isCoach]);

  function handleCoachToggle(checked: boolean) {
    setIsCoach(checked);
    if (!checked) setCoachTeamIds(new Set());
  }
  const [bureauRole, setBureauRole] = useState(initialBureauRole ?? "");
  // Guard against the classic controlled-<select> pitfall (already hit
  // once with the Équipe picker): if a legacy row's club_function doesn't
  // match any of the current options, surface it as an extra option so
  // the select shows the real value instead of silently falling back.
  const bureauRoleOptions =
    initialBureauRole && !BUREAU_ROLE_OPTIONS.includes(initialBureauRole)
      ? [...BUREAU_ROLE_OPTIONS, initialBureauRole]
      : BUREAU_ROLE_OPTIONS;
  const [form, setForm] = useState({
    firstName: member.firstName ?? "",
    lastName: member.lastName ?? "",
    birthDate: member.birthDate ?? "",
    sex: member.sex ?? "",
    registrationEmail: member.registrationEmail ?? "",
    registrationPhone: member.registrationPhone ?? "",
    address: member.address ?? "",
    postalCode: member.postalCode ?? "",
    city: member.city ?? "",
    secondaryEmail: member.secondaryEmail ?? "",
    motherPhone: member.motherPhone ?? "",
    fatherPhone: member.fatherPhone ?? "",
    otherPhones: member.otherPhones ?? "",
    secondaryAddress: member.secondaryAddress ?? "",
    licenseType: member.licenseType ?? "",
    membershipType: member.membershipType ?? "",
    fbiStatus: member.fbiStatus ?? "",
    medicalNotes: member.medicalNotes ?? "",
    otherNotes: member.otherNotes ?? "",
    imageRights: member.imageRights ?? "",
    licenseNumber: member.licenseNumber ?? "",
    licenseExpiresAt: member.licenseExpiresAt ?? "",
    medicalCertificateExpiresAt: member.medicalCertificateExpiresAt ?? "",
  });

  const editable = !readOnly;
  // Champs hors coordonnées de contact (nom, naissance, catégorie,
  // licence, notes médicales...) : coupés pour un coach, voir
  // canEditFullProfile ci-dessus.
  const fullProfileEditable = editable && canEditFullProfile;

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleCoachTeam(teamId: string) {
    setCoachTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  // Confirmation déplacée dans archiveConfirmOpen + le <ConfirmDialog>
  // rendu plus bas — retour de Cindy du 2026-08-21 : window.confirm()
  // affiche le chrome du navigateur, impossible à styler pour ressembler
  // à l'appli.
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);

  async function confirmArchiveClick() {
    setArchiveConfirmOpen(false);
    if (!onArchive) return;
    await onArchive();
    onClose();
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    // Keep players.category in sync with whichever team is selected below —
    // it's the single source of truth this app displays everywhere
    // (Membres/Cotisations tables), and the DB trigger that auto-creates a
    // cotisation for the member's tariff category only fires on category
    // change, so this also makes "assigner un membre à une équipe" -> "il
    // apparaît dans Cotisations" work for a member who had no team (and no
    // category) at creation time.
    // Sans droit sur l'équipe, la catégorie n'est pas recalculée : la
    // dériver d'un sélecteur non affiché la mettrait à null.
    const category = canManageTeamAndRoles
      ? (teamOptions.find((t) => t.id === teamId)?.category ?? null)
      : member.category;
    // Une date d'échéance modifiée (renouvellement, ou simple correction)
    // remet à zéro le repère "déjà alerté" correspondant — sinon un
    // document renouvelé resterait silencieusement marqué comme relancé
    // pour sa nouvelle échéance, qui ne recevrait donc jamais son propre
    // rappel (voir /api/cron/expiry-alerts).
    const licenseExpiryChanged = form.licenseExpiresAt !== (member.licenseExpiresAt ?? "");
    const medicalExpiryChanged =
      form.medicalCertificateExpiresAt !== (member.medicalCertificateExpiresAt ?? "");
    const { error: updateError } = await supabase
      .from("players")
      .update({
        first_name: form.firstName || null,
        last_name: form.lastName || null,
        birth_date: form.birthDate || null,
        category,
        sex: form.sex || null,
        registration_email: form.registrationEmail || null,
        registration_phone: form.registrationPhone || null,
        address: form.address || null,
        postal_code: form.postalCode || null,
        city: form.city || null,
        secondary_email: form.secondaryEmail || null,
        mother_phone: form.motherPhone || null,
        father_phone: form.fatherPhone || null,
        other_phones: form.otherPhones || null,
        secondary_address: form.secondaryAddress || null,
        license_type: form.licenseType || null,
        membership_type: form.membershipType || null,
        fbi_status: form.fbiStatus || null,
        medical_notes: form.medicalNotes || null,
        other_notes: form.otherNotes || null,
        image_rights: form.imageRights || null,
        license_number: form.licenseNumber || null,
        license_expires_at: form.licenseExpiresAt || null,
        medical_certificate_expires_at: form.medicalCertificateExpiresAt || null,
        ...(licenseExpiryChanged ? { license_expiry_alert_sent_at: null } : {}),
        ...(medicalExpiryChanged ? { medical_expiry_alert_sent_at: null } : {}),
      })
      .eq("id", member.id);

    if (updateError) {
      setSaving(false);
      setError(updateError.message);
      return;
    }

    // Reflète immédiatement les champs de la fiche players (voir onSaved
    // sur le composant) : construit à partir de `form`, pas re-demandé au
    // serveur — même valeurs que celles qu'on vient d'écrire ci-dessus.
    // email/phone (AdminMember, dérivés côté serveur avec des replis sur
    // le compte lié) restent volontairement approchés par
    // registrationEmail/registrationPhone ici : le prochain
    // rafraîchissement temps réel (players est surveillée) corrige
    // silencieusement le rare écart, sans qu'il faille reproduire ici
    // toute la logique de repli de page.tsx.
    const basePatch: Partial<AdminMember> = {
      firstName: form.firstName || null,
      lastName: form.lastName || null,
      birthDate: form.birthDate || null,
      category,
      sex: form.sex || null,
      registrationEmail: form.registrationEmail || null,
      registrationPhone: form.registrationPhone || null,
      address: form.address || null,
      postalCode: form.postalCode || null,
      city: form.city || null,
      secondaryEmail: form.secondaryEmail || null,
      motherPhone: form.motherPhone || null,
      fatherPhone: form.fatherPhone || null,
      otherPhones: form.otherPhones || null,
      secondaryAddress: form.secondaryAddress || null,
      licenseType: form.licenseType || null,
      membershipType: form.membershipType || null,
      fbiStatus: form.fbiStatus || null,
      medicalNotes: form.medicalNotes || null,
      otherNotes: form.otherNotes || null,
      imageRights: form.imageRights || null,
      licenseNumber: form.licenseNumber || null,
      licenseExpiresAt: form.licenseExpiresAt || null,
      medicalCertificateExpiresAt: form.medicalCertificateExpiresAt || null,
      email: form.registrationEmail || member.registrationEmail || null,
      phone: form.registrationPhone || member.registrationPhone || null,
    };

    const currentTeamId = member.teams[0]?.id ?? "";
    if (canManageTeamAndRoles && teamId !== currentTeamId) {
      // Uniquement la ligne de l'équipe affichée par ce sélecteur (team[0]),
      // jamais un .delete() sans .eq("team_id", ...) : un membre "prêté" à
      // une deuxième équipe depuis la fiche équipe (team-card.tsx,
      // additif) a PLUSIEURS lignes team_players. Supprimer tout ici en
      // corrigeant juste l'équipe principale désinscrivait aussi
      // silencieusement le prêt — même classe de bug que l'incident
      // d'import qui avait déjà effacé des affectations d'équipe.
      if (currentTeamId) {
        const { error: deleteError } = await supabase
          .from("team_players")
          .delete()
          .eq("player_id", member.id)
          .eq("team_id", currentTeamId);
        if (deleteError) {
          setSaving(false);
          setError(`Équipe non mise à jour : ${deleteError.message}`);
          return;
        }
      }
      if (teamId) {
        const { error: insertError } = await supabase
          .from("team_players")
          .insert({ team_id: teamId, player_id: member.id });
        if (insertError) {
          setSaving(false);
          setError(`Équipe non mise à jour : ${insertError.message}`);
          return;
        }
        // Fiche déjà existante, jamais de nouvelle création ici : seuls
        // les coachs de la nouvelle équipe sont notifiés (audit du 31/08).
        const newTeam = teams.find((t) => t.id === teamId);
        notifyCoachesOfNewTeamMember(
          supabase,
          teamId,
          `${form.firstName} ${form.lastName} vient d'être affecté(e) à ${newTeam ? teamLabel(newTeam) : "cette équipe"}.`
        );
      }
    }

    // Nouvelle équipe affichable immédiatement (voir basePatch plus haut) :
    // seulement si elle a effectivement changé, sinon la fiche garde ses
    // équipes actuelles telles quelles (un prêt additif n'apparaît jamais
    // dans ce sélecteur à une seule équipe, pas de raison de le perdre ici).
    const newTeams =
      canManageTeamAndRoles && teamId !== currentTeamId
        ? teamOptions.find((t) => t.id === teamId)
          ? [teamOptions.find((t) => t.id === teamId)!]
          : []
        : member.teams;

    // Sans droit sur les rôles, l'enregistrement s'arrête aux informations
    // pratiques : ni désignation de coach, ni accès Bureau.
    if (!canManageTeamAndRoles) {
      setSaving(false);
      onSaved?.({ ...basePatch, teams: newTeams });
      onClose();
      return;
    }

    // Coach team assignment works whether or not this member has a real
    // login account yet: linked -> real team_coaches (grants access AND
    // shows up in every "Coach" section app-wide), unlinked ->
    // team_pending_coaches (display-only badge, same table the "en
    // attente de compte" pastille reads from). The players<->profiles
    // auto-link normally runs silently in the background at signup, but a
    // member whose row predates that trigger (or was never re-run) can
    // still have profileId null here despite genuinely already having an
    // account — self-heal it right now by email match, so this save
    // doesn't silently land in team_pending_coaches for someone who's
    // actually already a real user (the exact bug that left a real coach
    // invisible in their teams' "Coach" section).
    let resolvedProfileId = profileId;
    if (!resolvedProfileId) {
      const emailToMatch = (form.registrationEmail || member.registrationEmail)?.trim();
      if (emailToMatch) {
        const { data: matchedProfile } = await supabase
          .from("profiles")
          .select("id")
          .ilike("email", emailToMatch)
          .maybeSingle();
        if (matchedProfile) {
          // Une famille partage une seule adresse : ce compte est peut-être
          // celui du parent, déjà rattaché à SA fiche. Le réutiliser ici
          // attacherait la fiche de l'enfant au compte du père, et le
          // retrait d'un rôle de coach viserait alors les équipes du père.
          const { data: alreadyLinked, error: alreadyLinkedError } = await supabase
            .from("players")
            .select("id")
            .eq("profile_id", matchedProfile.id)
            .neq("id", member.id)
            .maybeSingle();

          // Et même si ce compte n'est encore lié à aucune fiche : une fiche
          // déclarée comme l'enfant de ce compte n'est pas la fiche de son
          // titulaire.
          const { data: declaredAsChild, error: declaredAsChildError } = await supabase
            .from("parent_player")
            .select("player_id")
            .eq("player_id", member.id)
            .eq("parent_id", matchedProfile.id)
            .maybeSingle();

          // Un échec de l'une ou l'autre requête de garde (RLS, réseau)
          // renvoyait data: undefined — donc "rien trouvé" — et laissait
          // passer le rattachement automatique sans avoir vraiment vérifié
          // l'absence de conflit. C'est exactement le mélange fiche
          // enfant/compte parent que ces deux requêtes existent pour
          // empêcher : mieux vaut ne pas rattacher du tout que de le faire
          // sans garantie.
          if (!alreadyLinkedError && !declaredAsChildError && !alreadyLinked && !declaredAsChild) {
            const { error: linkError } = await supabase
              .from("players")
              .update({ profile_id: matchedProfile.id })
              .eq("id", member.id);
            if (!linkError) {
              resolvedProfileId = matchedProfile.id;
            }
          }
        }
      }
    }

    const initialCombinedCoachIds = new Set(
      [...initialCoachTeams, ...initialPendingCoachTeams].map((t) => t.id)
    );
    const desiredCoachIds = coachTeamIds;
    const toRemove = Array.from(initialCombinedCoachIds).filter(
      (id) => !desiredCoachIds.has(id)
    );
    const toAdd = Array.from(desiredCoachIds).filter(
      (id) => !initialCombinedCoachIds.has(id)
    );
    const coachTable = resolvedProfileId ? "team_coaches" : "team_pending_coaches";
    const coachIdColumn = resolvedProfileId ? "coach_id" : "player_id";
    const coachIdValue = resolvedProfileId ?? member.id;

    if (toRemove.length > 0) {
      const { error: removeError } = await supabase
        .from(coachTable)
        .delete()
        .eq(coachIdColumn, coachIdValue)
        .in("team_id", toRemove);
      if (removeError) {
        setSaving(false);
        setError(`Équipes coachées non mises à jour : ${removeError.message}`);
        return;
      }
    }
    if (toAdd.length > 0) {
      const { error: addError } = await supabase
        .from(coachTable)
        .insert(toAdd.map((tid) => ({ team_id: tid, [coachIdColumn]: coachIdValue })));
      if (addError) {
        setSaving(false);
        setError(`Équipes coachées non mises à jour : ${addError.message}`);
        return;
      }
    }

    // Bureau access is pre-provisioned by email (same pattern as coach
    // invites) — works before the member ever signs up. club_function
    // holds the specific role for display today, ahead of the
    // finer-grained permissions it'll eventually drive.
    if (bureauRole !== (initialBureauRole ?? "")) {
      // En minuscules : is_club_admin() compare cet email à celui du JWT
      // au moment de la connexion — une casse différente entre les deux
      // (ex. "Cindy@..." ici, "cindy@..." tapé à l'inscription) ferait
      // échouer l'accès Bureau sans aucun message d'erreur visible.
      const email = (form.registrationEmail || member.registrationEmail || "")
        .trim()
        .toLowerCase();
      if (!email) {
        // Échouait silencieusement avant ce correctif : la modale se
        // fermait comme si tout avait été enregistré, alors que l'accès
        // Bureau n'avait jamais été écrit faute d'email à quoi le
        // rattacher. Un message clair plutôt qu'un faux succès.
        setSaving(false);
        setError(
          "Impossible d'attribuer un rôle Bureau : cette fiche n'a aucune adresse email d'inscription renseignée."
        );
        return;
      }
      const { error: bureauError } = bureauRole
        ? await supabase
            .from("club_administrators")
            .upsert(
              { email, role: "ADMIN", club_function: bureauRole },
              { onConflict: "email" }
            )
        : await supabase
            .from("club_administrators")
            .delete()
            .eq("email", email);
      if (bureauError) {
        setSaving(false);
        setError(`Accès Bureau non mis à jour : ${bureauError.message}`);
        return;
      }
    }

    // Équipes coachées affichables immédiatement (voir basePatch) :
    // resolvedProfileId détermine dans quelle table toute la liste désirée
    // vient d'être écrite ci-dessus (team_coaches si un compte est lié,
    // team_pending_coaches sinon) — même logique reprise ici, en
    // approximation suffisante pour un affichage optimiste (le prochain
    // rafraîchissement temps réel corrige silencieusement le rare écart,
    // ex. une entrée déjà "en attente" avant l'auto-rattachement du
    // compte plus haut, qui n'est pas migrée de table par ce save-ci).
    const desiredCoachTeamRefs = Array.from(desiredCoachIds)
      .map((id) => teams.find((t) => t.id === id))
      .filter((t): t is AdminMemberTeam => Boolean(t));

    setSaving(false);
    onSaved?.({
      ...basePatch,
      teams: newTeams,
      profileId: resolvedProfileId ?? profileId,
      coachTeams: resolvedProfileId ? desiredCoachTeamRefs : [],
      pendingCoachTeams: resolvedProfileId ? [] : desiredCoachTeamRefs,
      bureauRole: bureauRole || null,
    });
    onClose();
  }

  const charterBadge = (value: string | null) => (
    <span
      className={`inline-flex w-fit items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none ${
        value ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"
      }`}
    >
      {value ? "Acceptée" : "Non acceptée"}
    </span>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <h3 className="font-semibold text-zinc-900">
              {formatPersonName(member.firstName, member.lastName, "Membre")}
            </h3>
            {member.category && (
              <p className="text-xs text-zinc-500">{member.category}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={copyAppLink}
              title="Copier un lien à partager (ex: dans WhatsApp) pour revenir directement sur cette fiche"
              className="flex items-center gap-1.5 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            >
              <Copy className="h-4 w-4" />
              {linkCopied && <span className="text-xs font-medium text-emerald-600">Copié !</span>}
            </button>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-nowrap items-center gap-1 overflow-x-auto border-b border-zinc-100 px-3 py-2 md:justify-between">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-semibold transition-colors md:text-sm ${
                  active ? "bg-navy text-white" : "text-zinc-500 hover:bg-zinc-100"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div ref={tabBodyRef} className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "identity" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label="Prénom"
                value={form.firstName}
                editable={fullProfileEditable}
                onChange={(v) => set("firstName", v)}
              />
              <Field
                label="Nom"
                value={form.lastName}
                editable={fullProfileEditable}
                onChange={(v) => set("lastName", v)}
              />
              <Field
                label="Date de naissance"
                type="date"
                value={form.birthDate}
                displayValue={formatBirthDate(member.birthDate)}
                editable={fullProfileEditable}
                onChange={(v) => set("birthDate", v)}
              />
              <Field
                label="Sexe"
                value={form.sex}
                editable={fullProfileEditable}
                onChange={(v) => set("sex", v)}
                options={["Masculin", "Féminin"]}
              />
              <Field
                label="Email"
                type="email"
                value={form.registrationEmail}
                editable={editable}
                onChange={(v) => set("registrationEmail", v)}
              />
              <Field
                label="Téléphone"
                value={form.registrationPhone}
                editable={editable}
                onChange={(v) => set("registrationPhone", v)}
              />
              <Field
                label="Adresse"
                value={form.address}
                editable={editable}
                onChange={(v) => set("address", v)}
              />
              <Field
                label="Code postal"
                value={form.postalCode}
                editable={editable}
                onChange={(v) => set("postalCode", v)}
              />
              <Field
                label="Commune"
                value={form.city}
                editable={editable}
                onChange={(v) => set("city", v)}
              />
            </div>
          )}

          {tab === "family" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Retour de Cindy du 29/08 (cas de Basile LAMOURET, dont les
                  enfants ont l'email d'un tiers comme contact) : le
                  rattachement automatique par email (handle_new_user) ne
                  suffit pas toujours — ce bloc permet au Bureau de relier
                  manuellement un compte existant, avec une suggestion par
                  téléphone/email secondaire en aide, jamais appliquée
                  seule. Bureau uniquement, comme le reste des actions
                  d'affectation sur cette fiche. */}
              {editable && canManageParentLinks && (
                <ParentLinkManager
                  playerId={member.id}
                  candidatePhones={[
                    form.motherPhone,
                    form.fatherPhone,
                    form.registrationPhone,
                    // otherPhones est un champ libre multiligne (plusieurs
                    // numéros possibles) : découpé sur tout séparateur usuel.
                    ...form.otherPhones.split(/[\n,;/]+/),
                  ]}
                  candidateSecondaryEmail={form.secondaryEmail || null}
                />
              )}
              <Field
                label="Email secondaire"
                type="email"
                value={form.secondaryEmail}
                editable={editable}
                onChange={(v) => set("secondaryEmail", v)}
              />
              <div />
              <Field
                label="Mère / conjointe"
                value={form.motherPhone}
                editable={editable}
                onChange={(v) => set("motherPhone", v)}
              />
              <Field
                label="Père / conjoint"
                value={form.fatherPhone}
                editable={editable}
                onChange={(v) => set("fatherPhone", v)}
              />
              <div className="sm:col-span-2">
                <Field
                  label="Autres téléphones"
                  multiline
                  value={form.otherPhones}
                  editable={editable}
                  onChange={(v) => set("otherPhones", v)}
                />
              </div>
              <div className="sm:col-span-2">
                <Field
                  label="Adresse secondaire"
                  multiline
                  value={form.secondaryAddress}
                  editable={editable}
                  onChange={(v) => set("secondaryAddress", v)}
                />
              </div>
            </div>
          )}

          {tab === "license" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ReadOnlyField label="Catégorie">
                <span className="text-sm text-zinc-800">
                  {member.category ?? "—"}
                </span>
              </ReadOnlyField>
              {editable && canManageTeamAndRoles ? (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Équipe
                  </span>
                  <select
                    value={teamId}
                    onChange={(e) => setTeamId(e.target.value)}
                    className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                  >
                    <option value="">Aucune équipe</option>
                    {teamOptions.map((t) => (
                      <option key={t.id} value={t.id}>
                        {teamLabel(t)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {/* Équipes "en plus" de la principale (U13M ET U13M-1, par
                  exemple) : même geste additif que "Affecter à une autre
                  équipe" dans l'onglet Équipes (team-card.tsx), mais
                  accessible directement depuis la fiche — retour de Cindy
                  du 02/09, cas Raphaël LAMOURET. Uniquement quand la fiche
                  a déjà une équipe principale : sans elle, "prêter à une
                  autre équipe" n'a pas de sens. */}
              {editable && canManageTeamAndRoles && currentTeam && (
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Autre(s) équipe(s) (prêt)
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {extraTeams.map((t) => (
                      <span
                        key={t.id}
                        className="inline-flex items-center gap-1 rounded-full bg-navy/10 py-0.5 pl-2.5 pr-1 text-xs font-semibold leading-none text-navy"
                      >
                        {teamLabel(t)}
                        <button
                          type="button"
                          onClick={() => removeExtraTeam(t)}
                          disabled={removingExtraTeamId === t.id}
                          title={`Retirer de ${teamLabel(t)}`}
                          className="rounded-full p-0.5 text-navy/60 transition-colors hover:bg-navy/10 hover:text-red-600 disabled:opacity-50"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {extraTeams.length === 0 && !addingExtraTeam && (
                      <span className="text-sm text-zinc-400">Aucune</span>
                    )}
                    {addingExtraTeam ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <select
                          value={extraTeamPickId}
                          onChange={(e) => setExtraTeamPickId(e.target.value)}
                          className="rounded-lg border border-zinc-200 px-2 py-1 text-xs"
                        >
                          <option value="">Choisir une équipe...</option>
                          {addableExtraTeams.map((t) => (
                            <option key={t.id} value={t.id}>
                              {teamLabel(t)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={confirmAddExtraTeam}
                          disabled={!extraTeamPickId}
                          className="rounded-full bg-navy px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-navy/90 disabled:opacity-50"
                        >
                          Ajouter
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddingExtraTeam(false)}
                          className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      addableExtraTeams.length > 0 && (
                        <button
                          type="button"
                          onClick={openAddExtraTeam}
                          className="rounded-full border border-dashed border-navy/30 px-2.5 py-1 text-xs font-medium text-navy hover:bg-navy/5"
                        >
                          + Ajouter une équipe
                        </button>
                      )
                    )}
                  </div>
                  {extraTeamError && <p className="text-xs text-red-600">{extraTeamError}</p>}
                </div>
              )}

              {!(editable && canManageTeamAndRoles) && (
                <ReadOnlyField label="Équipe(s)">
                  <div className="flex flex-wrap gap-1">
                    {member.teams.length === 0 ? (
                      <span className="text-sm text-zinc-400">—</span>
                    ) : (
                      member.teams.map((t) => (
                        <span
                          key={t.id}
                          className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-navy/10 px-2 py-0.5 text-xs font-semibold leading-none text-navy"
                        >
                          {t.category ?? t.name ?? "Équipe"}
                        </span>
                      ))
                    )}
                  </div>
                </ReadOnlyField>
              )}

              {editable && canManageTeamAndRoles && (
                <div className="flex flex-col gap-1.5 rounded-xl border border-zinc-100 bg-zinc-50 p-3 sm:col-span-2">
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-zinc-700">
                      Ce membre est Entraîneur / Coach
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isCoach}
                      onClick={() => handleCoachToggle(!isCoach)}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                        isCoach ? "bg-navy" : "bg-zinc-300"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          isCoach ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </label>
                  {isCoach && (
                    <div
                      className={`mt-1.5 transition-opacity duration-300 ${
                        coachTeamsVisible ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                        Équipes coachées par ce membre
                      </span>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {teams.map((t) => (
                          <label
                            key={t.id}
                            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                              coachTeamIds.has(t.id)
                                ? "border-purple-300 bg-purple-100 text-purple-700"
                                : "border-zinc-200 text-zinc-600"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={coachTeamIds.has(t.id)}
                              onChange={() => toggleCoachTeam(t.id)}
                              className="h-3.5 w-3.5 rounded border-zinc-300"
                            />
                            {teamLabel(t)}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {editable && canManageTeamAndRoles && (
                <div className="flex flex-col gap-1.5 rounded-xl border-2 border-ubac-yellow/50 bg-gradient-to-br from-ubac-yellow/10 to-navy/5 p-3.5 sm:col-span-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-navy">
                    <Shield className="h-3.5 w-3.5" />
                    Rôle au Bureau / Administration
                  </span>
                  <select
                    value={bureauRole}
                    onChange={(e) => setBureauRole(e.target.value)}
                    className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm"
                  >
                    <option value="">Aucun (Par défaut)</option>
                    {bureauRoleOptions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <Field
                label="Type de licence demandée"
                value={form.licenseType}
                editable={fullProfileEditable}
                onChange={(v) => set("licenseType", v)}
                options={[
                  "Dirigeant",
                  "Joueur Compétition",
                  "Joueur Loisir (uniquement pour les séniors)",
                  "Dirigeant et Joueur Loisir (uniquement pour les séniors)",
                ]}
              />
              <Field
                label="Type d'adhésion"
                value={form.membershipType}
                editable={fullProfileEditable}
                onChange={(v) => set("membershipType", v)}
                options={["Nouvelle", "Réadhésion", "Mutation"]}
              />
              <Field
                label="Statut FBI"
                value={form.fbiStatus}
                editable={fullProfileEditable}
                onChange={(v) => set("fbiStatus", v)}
                options={[
                  "Licence générée",
                  "A valider groupement sportif",
                  "En attente saisie adhérent",
                  "En cours de saisie",
                ]}
              />
              <ReadOnlyField label="Statut Club">
                <span className="text-sm text-zinc-800">
                  {member.clubStatus ?? "—"}
                </span>
              </ReadOnlyField>
              <Field
                label="N° Licence"
                value={form.licenseNumber}
                // Réservé au Bureau (voir aussi le trigger
                // protect_sensitive_player_fields côté base, qui refuse
                // silencieusement toute autre écriture même hors de cette
                // interface) : un coach a le droit de corriger la fiche
                // pratique de ses joueurs, jamais leurs papiers officiels.
                // canEditFullProfile, pas canManageTeamAndRoles (audit du
                // 31/08) : ce dernier est coupé à false pour TOUT appelant
                // depuis l'onglet Équipes (team-card.tsx), Bureau inclus —
                // ce champ devenait alors non modifiable même pour le
                // Bureau depuis cet onglet, alors qu'il l'est depuis
                // Membres. canEditFullProfile porte la bonne distinction
                // (Bureau oui, coach non) pour ce champ précis.
                editable={fullProfileEditable}
                onChange={(v) => set("licenseNumber", v)}
              />
              <Field
                label="Licence valable jusqu'au"
                type="date"
                value={form.licenseExpiresAt}
                displayValue={formatBirthDate(member.licenseExpiresAt)}
                editable={fullProfileEditable}
                onChange={(v) => set("licenseExpiresAt", v)}
              />
            </div>
          )}

          {tab === "medical" && (
            <div className="grid grid-cols-1 gap-3">
              <Field
                label="Particularités médicales"
                multiline
                value={form.medicalNotes}
                // Réservé au Bureau, même raison — et même correctif du
                // 31/08 — que N° Licence ci-dessus.
                editable={fullProfileEditable}
                onChange={(v) => set("medicalNotes", v)}
              />
              <Field
                label="Certificat médical valable jusqu'au"
                type="date"
                value={form.medicalCertificateExpiresAt}
                displayValue={formatBirthDate(member.medicalCertificateExpiresAt)}
                editable={fullProfileEditable}
                onChange={(v) => set("medicalCertificateExpiresAt", v)}
              />
              <Field
                label="Autres informations utiles"
                multiline
                value={form.otherNotes}
                editable={fullProfileEditable}
                onChange={(v) => set("otherNotes", v)}
              />
              <Field
                label="Droit à l'image"
                value={form.imageRights}
                editable={fullProfileEditable}
                onChange={(v) => set("imageRights", v)}
                options={["Oui", "Non"]}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ReadOnlyField label="Charte Joueur">
                  {charterBadge(member.playerCharterAccepted)}
                </ReadOnlyField>
                <ReadOnlyField label="Charte Parent">
                  {charterBadge(member.parentCharterAccepted)}
                </ReadOnlyField>
              </div>
            </div>
          )}

        </div>

        {editable && (
          <div className="border-t border-zinc-100 px-5 py-3">
            {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
            <div className="flex items-center gap-2">
              {onArchive && !archivedAt && (
                <button
                  type="button"
                  onClick={() => setArchiveConfirmOpen(true)}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Archiver ce membre
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-full bg-ubac-yellow px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
              >
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={archiveConfirmOpen}
        title="Archiver ce membre ?"
        message={
          <>
            Es-tu sûr de vouloir archiver la fiche de{" "}
            <span className="font-semibold text-zinc-900">
              {formatPersonName(member.firstName, member.lastName, "ce membre")}
            </span>{" "}
            ? Elle n&apos;apparaîtra plus dans la liste par défaut, mais ses données restent
            conservées et tu peux réactiver à tout moment.
          </>
        }
        confirmLabel="Archiver"
        onConfirm={confirmArchiveClick}
        onCancel={() => setArchiveConfirmOpen(false)}
      />
    </div>
  );
}
