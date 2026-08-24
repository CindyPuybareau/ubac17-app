"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  Flag,
  ListOrdered,
  LogOut,
  MessageCircle,
  Shield,
  ShoppingBag,
  Trophy,
  Users,
} from "lucide-react";
import { BOUTIQUE_URL } from "./boutique";
import { avatarColor } from "@/lib/avatar-color";
import { sortTeamsByGroup } from "@/lib/teams";
import CalendarView, { type CalendarRsvpPlayer } from "./calendar-view";
import FamilyTeamCard, { type FamilyTeamCardData } from "./family-team-card";
import FamilyAttendanceRequests from "./family-attendance-requests";
import FamilyAttendanceSummary from "./family-attendance-summary";
import CalendarSubscribe from "./calendar-subscribe";
import FamilyCotisationCard from "./family-cotisation-card";
import PenalitesCard from "./penalites-card";
import ChildAccessManager from "./child-access-manager";
import AdminSidebar, { type AdminSection } from "./admin-sidebar";
import WhatsAppGroupsFamily from "./whatsapp-groups-family";
import type { AdminCotisation, AdminPenalite, AdminUpcomingEvent, WhatsAppGroup } from "./page";
import type { BirthdaySource } from "./birthdays";
import type { CarpoolOffer, EventRoleType, EventTasksState } from "./event-tasks";
import type { VolunteerNeed } from "./event-volunteer-needs";

