"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  MessageCircle,
  ScrollText,
  Shield,
  ShoppingBag,
  Trophy,
  Users,
} from "lucide-react";
import DocumentsPanel from "@/components/club-documents";
import { BOUTIQUE_URL } from "./boutique";
import { avatarColor } from "@/lib/avatar-color";
import { sortTeamsByGroup, groupTeamsByPrimarySecondary } from "@/lib/teams";
import CalendarView, { type CalendarRsvpPlayer } from "./calendar-view";
import FamilyTeamCard, { type FamilyTeamCardData } from "./family-team-card";
import FamilyAttendanceRequests from "./family-attendance-requests";
import PendingRsvpPopup, { type PendingRsvpItem } from "./pending-rsvp-popup";
import RsvpButtons from "./rsvp-buttons";
import FamilyAttendanceSummary from "./family-attendance-summary";
import CalendarSubscribe from "./calendar-subscribe";
import FamilyCotisationCard from "./family-cotisation-card";
import PenalitesCard from "./penalites-card";
import ChildAccessManager from "./child-access-manager";
import AdminSidebar, { type AdminSection } from "./admin-sidebar";
import WhatsAppGroupsFamily from "./whatsapp-groups-family";
import WhatsAppGroupsManager from "./whatsapp-groups-manager";
import SponsorsDisplay from "./sponsors-display";
import type {
  AdminCotisation,
  AdminPenalite,
  AdminUpcomingEvent,
  SponsorDisplay,
  WhatsAppGroup,
} from "./page";
import type { BirthdaySource } from "./birthdays";
import type { CarpoolOffer, EventRoleType, EventTasksState } from "./event-tasks";
import type { VolunteerNeed } from "./event-volunteer-needs";

// Retour de Cindy du 07/09 ("2 jours avant l'événement") : la popup ne
// doit pas surgir pour un événement encore lointain, seulement une fois
// l'échéance proche.
const RSVP_POPUP_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

