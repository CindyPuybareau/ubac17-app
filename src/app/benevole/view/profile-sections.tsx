"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  Contact,
  Eye,
  EyeOff,
  ExternalLink,
  Handshake,
  Home,
  LayoutDashboard,
  ListOrdered,
  MessageCircle,
  PartyPopper,
  ScrollText,
  Shield,
  ShoppingBag,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import { formatPersonName, sortByLastName } from "@/lib/names";
import type { AdminSection } from "@/app/dashboard/admin-sidebar";
import type { ChildCoach, ChildEvent, ChildTeammate } from "@/app/enfant/view/child-dashboard";
import ChildCalendarTab, { isHomeMatch } from "@/app/enfant/view/child-calendar-tab";
import ChildTeamTab from "@/app/enfant/view/child-team-tab";
import ChildResultsTab from "@/app/enfant/view/child-results-tab";
import SponsorsDisplay from "@/app/dashboard/sponsors-display";
import ClubReportsSection from "@/app/dashboard/club-reports-section";
import Cd17LigueSection from "@/app/dashboard/cd17-ligue-section";
import EmptyState from "@/app/dashboard/empty-state";
import TeamFilterDropdown from "@/app/dashboard/team-filter-dropdown";
import DocumentsPanel, { type ClubDocumentId } from "@/components/club-documents";
import { BOUTIQUE_URL } from "@/app/dashboard/boutique";
import type { ClubReport, SponsorDisplay } from "@/app/dashboard/page";
import type { ProfileCalendarEvent } from "@/lib/read-only-briques-data";
import GuestRsvpPaidEventCard from "./guest-rsvp-card";
import CommissionNeedsBlock from "./commission-needs-block";
import type { VolunteerNeed } from "@/app/dashboard/event-volunteer-needs";

// Retour de Cindy du 05/09 ("profil et bénévoles doivent être fusionnés"),
// puis du 06/09 ("un menu comme les autres espaces, pas tout les uns à la
// suite des autres") : chaque brique cochée pour ce bénévole devient sa
// propre entrée du même menu (AdminSidebar, desktop + hamburger mobile)
// que benevole-view.tsx construit, plutôt qu'un simple empilement de blocs
// sur une seule page. Aucun de ces composants n'appelle Supabase depuis le
// navigateur : ce sont les mêmes déjà utilisés en lecture seule côté
// Espace Enfant (ChildTeamTab/ChildEventsTab/ChildResultsTab) ou
// intrinsèquement sans écriture (SponsorsDisplay), et ClubReportsSection
// reçoit canCreate/isAdmin à false, ce qui masque tous ses boutons
// d'écriture — un bénévole n'a de toute façon aucune session Supabase Auth
// pour qu'une telle écriture puisse fonctionner.

export type ProfileTeam = {
  id: string;
  name: string | null;
  category: string | null;
  coaches: ChildCoach[];
  teammates: ChildTeammate[];
};

export type ProfileMember = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  category: string | null;
};

