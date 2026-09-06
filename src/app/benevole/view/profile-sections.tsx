"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  Contact,
  Eye,
  EyeOff,
  Flag,
  Handshake,
  ListOrdered,
  ScrollText,
  Shield,
  Trophy,
  Users,
} from "lucide-react";
import { formatPersonName, sortByLastName } from "@/lib/names";
import type { AdminSection } from "@/app/dashboard/admin-sidebar";
import type { ChildCoach, ChildEvent, ChildTeammate } from "@/app/enfant/view/child-dashboard";
import ChildCalendarTab from "@/app/enfant/view/child-calendar-tab";
import ChildTeamTab from "@/app/enfant/view/child-team-tab";
import ChildEventsTab from "@/app/enfant/view/child-events-tab";
import ChildResultsTab from "@/app/enfant/view/child-results-tab";
import SponsorsDisplay from "@/app/dashboard/sponsors-display";
import ClubReportsSection from "@/app/dashboard/club-reports-section";
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
        <p className="text-sm text-zinc-500">Aucun membre pour le moment.</p>
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

// Retour de Cindy du 06/09 ("ajouter aussi comme sur les autres espaces le
// bouton 'masquer les entraînements'") : même comportement/libellé/icônes
// que calendar-view.tsx (hideTrainings), appliqué ici en amont de
// ChildEventsTab plutôt que dans ce composant partagé avec l'Espace
// Enfant, qui n'a jamais eu ce bouton et n'a pas à en hériter.
function EventsSection({
  events,
  teams,
}: {
  events: ChildEvent[];
  teams: { id: string; name: string | null; category: string | null }[];
}) {
  const [hideTrainings, setHideTrainings] = useState(false);
  const visibleEvents = useMemo(
    () => (hideTrainings ? events.filter((e) => e.eventType !== "TRAINING") : events),
    [events, hideTrainings]
  );
  return (
    <div className="flex flex-col gap-3">
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
      <ChildEventsTab events={visibleEvents} teams={teams} />
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
}): AdminSection[] {
  const has = (b: string) => allowedBriques.includes(b);
  const teamRefs = teams.map((t) => ({ id: t.id, name: t.name, category: t.category }));
  const sections: AdminSection[] = [];

  // Retour de Cindy du 06/09 ("ajouter le calendrier aussi") : même donnée
  // que "Événements"/"Matchs & Résultats" (déjà chargée), affichée cette
  // fois en grille mensuelle plutôt qu'en liste -- ChildCalendarTab est
  // purement présentatif (voir son propre commentaire), aucun appel
  // Supabase.
  if (has("calendrier")) {
    sections.push({
      key: "calendrier",
      label: "Calendrier",
      icon: <CalendarDays className={iconClass} />,
      content: <ChildCalendarTab events={events} />,
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
      content: (
        <div className="flex flex-col gap-4">
          {teams.map((t) => (
            <ChildTeamTab key={t.id} title={t.name ?? "Équipe"} coaches={t.coaches} teammates={t.teammates} />
          ))}
        </div>
      ),
    });
  }

  if (has("evenements")) {
    sections.push({
      key: "evenements-club",
      label: "Événements",
      icon: <Flag className={iconClass} />,
      content: <EventsSection events={events} teams={teamRefs} />,
    });
  }

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
          content: <ChildResultsTab events={events} teams={teamRefs} forcedMode="officialMatches" />,
        },
        {
          key: "matchs-resultats",
          label: "Résultats",
          icon: <ListOrdered className={iconClass} />,
          content: <ChildResultsTab events={events} teams={teamRefs} forcedMode="officialResults" />,
        },
      ],
    });
  }

  if (has("sponsors")) {
    sections.push({
      key: "sponsors",
      label: "Sponsors",
      icon: <Handshake className={iconClass} />,
      content: <SponsorsDisplay sponsors={sponsors} />,
    });
  }

  if (has("compte_rendu_mairies") || has("compte_rendu_bureau") || has("compte_rendu_coachs")) {
    sections.push({
      key: "comptes-rendus",
      label: "Comptes rendus",
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
        </div>
      ),
    });
  }

  return sections;
}