// Navigation à 2 onglets, zéro redondance : "Planning & Matchs" concentre
// tout ce qui est chronologique (prochain rendez-vous en tête, puis tous
// les événements à venir avec la même carte interactive partout), "Mon
// Équipe" concentre tout ce qui est identitaire (qui coache, qui joue,
// où en est la cotisation). Plus aucune donnée n'apparaît sous deux formes
// différentes selon l'onglet où on se trouve.
export default function FamilyView({
  events,
  rsvpPlayers,
  rsvpStatusByKey,
  birthdayMembers,
  teamCards,
  tasksByEventId,
  carpoolByEventId,
  whatsappGroups,
  eventRoles,
  volunteerNeedsByEventId,
  cotisations,
  penalites,
}: {
  events: AdminUpcomingEvent[];
  rsvpPlayers: CalendarRsvpPlayer[];
  rsvpStatusByKey: Record<string, string>;
  birthdayMembers: BirthdaySource[];
  teamCards: FamilyTeamCardData[];
  tasksByEventId: Record<string, EventTasksState>;
  carpoolByEventId: Record<string, CarpoolOffer[]>;
  whatsappGroups: WhatsAppGroup[];
  eventRoles: EventRoleType[];
  // Besoins en bénévoles (buvette, table de marque...) des événements club
  // ciblés/ouverts à tous — affichés en lecture "Je m'en occupe" seulement,
  // jamais en gestion (réservée au Bureau, voir admin-view.tsx).
  volunteerNeedsByEventId: Record<string, VolunteerNeed[]>;
  cotisations: AdminCotisation[];
  // Lecture seule (retour de Cindy du 2026-08-22) : toutes celles de tous
  // les enfants, saisies par le Bureau (voir penalites-manager.tsx).
  penalites: AdminPenalite[];
}) {
  const iconClass = "h-4 w-4 shrink-0";

  // Sélecteur d'enfant : n'a de sens qu'à partir de deux. Avec un seul
  // enfant, une puce unique ne ferait qu'occuper de la place.
  // Retour de Cindy du 2026-08-22 : plus de vue "Tous" combinée — avec
  // plusieurs enfants, un seul est affiché à la fois, jamais mélangé.
  // Présélectionne le premier enfant plutôt que null (qui signifiait
  // "Tous" avant ce changement).
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(
    () => rsvpPlayers[0]?.id ?? null
  );
  const hasSeveralChildren = rsvpPlayers.length > 1;
  const visiblePlayers = useMemo(
    () =>
      selectedPlayerId ? rsvpPlayers.filter((p) => p.id === selectedPlayerId) : rsvpPlayers,
    [rsvpPlayers, selectedPlayerId]
  );

  // Un événement concerne la famille s'il vise l'équipe d'un des enfants
  // affichés, tout le club (teamId et targetTeamIds tous deux null), ou
  // réserve l'événement à quelques équipes dont une correspond à un enfant
  // affiché (targetTeamIds, voir 20261012000000) — sans ce dernier cas, un
  // enfant sélectionné seul dans une famille à plusieurs enfants pouvait
  // encore voir un événement réservé à l'équipe d'un AUTRE de ses frères et
  // sœurs, teamId étant null dans les deux cas (club entier ou ciblé).
  const visibleTeamIds = useMemo(
    () => new Set(visiblePlayers.flatMap((p) => p.teamIds)),
    [visiblePlayers]
  );
  const visibleEvents = useMemo(
    () =>
      events.filter((e) => {
        if (e.teamId) return visibleTeamIds.has(e.teamId);
        if (e.targetTeamIds) return e.targetTeamIds.some((id) => visibleTeamIds.has(id));
        return true;
      }),
    [events, visibleTeamIds]
  );
  const visibleTeamCards = useMemo(() => {
    const cards = selectedPlayerId
      ? teamCards.filter((c) => c.playerId === selectedPlayerId)
      : teamCards;
    // Même ordre que côté coach : l'équipe mère avant ses déclinaisons.
    return sortTeamsByGroup(cards.map((c) => ({ ...c, name: c.teamName })));
  }, [teamCards, selectedPlayerId]);

  // Sélecteur d'équipe de la vue Résultats (voir calendar-view.tsx) : une
  // famille à plusieurs enfants sur des équipes différentes a exactement
  // le même besoin qu'un coach sur "Mes Équipes" — dédoublonné par
  // équipe, un enfant sur 2 équipes ou 2 enfants sur la même n'y
  // apparaissant qu'une fois.
  const visibleResultsTeams = useMemo(() => {
    const byTeamId = new Map<string, { id: string; name: string | null; category: string | null }>();
    visibleTeamCards.forEach((c) => {
      if (!byTeamId.has(c.teamId)) {
        byTeamId.set(c.teamId, { id: c.teamId, name: c.teamName, category: c.category });
      }
    });
    return Array.from(byTeamId.values());
  }, [visibleTeamCards]);

  const visiblePlayerIds = useMemo(() => visiblePlayers.map((p) => p.id), [visiblePlayers]);
  const visibleCotisations = useMemo(
    () => cotisations.filter((c) => visiblePlayerIds.includes(c.playerId)),
    [cotisations, visiblePlayerIds]
  );
  const visiblePenalites = useMemo(
    () => penalites.filter((p) => visiblePlayerIds.includes(p.playerId)),
    [penalites, visiblePlayerIds]
  );
  // Un groupe "Équipe" ne concerne qu'une seule équipe : il ne s'affiche
  // que si cette équipe fait partie de l'enfant/des enfants actuellement
  // sélectionnés. Les groupes "Commission" (Buvette...) ne sont rattachés
  // à aucune équipe — ils restent visibles quel que soit l'enfant choisi,
  // sans quoi sélectionner un enfant en particulier ferait perdre l'accès
  // à un groupe où le parent est membre pour une tout autre raison.
  const visibleWhatsappGroups = useMemo(
    () =>
      whatsappGroups.filter(
        (g) => g.category === "COMMISSION" || (g.teamId !== null && visibleTeamIds.has(g.teamId))
      ),
    [whatsappGroups, visibleTeamIds]
  );

  // Même logique que les groupes WhatsApp ci-dessus : un anniversaire ne
  // reste affiché (puce du calendrier ET bloc "Anniversaires de la
  // semaine", tous deux dérivés de ce même tableau à l'intérieur de
  // CalendarView) que s'il appartient à une équipe de l'enfant/des enfants
  // actuellement sélectionnés — sinon, sélectionner Raphaël montrerait
  // quand même l'anniversaire d'une coéquipière de Léonie.
  const visibleBirthdayMembers = useMemo(
    () => birthdayMembers.filter((m) => m.teamIds?.some((id) => visibleTeamIds.has(id))),
    [birthdayMembers, visibleTeamIds]
  );

  const sections: AdminSection[] = [
    {
      key: "planning",
      // "Planning & Matchs" se faisait tronquer en "Planning & M..." dans
      // la barre du bas mobile (retour de Cindy du 2026-08-21) —
      // "Calendrier" tout court, comme dans les 3 autres espaces
      // (Bureau/Coach/Enfant), en plus d'être cohérent partout.
      label: "Calendrier",
      icon: <CalendarDays className={iconClass} />,
      content: (
        <div className="flex flex-col gap-4">
          {/* Carte "Prochaine convocation" retirée (retour de Cindy du
              2026-08-23, "on simplifie le visuel") : le calendrier
              ci-dessous, avec son panneau "Aujourd'hui" sous la grille,
              montre déjà le prochain rendez-vous — présences, itinéraire
              et rôles/covoiturage restent accessibles depuis sa propre
              carte, sans ce doublon en tête de page.
              Le bandeau "Cette semaine" (introduit dans la même passe)
              retiré à son tour (retour de Cindy du 2026-08-24, "pas
              necessaire") — CalendarView seul suffit. */}
          <CalendarView
            events={visibleEvents}
            rsvp={{ players: visiblePlayers, statusByKey: rsvpStatusByKey }}
            birthdayMembers={visibleBirthdayMembers}
            tasksByEventId={tasksByEventId}
            carpoolByEventId={carpoolByEventId}
            eventRoles={eventRoles}
            volunteerNeedsByEventId={volunteerNeedsByEventId}
          />
          <CalendarSubscribe />
          <ChildAccessManager />
        </div>
      ),
    },
    {
      // Au pluriel si l'enfant sélectionné (ou l'ensemble des enfants,
      // sans sélection) joue dans plusieurs équipes — retour de Cindy du
      // 2026-08-22, même logique que "Équipe"/"Équipes" côté Coach.
      key: "teams",
      label: visibleTeamCards.length > 1 ? "Mes Équipes" : "Mon Équipe",
      icon: <Users className={iconClass} />,
      content: (
        <div className="flex flex-col gap-4">
          {visibleTeamCards.map((c) => (
            <FamilyTeamCard key={`${c.playerId}-${c.teamId}`} card={c} />
          ))}
          {visibleTeamCards.length === 0 && (
            <p className="text-sm text-zinc-500">Aucune équipe rattachée pour le moment.</p>
          )}

          {/* Les groupes WhatsApp appartiennent à l'équipe : les chercher
              dans un onglet séparé revenait à quitter la page où on vient
              justement de lire qui sont les coachs. */}
          <div className="flex flex-col gap-2 border-t border-zinc-100 pt-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
              Discussions WhatsApp
            </p>
            <WhatsAppGroupsFamily groups={visibleWhatsappGroups} />
          </div>

          {/* Deux encarts discrets, en pied de page : la situation
              administrative n'a rien à faire mêlée au planning, mais
              reste à portée d'un scroll depuis l'écran "identité". */}
          <div className="grid grid-cols-1 gap-4 border-t border-zinc-100 pt-4 sm:grid-cols-2 lg:grid-cols-3">
            <FamilyCotisationCard cotisations={visibleCotisations} />
            <FamilyAttendanceSummary
              events={visibleEvents}
              players={visiblePlayers}
              rsvpStatusByKey={rsvpStatusByKey}
            />
            <PenalitesCard
              title="Mes pénalités"
              penalites={visiblePenalites}
              showPlayerName={hasSeveralChildren}
              emptyLabel="Aucune pénalité."
            />
          </div>
        </div>
      ),
    },
    {
      // Retour de Cindy du 2026-08-22 : "Événements & Résultats" éclaté en
      // deux onglets, même découpage que côté Bureau/Coach (calendar-view.tsx)
      // — "Événements" pour tout le calendrier du club sauf les matchs
      // officiels, "Matchs & Résultats" pour les matchs officiels et
      // leurs résultats (bouton interne "Matchs officiels"/"Résultats").
      key: "events",
      label: "Événements",
      icon: <Flag className={iconClass} />,
      content: (
        <CalendarView
          events={visibleEvents}
          rsvp={{ players: visiblePlayers, statusByKey: rsvpStatusByKey }}
          forcedView="clubEvents"
          resultsTeams={visibleResultsTeams.map((t) => ({ ...t, role: "PLAYER" as const }))}
        />
      ),
    },
    {
      // Retour de Cindy du 2026-08-22 : "Matchs officiels" / "Résultats"
      // deviennent un vrai sous-menu au lieu d'un bouton interne sur la
      // page — même traitement que côté Bureau/Coach.
      key: "matches",
      label: "Matchs & Résultats",
      icon: <Trophy className={iconClass} />,
      content: null,
      children: [
        {
          key: "matches-official",
          label: "Matchs officiels",
          icon: <Shield className={iconClass} />,
          content: (
            <CalendarView
              events={visibleEvents}
              rsvp={{ players: visiblePlayers, statusByKey: rsvpStatusByKey }}
              forcedView="officialMatches"
              resultsTeams={visibleResultsTeams.map((t) => ({ ...t, role: "PLAYER" as const }))}
            />
          ),
        },
        {
          key: "matches-results",
          label: "Résultats",
          icon: <ListOrdered className={iconClass} />,
          content: (
            <CalendarView
              events={visibleEvents}
              rsvp={{ players: visiblePlayers, statusByKey: rsvpStatusByKey }}
              forcedView="officialResults"
              resultsTeams={visibleResultsTeams.map((t) => ({ ...t, role: "PLAYER" as const }))}
            />
          ),
        },
      ],
    },
    {
      // Un lien externe, pas un onglet de contenu (voir href sur AdminSection).
      key: "boutique",
      label: "Boutique en ligne",
      icon: <ShoppingBag className={iconClass} />,
      content: null,
      href: BOUTIQUE_URL,
    },
    {
      // Tout à la fin du menu (retour de Cindy du 2026-08-22) — déplacé
      // depuis la bande bleue.
      key: "logout",
      label: "Déconnexion",
      icon: <LogOut className={iconClass} />,
      content: null,
      logoutAction: "supabase",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* En tête de page et hors des onglets : une demande du coach doit
          se voir en ouvrant l'app, pas se découvrir en fouillant. */}
      <FamilyAttendanceRequests
        events={visibleEvents}
        players={visiblePlayers}
        statusByKey={rsvpStatusByKey}
      />

      <AdminSidebar
        sections={sections}
        // Retour de Cindy du 2026-08-22 : le sélecteur d'enfant doit vivre
        // au-dessus du contenu de l'onglet actif (ex. juste au-dessus de
        // "Prochaine convocation" dans Calendrier), pas au-dessus de toute
        // la page ni du menu — même emplacement que les autres sélecteurs
        // pill de l'appli (TeamSelectorPills), via contentHeader plutôt
        // qu'un bloc affiché avant AdminSidebar.
        contentHeader={
          hasSeveralChildren ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Enfant
              </span>
              {rsvpPlayers.map((p) => {
                const isActive = selectedPlayerId === p.id;
                const color = avatarColor(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlayerId(p.id)}
                    className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm font-medium transition-colors ${
                      isActive
                        ? "border-navy/30 bg-navy/10 ring-2 ring-navy/20"
                        : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    {/* Photo de l'enfant si elle existe (players.avatar_url,
                        mise en ligne depuis son propre Espace Enfant),
                        sinon repli sur une initiale colorée — même
                        principe que les coéquipiers dans child-team-tab.tsx.
                        Retour de Cindy du 2026-08-24 : "faire comme la
                        capture en y incrémentant les images qu'ils
                        mettent sur leur espace". */}
                    {p.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.avatarUrl}
                        alt=""
                        className="h-6 w-6 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${color}`}
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className={isActive ? "font-semibold text-navy" : ""}>{p.name}</span>
                  </button>
                );
              })}
            </div>
          ) : undefined
        }
      />
    </div>
  );
}