// Fonction ordinaire (voir son appel dans FamilyView) : la lecture de
// l'heure courante reste hors du corps du composant, règle
// react-hooks/purity -- même principe que pendingRequests dans
// family-attendance-requests.tsx.
function computePendingRsvpItems(
  players: CalendarRsvpPlayer[],
  events: AdminUpcomingEvent[],
  statusByKey: Record<string, string>
): PendingRsvpItem[] {
  const nowMs = Date.now();
  return players
    .map((p): PendingRsvpItem | null => {
      const nextEvent = events
        .filter((e) => {
          const startMs = new Date(e.start_time).getTime();
          return startMs >= nowMs && startMs - nowMs <= RSVP_POPUP_WINDOW_MS;
        })
        .filter((e) =>
          e.teamId || e.targetTeamIds
            ? (e.teamId && p.teamIds.includes(e.teamId)) ||
              (e.targetTeamIds?.some((id) => p.teamIds.includes(id)) ?? false)
            : true
        )
        .sort((a, b) => a.start_time.localeCompare(b.start_time))[0];
      if (!nextEvent) return null;
      const status = statusByKey[`${nextEvent.id}:${p.id}`];
      if (status === "PRESENT" || status === "ABSENT" || status === "LATE") return null;
      return {
        id: p.id,
        name: p.name,
        event: {
          id: nextEvent.id,
          title: nextEvent.title,
          event_type: nextEvent.event_type,
          start_time: nextEvent.start_time,
          location: nextEvent.location,
          salle: nextEvent.salle,
        },
      };
    })
    .filter((item): item is PendingRsvpItem => item !== null);
}

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
  sponsorDisplay = [],
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
  sponsorDisplay?: SponsorDisplay[];
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
  // Retour de Cindy du 06/09 (Sandrine MANZELLE, Bureau + joueuse + maman :
  // "Mon équipe" puis "Mes enfants" affichait tout vide, et vice versa) :
  // ce composant est réutilisé tel quel pour "Mon équipe" ET "Mes enfants"
  // (voir page.tsx, buildFamilyView) — l'initialisation paresseuse
  // ci-dessus ne s'exécute qu'au tout premier montage, jamais si les props
  // changent ensuite (React réutilisait la même instance en changeant
  // seulement `rsvpPlayers` d'un onglet à l'autre). `selectedPlayerId`
  // pointait alors vers un id de l'AUTRE onglet, absent de la nouvelle
  // liste : le filtre ci-dessous ne trouvait donc plus personne, vidant
  // tout l'écran sans le moindre message. Recalculé ici plutôt qu'un
  // useEffect (même principe que activeTeamIdResolved dans
  // child-results-tab.tsx) : si l'id sélectionné n'existe plus dans
  // rsvpPlayers, on retombe sur le premier de la liste au lieu de rester
  // bloqué sur une sélection fantôme.
  const resolvedSelectedPlayerId = rsvpPlayers.some((p) => p.id === selectedPlayerId)
    ? selectedPlayerId
    : (rsvpPlayers[0]?.id ?? null);
  const hasSeveralChildren = rsvpPlayers.length > 1;
  const visiblePlayers = useMemo(
    () =>
      resolvedSelectedPlayerId
        ? rsvpPlayers.filter((p) => p.id === resolvedSelectedPlayerId)
        : rsvpPlayers,
    [rsvpPlayers, resolvedSelectedPlayerId]
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
  // Retour de Cindy du 05/09 (Basile : "Mes enfants" affichait SES PROPRES
  // équipes Séniors 1/M) : teamCards porte les équipes de TOUTE la famille
  // (parent inclus, voir page.tsx) -- ce composant n'en reçoit qu'un
  // sous-ensemble via rsvpPlayers ("Mon équipe" ou "Mes enfants"), jamais
  // filtré par appartenance avant ce jour. Sans ce filtre, le cas où
  // rsvpPlayers est vide (ici : les deux enfants de Basile sont déjà
  // couverts par "Équipes coachées", donc exclus d'ici -- règle existante,
  // pas nouvelle) faisait tomber `selectedPlayerId` à `null`, et l'ancien
  // repli "personne sélectionné -> tout montrer" affichait alors TOUTES les
  // équipes de la famille sans distinction, y compris celles du parent.
  // rsvpPlayerIds borne désormais teamCards à ce que CETTE instance
  // (Mon équipe ou Mes enfants) a vraiment le droit de montrer, avant même
  // de tenir compte d'une sélection précise.
  const rsvpPlayerIds = useMemo(() => new Set(rsvpPlayers.map((p) => p.id)), [rsvpPlayers]);
  const visibleTeamCards = useMemo(() => {
    const scoped = teamCards.filter((c) => rsvpPlayerIds.has(c.playerId));
    const cards = resolvedSelectedPlayerId
      ? scoped.filter((c) => c.playerId === resolvedSelectedPlayerId)
      : scoped;
    // Même ordre que côté coach : l'équipe mère avant ses déclinaisons.
    return sortTeamsByGroup(cards.map((c) => ({ ...c, name: c.teamName })));
  }, [teamCards, rsvpPlayerIds, resolvedSelectedPlayerId]);

  // Sélecteur d'équipe de la vue Résultats (voir calendar-view.tsx) : une
  // famille à plusieurs enfants sur des équipes différentes a exactement
  // le même besoin qu'un coach sur "Mes Équipes" — dédoublonné par
  // équipe, un enfant sur 2 équipes ou 2 enfants sur la même n'y
  // apparaissant qu'une fois.
  // Retour de Cindy du 11/09 ("équipe principale/secondaire") : fusionne
  // une équipe principale (ex. U13M) avec la ou les secondaires de la
  // famille dans le même groupe (U13M-1, U13M-2) en un seul onglet --
  // memberTeamIds porte alors les vraies équipes représentées (voir
  // calendar-view.tsx, matchesTeamFilter). Déjà prêt pour resultsTeams
  // (role "PLAYER" toujours, jamais "COACH" côté Famille), donc plus
  // besoin de re-mapper à chaque appel de CalendarView plus bas.
  const visibleResultsTeams = useMemo(() => {
    const byTeamId = new Map<string, { id: string; name: string | null; category: string | null }>();
    visibleTeamCards.forEach((c) => {
      if (!byTeamId.has(c.teamId)) {
        byTeamId.set(c.teamId, { id: c.teamId, name: c.teamName, category: c.category });
      }
    });
    return groupTeamsByPrimarySecondary(Array.from(byTeamId.values())).map(
      ({ primary, secondaries }) => ({
        id: primary.id,
        name: primary.name,
        category: primary.category,
        role: "PLAYER" as const,
        memberTeamIds:
          secondaries.length > 0 ? [primary.id, ...secondaries.map((s) => s.id)] : undefined,
      })
    );
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
  // sélectionnés. Retour de Cindy du 29/08 ("je ne veux que le groupe
  // whatsapp de l'équipe concerné") : les groupes "Commission"
  // (Buvette...) ne s'affichent plus mêlés ici, quel que soit l'enfant
  // choisi — ils vivent maintenant dans leur propre onglet "Groupes
  // WhatsApp" plus bas, pour ne jamais perdre l'accès à un groupe où l'on
  // est membre pour une tout autre raison que l'équipe affichée ici.
  const visibleWhatsappGroups = useMemo(
    () => whatsappGroups.filter((g) => g.teamId !== null && visibleTeamIds.has(g.teamId)),
    [whatsappGroups, visibleTeamIds]
  );

  // Retour de Cindy du 2026-09-01 : l'onglet "Groupes WhatsApp" ci-dessous
  // ne montre jamais que les commissions (showTeamGroups=false) — s'il n'y
  // en a aucune de configurée, il n'affichait qu'un "Aucun groupe." sans
  // aucun autre contenu, un onglet mort pour rien. Visible seulement dès
  // qu'au moins une commission existe.
  const hasCommissionGroups = whatsappGroups.some((g) => g.category === "COMMISSION");

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

  // Retour de Cindy du 07/09 ("une popup ... sur l'événement à venir afin
  // que les gens n'oublient pas de répondre") : pour CHAQUE enfant (tous,
  // pas seulement celui actuellement sélectionné par la pastille
  // ci-dessus -- rsvpPlayers au complet, pas visiblePlayers), son tout
  // prochain événement s'il n'a pas encore de réponse. "Mon équipe" et
  // "Mes enfants" utilisant tous deux ce composant (voir page.tsx,
  // buildFamilyView), ça couvre aussi un coach qui joue ailleurs -- sa
  // convocation personnelle (retirée de "Planning & Rôles" le 07/09) reste
  // ainsi rappelée ici, à sa vraie place. Fonction ordinaire (comme
  // pendingRequests dans family-attendance-requests.tsx) plutôt qu'un
  // useMemo : la lecture de l'heure courante doit rester hors du corps du
  // composant (règle react-hooks/purity).
  const pendingRsvpItems = computePendingRsvpItems(rsvpPlayers, events, rsvpStatusByKey);

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
            // Retour de Cindy du 10/09 (fusion Calendrier/Événements) :
            // manquait ici alors que "Événements" (retiré plus bas) l'avait
            // déjà -- une famille avec plusieurs enfants dans des équipes
            // différentes n'avait aucun filtre par équipe sur son
            // Calendrier, seulement sur "Événements".
            resultsTeams={visibleResultsTeams}
            celebrateWins
          />
          <SponsorsDisplay sponsors={sponsorDisplay} />
        </div>
      ),
    },
    {
      // Retour de Cindy du 10/09 ("alléger l'onglet calendrier") : Accès à
      // l'espace enfant + lien d'abonnement agenda quittent le Calendrier
      // pour ce nouvel onglet, volontairement second dans la liste (jamais
      // premier — l'ouverture de l'appli doit toujours se faire sur
      // "Calendrier", voir admin-sidebar.tsx : le premier onglet du
      // tableau est l'onglet actif par défaut). Premier contenu d'un
      // onglet pensé pour accueillir d'autres blocs secondaires plus tard.
      key: "dashboard",
      label: "Tableau de bord",
      icon: <LayoutDashboard className={iconClass} />,
      content: (
        <div className="flex flex-col gap-4">
          <ChildAccessManager />
          <CalendarSubscribe />
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
    // Retour de Cindy du 10/09 (fusion Calendrier/Événements) : l'onglet
    // "Événements" qui vivait ici est retiré -- son filtre par équipe
    // (resultsTeams) a été reporté sur "Calendrier" ci-dessus, sa carte
    // d'événement (renderEventCard) était déjà strictement identique à
    // celle de "Calendrier".
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
              resultsTeams={visibleResultsTeams}
              volunteerNeedsByEventId={volunteerNeedsByEventId}
              celebrateWins
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
              resultsTeams={visibleResultsTeams}
              volunteerNeedsByEventId={volunteerNeedsByEventId}
              celebrateWins
            />
          ),
        },
      ],
    },
    // Retour de Cindy du 29/08 : les groupes "Commission" (Buvette,
    // Coachs UBAC...) ne sont plus mêlés à "Mon équipe"/"Mon enfant" (voir
    // visibleWhatsappGroups plus haut) — un parent/joueur membre d'une
    // commission sans être aussi au Bureau (seul espace avec l'équivalent
    // "Vie du club") a donc besoin de son propre accès. showTeamGroups=false :
    // la grille "Équipes du Club" resterait vide de sens ici, chaque équipe
    // a déjà son groupe sur sa propre carte plus haut. Onglet entier retiré
    // (retour du 2026-09-01) tant qu'aucune commission n'est configurée —
    // voir hasCommissionGroups.
    ...(hasCommissionGroups
      ? [
          {
            key: "whatsapp",
            label: "Groupes WhatsApp",
            icon: <MessageCircle className={iconClass} />,
            content: <WhatsAppGroupsManager groups={whatsappGroups} showTeamGroups={false} />,
          },
        ]
      : []),
    {
      // Retour de Cindy du 25/08 : Charte du Joueur + Charte du Parent +
      // Règlement Intérieur — ce sont les parents qui portent la
      // responsabilité légale pour un enfant mineur, voir club-documents.tsx.
      key: "documents",
      label: "Documents",
      icon: <ScrollText className={iconClass} />,
      content: (
        <DocumentsPanel documentIds={["charte-joueur", "charte-parent", "reglement-interieur"]} />
      ),
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
      <PendingRsvpPopup
        items={pendingRsvpItems}
        renderActions={(item, onAnswered) => (
          <RsvpButtons
            eventId={item.event.id}
            playerId={item.id}
            currentStatus="PENDING"
            onStatusChange={(_, newStatus) => {
              if (newStatus !== "PENDING") onAnswered();
            }}
          />
        )}
      />

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
              {/* Retour de Cindy du 12/09 ("ce texte plat... un signet
                  sympa") : même habillage que le badge "Espace Bureau"
                  (admin-view.tsx) plutôt qu'un simple texte gris, pour
                  rester assorti au reste de l'appli. Pluriel/singulier
                  selon le nombre réel d'enfants -- même principe que le
                  libellé de l'onglet "Mon enfant"/"Mes enfants"
                  (page.tsx) ; en pratique toujours au pluriel ici, ce
                  bloc n'existant que si hasSeveralChildren. */}
              <span className="inline-flex w-fit items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-ubac-yellow/15 px-3 py-1 text-xs font-semibold uppercase leading-none text-ubac-yellow-dark">
                <Users className="h-3.5 w-3.5 shrink-0" />
                {rsvpPlayers.length > 1 ? "Mes enfants" : "Enfant"}
              </span>
              {rsvpPlayers.map((p) => {
                const isActive = resolvedSelectedPlayerId === p.id;
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
