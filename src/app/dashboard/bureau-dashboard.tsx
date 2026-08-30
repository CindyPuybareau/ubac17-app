import { FileWarning, Gavel, Handshake, Users, Wallet } from "lucide-react";
import { formatPersonName } from "@/lib/names";
import { formatLocalDateFr } from "@/lib/local-date";
import { balanceDue, computeStatus, formatAmount } from "./cotisation-shared";
import AutomationSettings, { type AutomationKey } from "./automation-settings";
import DeferredCalendar from "./deferred-calendar";
import type {
  AdminMemberTeam,
  AdminBenevole,
  AdminCotisation,
  AdminMember,
  AdminPenalite,
  AdminSponsor,
  AdminUpcomingEvent,
} from "./page";
import type { BirthdaySource } from "./birthdays";
import type { EventRoleType } from "./event-tasks";
import type { VolunteerNeed } from "./event-volunteer-needs";

// Fenêtre "à surveiller" — même horizon que /api/cron/expiry-alerts (30
// jours), pour que le tableau de bord et le rappel automatique par email
// parlent toujours des mêmes personnes.
const EXPIRY_WINDOW_DAYS = 30;

function isExpiringSoon(dateStr: string | null) {
  if (!dateStr) return false;
  const windowEnd = new Date();
  windowEnd.setDate(windowEnd.getDate() + EXPIRY_WINDOW_DAYS);
  windowEnd.setHours(23, 59, 59, 999);
  // Pas de borne basse : une échéance déjà dépassée reste à traiter, pas
  // seulement celles encore à venir.
  return new Date(dateStr).getTime() <= windowEnd.getTime();
}

function KpiCard({
  icon: Icon,
  iconClass,
  value,
  label,
}: {
  icon: typeof Wallet;
  iconClass: string;
  value: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
      <Icon className={`h-5 w-5 shrink-0 ${iconClass}`} />
      <p className="text-xl font-bold text-zinc-900 sm:text-2xl">{value}</p>
      <p className="text-xs font-medium leading-tight text-zinc-500">{label}</p>
    </div>
  );
}