function MembersSection({ members }: { members: ProfileMember[] }) {
  const sorted = sortByLastName(members, (m) => m.lastName);
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      {sorted.length === 0 ? (
        <EmptyState icon={Contact} message="Aucun membre pour le moment." />
      ) : (
        <div className="flex flex-col gap-1">
          {sorted.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-2 border-b border-zinc-50 py-1.5 text-sm last:border-0"
            >
              <span className="text-zinc-800">{formatPersonName(m.firstName, m.lastName, "Membre")}</span>
              {m.category && (
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  {m.category}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Retour de Cindy du 06/09 ("pourquoi je n'ai pas les autres événements du
// club visibles ?") : ChildCalendarTab/ChildResultsTab ont leur propre
// sélecteur d'équipe intégré, mais en mode "une seule équipe à la fois"
// (pills, pensé pour un enfant qui ne suit que la sienne) — un
// événement club ciblant une autre équipe que celle sélectionnée
// disparaissait donc, à tort, pour un bénévole qui doit voir large. On
// filtre nous-mêmes avec TeamFilterDropdown (toutes cochées par défaut,
// comme "Équipes" ci-dessus) et on passe `teams={[]}` à ces deux
// composants pour désactiver leur propre sélecteur (ils ne l'affichent,
// et ne filtrent, qu'à partir de 2 équipes).
function eventMatchesTeams(event: ChildEvent, selectedIds: Set<string>): boolean {
  if (event.teamId) return selectedIds.has(event.teamId);
  if (event.targetTeamIds && event.targetTeamIds.length > 0) {
    return event.targetTeamIds.some((id) => selectedIds.has(id));
  }
  // Événement vraiment club-wide (ni équipe ni ciblage précis) : toujours visible.
  return true;
}

// Retour de Cindy du 10/09 (fusion Calendrier/Événements, comme sur les 4
// autres espaces) : remplace à la fois l'ancien "Calendrier" (simple grille
// sans aucun filtre) et l'ancien "Événements" (ChildEventsTab + ses
// filtres) -- les deux briques d'accès "calendrier"/"evenements"
// (access-briques.ts) donnent maintenant accès au même écran fusionné, ni
// l'une ni l'autre n'est retirée côté permissions pour ne rien changer aux
// profils déjà configurés. Le bouton "masquer les entraînements" (retour de
// Cindy du 06/09, même comportement/libellé/icônes que calendar-view.tsx)
// reste ici plutôt que dans ChildCalendarTab lui-même, partagé avec
// l'Espace Enfant qui n'a jamais eu ce bouton et n'a pas à en hériter.
function CalendarSection({
  events,
  teams,
  attendanceByEventId,
  commissionContext,
  volunteerNeedsByEventId,
}: {
  events: ProfileCalendarEvent[];
  teams: { id: string; name: string | null; category: string | null }[];
  // Retour de Cindy du 11/09 ("qui est présent/absent ?") : voir
  // read-only-briques-data.ts, gouverné par la brique "membres" -- objet
  // vide si cette brique n'est pas cochée pour cette commission/ce
  // bénévole, ChildCalendarTab n'affiche alors ni présent ni absent.
  attendanceByEventId: Record<string, { name: string | null; status: string }[]>;
  // Retour de Cindy du 25/09 ("les bénévoles doivent pouvoir cliquer sur
  // présent ou absent... quand la commission est sélectionnée") : undefined
  // côté bénévole individuel (voir benevole-view.tsx, jamais fourni --
  // commission_group_ids n'a pas de sens pour un lien qui n'est rattaché à
  // aucune commission précise). Seule CommissionView le fournit.
  commissionContext?: { token: string; groupId: string };
  // Retour de Cindy du 25/09 (suite, "regrouper les besoins en organisation
  // avec les présences") : mêmes besoins déjà calculés une fois pour
  // "Tableau de bord" (commission-view.tsx) -- undefined côté bénévole
  // individuel, comme commissionContext ci-dessus.
  volunteerNeedsByEventId?: Record<string, VolunteerNeed[]>;
}) {
  // Retour de Cindy du 25/09 ("masquer les entraînements en automatique à
  // l'ouverture") : par défaut coché ici (commission/bénévole seulement,
  // jamais touché côté Espace Enfant qui gère son propre état dans
  // child-dashboard.tsx) -- une commission/un bénévole veut d'abord voir
  // les événements qui le concernent, pas la longue liste d'entraînements.
  const [hideTrainings, setHideTrainings] = useState(true);
  // Retour de Cindy du 25/09 ("pastilles rondes dorées pour les matchs à
  // domicile, pouvoir filtrer comme le Bureau") : même principe que
  // "Domicile seulement" côté Bureau (calendar-view.tsx), même prédicat
  // (isHomeMatch, exporté par child-calendar-tab.tsx) -- jamais une
  // deuxième définition.
  const [homeOnly, setHomeOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(teams.map((t) => t.id)));
  const visibleEvents = useMemo(
    () =>
      events
        .filter((e) => !hideTrainings || e.eventType !== "TRAINING")
        .filter((e) => !homeOnly || isHomeMatch(e))
        .filter((e) => eventMatchesTeams(e, selectedIds)),
    [events, hideTrainings, homeOnly, selectedIds]
  );
  // Retour de Cindy du 12/09 ("Matchs officiels du club", "il faut que
  // tout espace qui ne soit pas bureau puisse avoir ce petit oeil") :
  // `events` ici contient déjà TOUS les matchs du club sans restriction
  // (voir read-only-briques-data.ts, requête sans filtre équipe) -- ce
  // filtre équipe-ci (TeamFilterDropdown/selectedIds) n'existe que côté
  // UI, pour ne pas noyer commissions/bénévoles sous des équipes qui ne
  // les concernent pas. Pas besoin d'un second chargement comme côté
  // Espace Enfant (dont la requête EST restreinte à ses propres équipes,
  // voir enfant/view/page.tsx) : on repasse simplement les matchs déjà en
  // main, non filtrés par équipe -- ChildCalendarTab se charge lui-même de
  // ne montrer que ceux absents de `events` (visibleEvents) une fois
  // l'œil activé, jamais un doublon.
  const clubOfficialMatches = useMemo(
    () => events.filter((e) => e.eventType === "MATCH"),
    [events]
  );
  // Retour de Cindy du 25/09 : ChildCalendarTab ne connaît que ChildEvent
  // (jamais commissionGroupIds/paymentLink) -- on retrouve ici la ligne
  // complète par id pour savoir si CETTE commission est concernée par CET
  // événement précis, avant d'injecter la carte Présent/Absent + HelloAsso.
  const eventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const renderEventExtra = commissionContext
    ? (baseEvent: ChildEvent) => {
        const full = eventsById.get(baseEvent.id);
        if (!full || !full.commissionGroupIds.includes(commissionContext.groupId)) return null;
        // Retour de Cindy du 25/09 ("regrouper les besoins en organisation
        // avec les présences, comme les autres espaces") : besoins affichés
        // SOUS la carte présent/absent, même ordre que calendar-view.tsx
        // côté Bureau/Coach (RsvpButtons puis Organisation) -- jamais de
        // bloc "Aucun besoin" vide en plus de la carte présent/absent
        // (contrairement à Tableau de bord, qui le montre toujours).
        const needs = volunteerNeedsByEventId?.[full.id] ?? [];
        return (
          <>
            <GuestRsvpPaidEventCard
              eventId={full.id}
              token={commissionContext.token}
              isPaid={full.isPaid}
              paidAmount={full.paidAmount}
              paymentLink={full.paymentLink}
              paidParticipants={full.paidParticipants}
            />
            {needs.length > 0 && <CommissionNeedsBlock needs={needs} token={commissionContext.token} />}
          </>
        );
      }
    : undefined;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* compact (retour de Cindy du 25/09, "un peu gros comparé aux
            autres espaces") : même taille que calendar-view.tsx côté
            Bureau dans ce même contexte (barre de filtre calendrier, à
            côté de "Masquer les entraînements"), jamais passé ici jusqu'ici. */}
        <TeamFilterDropdown teams={teams} selectedIds={selectedIds} onChange={setSelectedIds} compact />
        <button
          type="button"
          onClick={() => setHideTrainings((v) => !v)}
          className={`flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
            hideTrainings
              ? "border-navy/30 bg-navy/10 text-navy"
              : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50"
          }`}
        >
          {hideTrainings ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {hideTrainings ? "Entraînements masqués" : "Masquer les entraînements"}
        </button>
        {/* Retour de Cindy du 25/09 ("pouvoir filtrer comme le Bureau") :
            même esprit doré que "Domicile seulement" côté Bureau
            (event-type-filter-dropdown.tsx), ici en pastille directe --
            pas de sous-menu à dérouler pour un seul filtre. */}
        <button
          type="button"
          onClick={() => setHomeOnly((v) => !v)}
          className={`flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
            homeOnly
              ? "border-transparent bg-ubac-yellow text-navy"
              : "border-ubac-yellow bg-ubac-yellow/10 text-ubac-yellow-dark hover:bg-ubac-yellow/20"
          }`}
        >
          <Home className="h-3.5 w-3.5" />
          Domicile seulement
        </button>
      </div>
      <ChildCalendarTab
        events={visibleEvents}
        clubOfficialMatches={clubOfficialMatches}
        teams={[]}
        attendanceByEventId={attendanceByEventId}
        renderEventExtra={renderEventExtra}
      />
    </div>
  );
}

// Même correctif que EventsSection ci-dessus, pour "Matchs officiels" /
// "Résultats" -- forcedMode reste passé tel quel à ChildResultsTab (retire
// ses boutons internes, le choix se fait dans le menu).
function MatchsSection({
  events,
  teams,
  forcedMode,
}: {
  events: ChildEvent[];
  teams: { id: string; name: string | null; category: string | null }[];
  forcedMode: "officialMatches" | "officialResults";
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(teams.map((t) => t.id)));
  const visibleEvents = useMemo(
    () => events.filter((e) => eventMatchesTeams(e, selectedIds)),
    [events, selectedIds]
  );
  return (
    <div className="flex flex-col gap-3">
      <TeamFilterDropdown teams={teams} selectedIds={selectedIds} onChange={setSelectedIds} />
      <ChildResultsTab events={visibleEvents} teams={[]} forcedMode={forcedMode} />
    </div>
  );
}

// Retour de Cindy du 06/09 ("à revoir seulement dans l'onglet équipe :
// faire un onglet déroulant comme celui du bureau") : même sélecteur que
// resultsTeamSelector="dropdown" côté Bureau (TeamFilterDropdown,
// calendar-view.tsx/team-manager.tsx) -- toutes cochées par défaut, une
// carte ChildTeamTab par équipe cochée en dessous.
function EquipesSection({ teams }: { teams: ProfileTeam[] }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(teams.map((t) => t.id)));
  const visibleTeams = teams.filter((t) => selectedIds.has(t.id));

  return (
    <div className="flex flex-col gap-4">
      <TeamFilterDropdown
        teams={teams.map((t) => ({ id: t.id, name: t.name, category: t.category }))}
        selectedIds={selectedIds}
        onChange={setSelectedIds}
      />
      {visibleTeams.length === 0 ? (
        <EmptyState icon={Users} message="Aucune équipe cochée." />
      ) : (
        visibleTeams.map((t) => (
          <ChildTeamTab key={t.id} title={t.name ?? "Équipe"} coaches={t.coaches} teammates={t.teammates} />
        ))
      )}
    </div>
  );
}

// Retour de Cindy du 12/09 ("Tableau de bord (lecture seule)" ->
// "compteurs simples uniquement") : 4 chiffres, jamais de montant ni de
// nom -- voir read-only-briques-data.ts pour leur calcul. Même habillage
// de carte que MembersSection/EquipesSection ci-dessus, une grille de
// pastilles plutôt que le tableau de KpiCard du vrai Tableau de bord
// Bureau (bureau-dashboard.tsx), qui reste hors de portée ici.
function DashboardSection({
  counts,
}: {
  counts: {
    memberCount: number;
    teamCount: number;
    upcomingEventCount: number;
    birthdaysThisWeekCount: number;
  };
}) {
  const items: { icon: LucideIcon; label: string; value: number }[] = [
    { icon: Contact, label: "Membres", value: counts.memberCount },
    { icon: Users, label: "Équipes", value: counts.teamCount },
    { icon: CalendarDays, label: "Événements à venir", value: counts.upcomingEventCount },
    { icon: PartyPopper, label: "Anniversaires cette semaine", value: counts.birthdaysThisWeekCount },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex flex-col items-center gap-1.5 rounded-2xl border border-zinc-100 bg-white p-4 text-center shadow-sm"
        >
          <item.icon className="h-5 w-5 shrink-0 text-navy" />
          <span className="text-2xl font-bold text-zinc-900">{item.value}</span>
          <span className="text-xs text-zinc-500">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

const iconClass = "h-4 w-4 shrink-0";

// Construit les entrées de menu correspondant aux briques cochées pour ce
// bénévole (voir benevole-view.tsx, qui les assemble avec "Mes
// événements" et "Règlement intérieur"). Les 3 catégories de comptes
// rendus sont regroupées dans une seule entrée "Comptes rendus" -- même
// principe de regroupement que l'onglet "Documents" du Bureau.
export function buildProfileSections({
  allowedBriques,
  teams,
  teamRefs,
  members,
  events,
  sponsors,
  clubReports,
  whatsappGroups,
  whatsappDirectory = [],
  dashboardCounts = null,
  attendanceByEventId,
  commissionContext,
  volunteerNeedsByEventId,
}: {
  allowedBriques: string[];
  // Réservé à la section "Équipes" (roster + coachs) -- gouverné par la
  // brique "equipes" (read-only-briques-data.ts), donc souvent vide (voir
  // teamRefs juste en dessous pour le sélecteur de Calendrier/Matchs, qui
  // ne doit PAS dépendre de cette même brique).
  teams: ProfileTeam[];
  // Retour de Cindy du 24/09 ("masquer/voir les entraînements et Toutes
  // les équipes ne fonctionnent pas sur ces espaces") : sélecteur
  // d'équipe DE Calendrier/Matchs -- indépendant de la brique "equipes"
  // (profileTeamRefs, read-only-briques-data.ts), pour qu'un profil qui
  // n'a que "calendrier" coché garde un filtre par équipe fonctionnel au
  // lieu d'un menu vide qui masquait presque tous les événements.
  teamRefs: { id: string; name: string | null; category: string | null }[];
  members: ProfileMember[];
  // Un seul jeu de données pour "evenements" ET "matchs_resultats" : les
  // deux composants ci-dessous filtrent déjà chacun de leur côté par
  // eventType (voir child-calendar-tab.tsx/child-results-tab.tsx), même
  // convention que côté Espace Enfant.
  events: ProfileCalendarEvent[];
  sponsors: SponsorDisplay[];
  clubReports: ClubReport[];
  // Retour de Cindy du 06/09 ("je ne vois pas dans Vie du club son groupe
  // WhatsApp") : jamais conditionné par une brique, voir benevole-view.tsx.
  // Le(s) groupe(s) que CETTE personne rejoint déjà elle-même -- distinct
  // de whatsappDirectory ci-dessous.
  whatsappGroups: { id: string; name: string; inviteLink: string | null }[];
  // Retour de Cindy du 12/09 ("Groupes WhatsApp") : annuaire de TOUS les
  // groupes du club (équipes + commissions), gouverné par la brique
  // "whatsapp_groups" -- voir read-only-briques-data.ts.
  whatsappDirectory?: { id: string; name: string; inviteLink: string | null }[];
  // Retour de Cindy du 12/09 ("Tableau de bord (lecture seule)") : voir
  // DashboardSection ci-dessus et read-only-briques-data.ts -- null tant
  // que "tableau_de_bord" n'est pas coché.
  dashboardCounts?: {
    memberCount: number;
    teamCount: number;
    upcomingEventCount: number;
    birthdaysThisWeekCount: number;
  } | null;
  // Retour de Cindy du 11/09 ("qui est présent/absent ?") : voir
  // read-only-briques-data.ts, gouverné par la brique "membres".
  attendanceByEventId: Record<string, { name: string | null; status: string }[]>;
  // Retour de Cindy du 25/09 : voir son commentaire sur CalendarSection --
  // undefined pour un bénévole individuel (benevole-view.tsx), fourni
  // uniquement par CommissionView.
  commissionContext?: { token: string; groupId: string };
  // Retour de Cindy du 25/09 (suite) : voir son commentaire sur
  // CalendarSection -- undefined côté bénévole individuel.
  volunteerNeedsByEventId?: Record<string, VolunteerNeed[]>;
}): AdminSection[] {
  const has = (b: string) => allowedBriques.includes(b);
  const sections: AdminSection[] = [];

  // Retour de Cindy du 10/09 (fusion Calendrier/Événements) : une seule
  // entrée de menu "Calendrier" désormais, accessible dès que l'une ou
  // l'autre des deux briques ("calendrier" OU "evenements") est cochée --
  // aucun profil déjà configuré ne perd l'accès qu'il avait. Contenu
  // fusionné dans CalendarSection (filtre équipe + "masquer les
  // entraînements", qui vivaient jusqu'ici uniquement sur l'ancien onglet
  // "Événements").
  if (has("calendrier") || has("evenements")) {
    sections.push({
      key: "calendrier",
      label: "Calendrier",
      icon: <CalendarDays className={iconClass} />,
      content: (
        <CalendarSection
          events={events}
          teams={teamRefs}
          attendanceByEventId={attendanceByEventId}
          commissionContext={commissionContext}
          volunteerNeedsByEventId={volunteerNeedsByEventId}
        />
      ),
    });
  }

  // Retour de Cindy du 12/09 ("Tableau de bord (lecture seule)") : juste
  // après Calendrier, comme dans le vrai menu Bureau (admin-view.tsx).
  if (has("tableau_de_bord") && dashboardCounts) {
    sections.push({
      key: "tableau-de-bord",
      label: "Tableau de bord",
      icon: <LayoutDashboard className={iconClass} />,
      content: <DashboardSection counts={dashboardCounts} />,
    });
  }

  if (has("membres")) {
    sections.push({
      key: "membres",
      label: "Membres",
      icon: <Contact className={iconClass} />,
      content: <MembersSection members={members} />,
    });
  }

  if (has("equipes")) {
    sections.push({
      key: "equipes",
      label: "Équipes",
      icon: <Users className={iconClass} />,
      content: <EquipesSection teams={teams} />,
    });
  }

  // Retour de Cindy du 10/09 (fusion Calendrier/Événements) : l'entrée de
  // menu "Événements" séparée qui vivait ici est retirée -- voir le bloc
  // "calendrier" plus haut, qui couvre maintenant les deux briques.

  if (has("matchs_resultats")) {
    // Retour de Cindy du 06/09 ("le menu 'Matchs & Résultats' avec deux
    // sous-menus, comme les autres espaces") : vrai sous-menu (children)
    // plutôt qu'un seul écran avec les boutons Matchs officiels/Résultats
    // internes à ChildResultsTab -- forcedMode retire ces boutons internes
    // puisque le choix se fait désormais dans le menu, même principe que
    // admin-view.tsx (matches-official/matches-results).
    sections.push({
      key: "matchs",
      label: "Matchs & Résultats",
      icon: <Trophy className={iconClass} />,
      content: null,
      children: [
        {
          key: "matchs-officiels",
          label: "Matchs officiels",
          icon: <Shield className={iconClass} />,
          content: <MatchsSection events={events} teams={teamRefs} forcedMode="officialMatches" />,
        },
        {
          key: "matchs-resultats",
          label: "Résultats",
          icon: <ListOrdered className={iconClass} />,
          content: <MatchsSection events={events} teams={teamRefs} forcedMode="officialResults" />,
        },
      ],
    });
  }

  // Retour de Cindy du 06/09 ("comme pour le bureau... le même menu mais
  // sélectionnable et sur mesure : groupe whatsapp, documents, sponsors,
  // boutique") : vrai sous-menu "Vie du club" (children), comme côté
  // Bureau (admin-view.tsx), pas un seul écran qui empile tout. Chaque
  // sous-entrée apparaît indépendamment des autres -- Documents et
  // Boutique toujours là (comme le Règlement intérieur qu'il contient),
  // Sponsors et le(s) groupe(s) WhatsApp seulement s'il y a quelque chose
  // à y montrer.
  // Retour de Cindy du 12/09 ("pouvoir sélectionner les documents visibles
  // ou non -- cases à cocher pour tous les docs en sous-menu de
  // document") : chacune des 3 chartes/règlement a désormais SA PROPRE
  // brique (avant : Règlement Intérieur seul, toujours affiché, aucune
  // charte) -- même logique que les comptes rendus juste en dessous, qui
  // avaient déjà ce grain-là. "Documents" lui-même disparaît du menu si
  // aucune des 7 briques n'est cochée, plutôt que d'afficher une page
  // vide.
  const documentIds: ClubDocumentId[] = [
    ...(has("charte_joueur") ? (["charte-joueur"] as const) : []),
    ...(has("charte_parent") ? (["charte-parent"] as const) : []),
    ...(has("reglement_interieur") ? (["reglement-interieur"] as const) : []),
  ];
  const hasAnyDocumentBrique =
    documentIds.length > 0 ||
    has("compte_rendu_mairies") ||
    has("compte_rendu_bureau") ||
    has("compte_rendu_coachs") ||
    has("compte_rendu_cd17_ligue");
  const documentsChild: AdminSection | null = !hasAnyDocumentBrique
    ? null
    : {
        key: "documents",
        label: "Documents",
        icon: <ScrollText className={iconClass} />,
        content: (
          <div className="flex flex-col gap-4">
            {has("compte_rendu_mairies") && (
              <ClubReportsSection
                category="MAIRIE"
                title="Comptes rendus mairies"
                emptyLabel="Aucun compte rendu de réunion avec une mairie pour le moment."
                canCreate={false}
                isAdmin={false}
                reports={clubReports}
              />
            )}
            {has("compte_rendu_bureau") && (
              <ClubReportsSection
                category="BUREAU"
                title="Comptes rendus bureau"
                emptyLabel="Aucun compte rendu de réunion du Bureau pour le moment."
                canCreate={false}
                isAdmin={false}
                reports={clubReports}
              />
            )}
            {has("compte_rendu_coachs") && (
              <ClubReportsSection
                category="COACH"
                title="Comptes rendus des coachs"
                emptyLabel="Aucun compte rendu de coach pour le moment."
                canCreate={false}
                isAdmin={false}
                showAuthor
                reports={clubReports}
              />
            )}
            {/* Cd17LigueSection, pas ClubReportsSection : ce sont de vrais
                fichiers déposés tels quels (jamais rédigés dans l'appli),
                voir le commentaire en tête de cd17-ligue-section.tsx --
                canUpload=false y masque déjà "Déposer" ET "Supprimer". */}
            {has("compte_rendu_cd17_ligue") && (
              <Cd17LigueSection canUpload={false} reports={clubReports} />
            )}
            {documentIds.length > 0 && <DocumentsPanel documentIds={documentIds} />}
          </div>
        ),
      };

  const vieDuClubChildren: AdminSection[] = [
    ...(whatsappGroups.length > 0
      ? [
          {
            key: "whatsapp-groups",
            label: whatsappGroups.length > 1 ? "Groupes WhatsApp" : "Groupe WhatsApp",
            icon: <MessageCircle className={iconClass} />,
            content: (
              <div className="flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <MessageCircle className="h-3.5 w-3.5 text-navy" />
                  {whatsappGroups.length > 1 ? "Tes groupes WhatsApp" : "Ton groupe WhatsApp"}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {whatsappGroups.map((g) =>
                    g.inviteLink ? (
                      <a
                        key={g.id}
                        href={g.inviteLink}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-1.5 rounded-full bg-emerald-500 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {g.name}
                      </a>
                    ) : (
                      <span
                        key={g.id}
                        className="flex items-center justify-center gap-1.5 rounded-full bg-zinc-50 px-3.5 py-2 text-sm font-medium text-zinc-400"
                      >
                        {g.name} — lien non renseigné
                      </span>
                    )
                  )}
                </div>
              </div>
            ),
          },
        ]
      : []),
    // Retour de Cindy du 12/09 ("Groupes WhatsApp") : annuaire de TOUS les
    // groupes du club (équipes + commissions), distinct du bloc "Ton/tes
    // groupe(s)" ci-dessus (celui d'une personne précise, jamais
    // conditionné). Celui-ci est gouverné par la brique "whatsapp_groups"
    // -- vide tant qu'elle n'est pas cochée (whatsappDirectory=[] par
    // défaut).
    ...(has("whatsapp_groups") && whatsappDirectory.length > 0
      ? [
          {
            key: "whatsapp-directory",
            label: "Groupes WhatsApp",
            icon: <MessageCircle className={iconClass} />,
            content: (
              <div className="flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <MessageCircle className="h-3.5 w-3.5 text-navy" />
                  Groupes WhatsApp du club
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {whatsappDirectory.map((g) =>
                    g.inviteLink ? (
                      <a
                        key={g.id}
                        href={g.inviteLink}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-1.5 rounded-full bg-emerald-500 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {g.name}
                      </a>
                    ) : (
                      <span
                        key={g.id}
                        className="flex items-center justify-center gap-1.5 rounded-full bg-zinc-50 px-3.5 py-2 text-sm font-medium text-zinc-400"
                      >
                        {g.name} — lien non renseigné
                      </span>
                    )
                  )}
                </div>
              </div>
            ),
          },
        ]
      : []),
    ...(documentsChild ? [documentsChild] : []),
    ...(has("sponsors")
      ? [
          {
            key: "sponsors",
            label: "Sponsors",
            icon: <Handshake className={iconClass} />,
            content: <SponsorsDisplay sponsors={sponsors} />,
          },
        ]
      : []),
    // Un simple lien externe (retour de Cindy du 06/09) : toujours
    // proposé, comme côté Bureau -- même principe que Documents/Règlement
    // intérieur, jamais conditionné par une brique.
    {
      key: "boutique",
      label: "Boutique en ligne",
      icon: <ShoppingBag className={iconClass} />,
      content: null,
      href: BOUTIQUE_URL,
    },
  ];

  sections.push({
    key: "vie-du-club",
    label: "Vie du club",
    icon: <Building2 className={iconClass} />,
    content: null,
    children: vieDuClubChildren,
  });

  return sections;
}
