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
  ListOrdered,
  MessageCircle,
  ScrollText,
  Shield,
  ShoppingBag,
  Trophy,
  Users,
} from "lucide-react";
import { formatPersonName, sortByLastName } from "@/lib/names";
import type { AdminSection } from "@/app/dashboard/admin-sidebar";
import type { ChildCoach, ChildEvent, ChildTeammate } from "@/app/enfant/view/child-dashboard";
import ChildCalendarTab from "@/app/enfant/view/child-calendar-tab";
import ChildTeamTab from "@/app/enfant/view/child-team-tab";
import ChildResultsTab from "@/app/enfant/view/child-results-tab";
import SponsorsDisplay from "@/app/dashboard/sponsors-display";
import ClubReportsSection from "@/app/dashboard/club-reports-section";
import EmptyState from "@/app/dashboard/empty-state";
import TeamFilterDropdown from "@/app/dashboard/team-filter-dropdown";
import DocumentsPanel from "@/components/club-documents";
import { BOUTIQUE_URL } from "@/app/dashboard/boutique";
import type { ClubReport, SponsorDisplay } from "@/app/dashboard/page";

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
}: {
  events: ChildEvent[];
  teams: { id: string; name: string | null; category: string | null }[];
}) {
  const [hideTrainings, setHideTrainings] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(teams.map((t) => t.id)));
  const visibleEvents = useMemo(
    () =>
      events
        .filter((e) => !hideTrainings || e.eventType !== "TRAINING")
        .filter((e) => eventMatchesTeams(e, selectedIds)),
    [events, hideTrainings, selectedIds]
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <TeamFilterDropdown teams={teams} selectedIds={selectedIds} onChange={setSelectedIds} />
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
      </div>
      <ChildCalendarTab events={visibleEvents} teams={[]} />
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

const iconClass = "h-4 w-4 shrink-0";

// Construit les entrées de menu correspondant aux briques cochées pour ce
// bénévole (voir benevole-view.tsx, qui les assemble avec "Mes
// événements" et "Règlement intérieur"). Les 3 catégories de comptes
// rendus sont regroupées dans une seule entrée "Comptes rendus" -- même
// principe de regroupement que l'onglet "Documents" du Bureau.
export function buildProfileSections({
  allowedBriques,
  teams,
  members,
  events,
  sponsors,
  clubReports,
  whatsappGroups,
}: {
  allowedBriques: string[];
  teams: ProfileTeam[];
  members: ProfileMember[];
  // Un seul jeu de données pour "evenements" ET "matchs_resultats" : les
  // deux composants ci-dessous filtrent déjà chacun de leur côté par
  // eventType (voir child-events-tab.tsx/child-results-tab.tsx), même
  // convention que côté Espace Enfant.
  events: ChildEvent[];
  sponsors: SponsorDisplay[];
  clubReports: ClubReport[];
  // Retour de Cindy du 06/09 ("je ne vois pas dans Vie du club son groupe
  // WhatsApp") : jamais conditionné par une brique, voir benevole-view.tsx.
  whatsappGroups: { id: string; name: string; inviteLink: string | null }[];
}): AdminSection[] {
  const has = (b: string) => allowedBriques.includes(b);
  const teamRefs = teams.map((t) => ({ id: t.id, name: t.name, category: t.category }));
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
      content: <CalendarSection events={events} teams={teamRefs} />,
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
  const documentsChild: AdminSection = {
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
        {/* Retour de Cindy du 25/08 : "penser en 360° avec les bénévoles,
            ils font partie de la boucle" — mêmes règles de respect/fair-
            play que sur le terrain les concernent aussi. Règlement
            Intérieur uniquement (pas les deux chartes, propres aux
            licenciés/parents d'un licencié). */}
        <DocumentsPanel documentIds={["reglement-interieur"]} />
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
    documentsChild,
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