// Vue d'ensemble condensée, pensée pour répondre en un coup d'œil à "quoi
// de neuf, où est-ce que ça coince ?" sans avoir à ouvrir 3 onglets —
// jusqu'ici le Bureau atterrissait directement sur Calendrier, sans aucun
// résumé. Entièrement dérivée des données déjà chargées pour les autres
// onglets (cotisations, membres, équipes, calendrier) : aucune requête
// supplémentaire pour cette première version.
export default function BureauDashboard({
  cotisations,
  members,
  events,
  automationSettings,
  createTeams,
  birthdayMembers,
  eventRoles,
  volunteerNeedsByEventId,
  sponsors,
  penalites,
  benevoles,
}: {
  cotisations: AdminCotisation[];
  members: AdminMember[];
  events: AdminUpcomingEvent[];
  automationSettings: Record<AutomationKey, boolean>;
  // Le calendrier complet vit désormais sous ce résumé plutôt que dans son
  // propre onglet séparé (retour de Cindy du 2026-08-21 : "l'onglet
  // accueil devrait être calendrier et intégrer l'onglet existant
  // 'calendrier'") — mêmes props que l'ancien onglet Calendrier du Bureau.
  createTeams: AdminMemberTeam[];
  birthdayMembers: BirthdaySource[];
  eventRoles: EventRoleType[];
  volunteerNeedsByEventId: Record<string, VolunteerNeed[]>;
  // Retour de Cindy du 29/08 ("je ne vois pas comment ajouter des
  // bénévoles") : jamais transmis jusqu'ici à ce composant, alors que
  // c'est depuis CET onglet "Calendrier" (le tout premier) que les
  // événements se créent réellement — la section "Bénévoles invités" de
  // CreateEventForm existait déjà, mais n'avait tout simplement jamais
  // reçu de bénévoles à afficher sur cet onglet précis (elle est bien
  // câblée sur "Événements"/"Matchs officiels"/"Résultats").
  benevoles: AdminBenevole[];
  // Remplace la carte "Documents à renouveler" (retour de Cindy du
  // 2026-08-22 : "pas d'intérêt") — voir sponsors-manager.tsx pour la
  // gestion complète (ajout/modification/suppression).
  sponsors: AdminSponsor[];
  // Nouvelle carte "Pénalités" (retour de Cindy du 2026-08-22), juste
  // après "Montant en attente" — même famille de chiffre (un montant en
  // euros restant à encaisser), voir penalites-manager.tsx pour la saisie.
  penalites: AdminPenalite[];
}) {
  // Même périmètre que l'onglet Cotisations & Licences (KpiHeader) : les
  // stages/événements/boutique (collecteId non nul) ont leur propre suivi
  // dans l'onglet Collectes, pas la peine de les mélanger ici.
  const seasonCotisations = cotisations.filter((c) => !c.collecteId);
  const pending = seasonCotisations.filter((c) => {
    const status = computeStatus(c);
    return status === "EN_ATTENTE" || status === "PARTIEL";
  });
  const pendingAmount = pending.reduce((sum, c) => sum + balanceDue(c), 0);

  const activeMembers = members.filter((m) => !m.archivedAt).length;

  // Retour de Cindy du 30/08 : "Pénalités" seul ne disait pas si c'était le
  // total ou juste le restant à encaisser — remplacé par le total de
  // TOUTES les pénalités du club (réglées ou non), libellé "Total
  // pénalités" pour lever l'ambiguïté. Le détail réglé/non réglé reste
  // visible pénalité par pénalité dans l'onglet Pénalités
  // (penalites-manager.tsx).
  const penalitesTotalAmount = penalites.reduce((sum, p) => sum + p.amount, 0);

  // Même fenêtre "à surveiller" que les licences/certificats médicaux
  // ci-dessous : un sponsor sans date de renouvellement connue n'apparaît
  // jamais ici (rien à surveiller tant que la date n'est pas négociée).
  const sponsorsNeedingRenewal = sponsors.filter((s) => isExpiringSoon(s.renewalDate));

  const membersWithExpiringDocs = members.filter(
    (m) =>
      !m.archivedAt &&
      (isExpiringSoon(m.licenseExpiresAt) || isExpiringSoon(m.medicalCertificateExpiresAt))
  );

  return (
    <div className="flex flex-col gap-4">
      <AutomationSettings settings={automationSettings} />

      {/* Retour de Cindy du 2026-08-22 : "Équipes sans coach" retirée
          (pas d'intérêt) ; "Documents à renouveler" devenue
          "Renouvellement Sponsors" ; carte "Pénalités" ajoutée juste après
          "Montant en attente" (nouvelles fonctionnalités, voir
          sponsors-manager.tsx / penalites-manager.tsx) — grille passée de
          5 à 5 cartes (4 puis +1, jamais 6 : "Équipes sans coach" partie
          en a laissé la place). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          icon={Wallet}
          iconClass="text-rose-600"
          value={String(pending.length)}
          label="Cotisations en attente"
        />
        <KpiCard
          icon={Wallet}
          iconClass="text-amber-700"
          value={formatAmount(pendingAmount)}
          label="Montant en attente"
        />
        <KpiCard
          icon={Gavel}
          iconClass="text-rose-600"
          value={formatAmount(penalitesTotalAmount)}
          label="Total pénalités"
        />
        <KpiCard
          icon={Handshake}
          iconClass="text-orange-600"
          value={String(sponsorsNeedingRenewal.length)}
          label="Renouvellement Sponsors"
        />
        <KpiCard
          icon={Users}
          iconClass="text-navy"
          value={String(activeMembers)}
          label="Membres actifs"
        />
      </div>

      {sponsorsNeedingRenewal.length > 0 && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-orange-800">
            <Handshake className="h-3.5 w-3.5 shrink-0" />
            Sponsors à renouveler (30 jours)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sponsorsNeedingRenewal.map((s) => (
              <span
                key={s.id}
                className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-orange-800 shadow-sm"
              >
                {s.name}
                {s.renewalDate ? ` · ${formatLocalDateFr(s.renewalDate)}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Rappel par email envoyé automatiquement seulement si l'interrupteur
          "Alertes licence & certificat médical" ci-dessus est activé (voir
          /api/cron/bureau-alerts) — ce bloc reste un aperçu Bureau utile
          même désactivé, pour relancer soi-même sans attendre. */}
      {membersWithExpiringDocs.length > 0 && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-orange-800">
            <FileWarning className="h-3.5 w-3.5 shrink-0" />
            Licences / certificats médicaux à renouveler (30 jours)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {membersWithExpiringDocs.map((m) => (
              <span
                key={m.id}
                className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-orange-800 shadow-sm"
              >
                {formatPersonName(m.firstName, m.lastName, "Membre")}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Calendrier complet, sous les cotisations/montants en attente : plus
          d'onglet "Calendrier" séparé. La carte "Prochain événement"
          affichée ici a été retirée (retour de Cindy du 2026-08-23,
          "on simplifie le visuel") — le calendrier ci-dessous, avec son
          panneau "Aujourd'hui" sous la grille, suffit à retrouver le
          prochain rendez-vous sans doublon. */}
      <DeferredCalendar
        events={events}
        createTeams={createTeams}
        allowClubWide
        birthdayMembers={birthdayMembers}
        eventRoles={eventRoles}
        volunteerNeedsByEventId={volunteerNeedsByEventId}
        benevoles={benevoles}
      />
    </div>
  );
}
