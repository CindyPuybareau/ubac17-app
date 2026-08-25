"use client";

import {
  BarChart3,
  Cake,
  CalendarDays,
  Flag,
  ListOrdered,
  LogOut,
  ScrollText,
  Shield,
  Trophy,
  Users,
} from "lucide-react";
import type { AdminSection } from "@/app/dashboard/admin-sidebar";
import DocumentsPanel from "@/components/club-documents";
import OrgChartButton from "@/app/dashboard/org-chart-button";
import PenalitesCard from "@/app/dashboard/penalites-card";
import type { PlayerYearStatus } from "@/lib/season";
import ChildAvatarUpload from "./child-avatar-upload";
import ChildTileMenu from "./child-tile-menu";
import { formatFirstName } from "@/lib/names";
import { localDateFromParts } from "@/lib/local-date";
import ChildCalendarTab from "./child-calendar-tab";
import ChildTeamTab from "./child-team-tab";
import ChildEventsTab from "./child-events-tab";
import ChildResultsTab from "./child-results-tab";
import ChildPresenceTab from "./child-presence-tab";
import ChildNotificationBell, { type ChildNotification } from "./child-notification-bell";
import WeekStripBanner, { type WeekStripEvent } from "@/app/dashboard/week-strip-banner";

export type ChildEvent = {
  id: string;
  title: string | null;
  eventType: string | null;
  isHome: boolean | null;
  location: string | null;
  salle: string | null;
  startTime: string;
  endTime: string | null;
  teamId: string | null;
  teamName: string | null;
  teamScore: number | null;
  opponentScore: number | null;
  // Badge "Payant" seulement (retour de Cindy du 2026-08-25) : jamais de
  // lien de paiement affiché ici, voir le commentaire sur isPaid dans
  // enfant/view/page.tsx.
  isPaid: boolean;
};

export type ChildTeammate = {
  id: string;
  firstName: string | null;
  // Retour de Cindy du 2026-08-25 : le nom de famille des coéquipiers est
  // désormais affiché dans l'onglet "Mon Équipe" (confirmé explicitement,
  // question posée vu que c'était jusqu'ici délibérément masqué). La date
  // de naissance, elle, reste neutralisée (voir birthDate) — décision
  // distincte, non remise en cause.
  lastName: string | null;
  birthDate: string | null;
  jerseyNumber: number | null;
  position: string | null;
  isSelf: boolean;
  // Catégorie de L'ÉQUIPE de cette ligne (pas la fiche joueur, parfois
  // obsolète — même règle que team-card.tsx côté Bureau/Coach).
  teamCategory: string | null;
  // Calculé côté serveur avec la vraie date de naissance (voir
  // enfant/view/page.tsx) — jamais recalculé côté client à partir de
  // birthDate, volontairement neutralisée ci-dessus.
  yearStatus: PlayerYearStatus | null;
};

export type ChildCoach = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  teamCategory: string | null;
};

export type ChildAttendanceStats = { present: number; total: number };

// Pas de playerId/playerName ici (contrairement à AdminPenalite) : un
// enfant ne voit jamais que SES propres pénalités — voir PenalitesCard
// (dashboard/penalites-card.tsx, réutilisée telle quelle, même précédent
// que OrgChartButton/MobileNavProvider importés depuis dashboard/).
export type ChildPenalite = {
  id: string;
  amount: number;
  notes: string | null;
  penaliteDate: string | null;
  statut: string | null;
};

// Un seul composant, jamais un import de createClient() nulle part dans
// cet arbre : chaque onglet ne fait que présenter les props reçues de
// page.tsx (déjà lues en service_role côté serveur). Aucune écriture
// n'est donc possible même en théorie — pas de bouton RSVP, pas de champ
// éditable, pas de lien WhatsApp.
export default function ChildDashboard({
  firstName,
  avatarUrl,
  category,
  teams,
  ownJersey,
  events,
  teammates,
  coaches,
  presence,
  nextEvent,
  nextEventAttendance,
  notifications,
  notificationsEnabled,
  penalites,
}: {
  firstName: string | null;
  avatarUrl: string | null;
  category: string | null;
  teams: { id: string; name: string | null; category: string | null }[];
  ownJersey: { jersey: number | null; position: string | null } | null;
  events: ChildEvent[];
  teammates: ChildTeammate[];
  coaches: ChildCoach[];
  presence: { trainings: ChildAttendanceStats; matches: ChildAttendanceStats };
  // Calculé côté serveur (page.tsx), source unique — plus recalculé ici
  // en double (retour de Cindy du 2026-08-25 : les présences quittent
  // l'onglet "Mon Équipe" pour rejoindre "Événements"/"Matchs officiels",
  // les deux ont donc besoin de savoir lequel est LE prochain rendez-vous).
  nextEvent: ChildEvent | null;
  nextEventAttendance: { name: string | null; status: string }[];
  notifications: ChildNotification[];
  notificationsEnabled: boolean;
  // Lecture seule (retour de Cindy du 2026-08-22, "près de Bilan de
  // présence") : saisies par le Bureau, jamais modifiables ici.
  penalites: ChildPenalite[];
}) {
  const teammatesOnly = teammates.filter((t) => !t.isSelf);

  // Même bandeau "Cette semaine" que côté Coach/Parent (retour de Cindy du
  // 2026-08-24), fondu dans l'en-tête bleu — voir week-strip-banner.tsx.
  const headerWeekEvents: WeekStripEvent[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    eventType: e.eventType,
    startTime: e.startTime,
    location: e.location,
    salle: e.salle,
    isHome: e.isHome,
    teamName: e.teamName,
  }));

  const thisMonth = new Date().getMonth();
  const birthdaysThisMonth = teammatesOnly
    .map((t) => ({ teammate: t, birth: t.birthDate ? localDateFromParts(t.birthDate) : null }))
    .filter((x): x is { teammate: ChildTeammate; birth: Date } => x.birth !== null && x.birth.getMonth() === thisMonth)
    .sort((a, b) => a.birth.getDate() - b.birth.getDate());

  const iconClass = "h-4 w-4 shrink-0";
  // "Accueil" a été retiré (redondant avec ce que Calendrier montre
  // maintenant en tête de page) et "Défis" a laissé la place à "Mes
  // Présences", un vrai bilan d'assiduité plutôt qu'un système de badges.
  // "Résultats" a rejoint le lot en onglet séparé (repris pendant un
  // temps dans Mon Équipe, mais Cindy voulait un onglet à part entière,
  // comme côté Bureau/Coach/Parents). Calendrier est délibérément en
  // premier : AdminSidebar ouvre toujours sur sections[0], c'est donc lui
  // la page d'accueil désormais.
  const sections: AdminSection[] = [
    {
      key: "calendar",
      label: "Calendrier",
      icon: <CalendarDays className={iconClass} />,
      content: (
        <div className="flex flex-col gap-4">
          {/* Carte "Prochain événement" retirée (retour de Cindy du
              2026-08-23, "on simplifie le visuel") : le calendrier
              ci-dessous, avec son panneau "Aujourd'hui" sous la grille,
              montre déjà le prochain rendez-vous, sans ce doublon en tête
              de page. */}
          {birthdaysThisMonth.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4 shadow-sm">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
                <Cake className="h-3.5 w-3.5 shrink-0 animate-pulse" />
                Anniversaires du mois
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {birthdaysThisMonth.map(({ teammate, birth }) => (
                  <span
                    key={teammate.id}
                    className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 shadow-sm"
                  >
                    {formatFirstName(teammate.firstName)} · {birth.getDate()}
                  </span>
                ))}
              </div>
            </div>
          )}

          <ChildCalendarTab events={events} teammates={teammates} />
        </div>
      ),
    },
    {
      key: "team",
      label: "Mon Équipe",
      icon: <Users className={iconClass} />,
      content: (
        <ChildTeamTab coaches={coaches} teammates={teammates} />
      ),
    },
    {
      key: "presence",
      label: "Mes Présences",
      icon: <BarChart3 className={iconClass} />,
      content: (
        <div className="flex flex-col gap-4">
          <ChildPresenceTab trainings={presence.trainings} matches={presence.matches} />
          <PenalitesCard
            title="Mes pénalités"
            penalites={penalites}
            emptyLabel="Aucune pénalité."
          />
        </div>
      ),
    },
    {
      // Retour de Cindy du 2026-08-22 : "Événements & Résultats" éclaté en
      // deux onglets, même découpage que côté Bureau/Coach/Parent
      // (calendar-view.tsx) — "Événements" pour tout le calendrier du
      // club sauf les matchs officiels, "Matchs & Résultats" pour les
      // matchs officiels et leurs résultats.
      key: "events",
      label: "Événements",
      icon: <Flag className={iconClass} />,
      content: (
        <ChildEventsTab
          events={events}
          teams={teams}
          nextEventId={nextEvent?.id ?? null}
          nextEventAttendance={nextEventAttendance}
        />
      ),
    },
    {
      // Retour de Cindy du 2026-08-22 : "Matchs officiels" / "Résultats"
      // deviennent un vrai sous-menu au lieu d'un bouton interne sur la
      // page — même traitement que côté Bureau/Coach/Parent.
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
            <ChildResultsTab
              events={events}
              teams={teams}
              forcedMode="officialMatches"
              nextEventId={nextEvent?.id ?? null}
              nextEventAttendance={nextEventAttendance}
            />
          ),
        },
        {
          key: "matches-results",
          label: "Résultats",
          icon: <ListOrdered className={iconClass} />,
          content: <ChildResultsTab events={events} teams={teams} forcedMode="officialResults" />,
        },
      ],
    },
    {
      // Retour de Cindy du 25/08 : Charte du Joueur + Règlement Intérieur
      // (pas la Charte du Parent, qui ne concerne pas l'enfant directement)
      // — voir @/components/club-documents.tsx.
      key: "documents",
      label: "Documents",
      icon: <ScrollText className={iconClass} />,
      content: <DocumentsPanel documentIds={["charte-joueur", "reglement-interieur"]} />,
    },
    {
      // Tout à la fin du menu (retour de Cindy du 2026-08-22) — déplacé
      // depuis la bande bleue.
      key: "logout",
      label: "Déconnexion",
      icon: <LogOut className={iconClass} />,
      content: null,
      logoutAction: "child",
    },
  ];

  return (
    // overflow-x-hidden (retour de Cindy du 2026-08-25, "pas de scroll
    // droite gauche sur grand ecran surtout"), même filet de sécurité que
    // dashboard/page.tsx.
    <div className="flex flex-1 flex-col overflow-x-hidden">
      {/* Même traitement que l'en-tête de l'Espace Parent (dashboard/page.tsx,
          retour de Cindy du 2026-08-22) : logo seul agrandi, hauteur fixe +
          items-center pour un vrai centrage vertical (logo et icônes), et
          avatar à plat sous la bande bleue (le débordement façon Facebook,
          essayé d'abord, entrait en collision avec un logo plus grand —
          même bord gauche). Retour de Cindy du 2026-08-22 (message
          suivant) : bandeau encore trop épais, remis à sa hauteur
          d'origine (simple padding). Logo ensuite jugé "tout petit" à
          32px — agrandi à 44px, padding vertical resserré à py-2 pour
          absorber la croissance sans faire gonfler le bandeau ni laisser
          le logo en déborder. Déconnexion déplacée en tuile dans le menu
          (voir child-tile-menu.tsx, logoutAction). */}
      {/* Même bandeau unifié que le tableau de bord principal (direction
          artistique du 2026-08-23, confirmée avec Cindy via question
          directe) : avatar + "Bonjour" + prénom à gauche, grand logo en
          filigrane semi-transparent à droite (derrière les icônes,
          jamais au-dessus), icônes fonctionnelles inchangées par-dessus.
          Logo encore plus présent ici que côté Parent/Coach/Bureau
          (retour de Cindy du 2026-08-24, item 7 du topo : "logo plus
          présent", propre à l'Espace Enfant) — plus grand et moins
          transparent, sans empiéter sur les icônes qui restent
          par-dessus.
          Pas d'overflow-hidden (retour de Cindy du 2026-08-25, même
          correctif que page.tsx) : combiné à position sticky sur ce même
          élément, ça rognait le popover des notifications dès qu'il
          dépassait la hauteur de l'en-tête. */}
      <header className="sticky top-0 z-10 relative bg-gradient-to-br from-navy via-navy to-navy-dark px-4 py-4 shadow-md sm:px-6 sm:py-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.06] to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-2 top-1/2 h-36 w-36 -translate-y-1/2 bg-contain bg-right bg-no-repeat opacity-40 sm:h-44 sm:w-44"
          style={{ backgroundImage: "url(/logo.png)" }}
        />
        {/* Retour de Cindy du 2026-08-25 ("toujours pas bon tout doit etre
            aligné"), même correctif que page.tsx : la grille 1fr/auto/1fr
            essayée avant ne tombait toujours pas au centre réel. Photo et
            icônes redeviennent une simple ligne flex justify-between
            (déjà correcte en pratique), et le bandeau devient une
            superposition (absolute, left-1/2 -translate-x-1/2) centrée
            sur ce conteneur relatif — centrage géométrique garanti,
            indépendant de la largeur de la photo/des icônes. */}
        <div className="relative mx-auto flex w-full max-w-[1600px] flex-col gap-3 sm:min-h-[3.5rem] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <ChildAvatarUpload avatarUrl={avatarUrl} name={firstName} />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-ubac-yellow">
                Bonjour
              </p>
              <h1 className="truncate text-xl font-bold text-white sm:text-2xl">
                {formatFirstName(firstName) || "champion"}
              </h1>
            </div>
          </div>
          {/* Retour de Cindy du 2026-08-25 : organigramme et notifications
              restent à gauche — pas de bouton menu ici (le menu de
              l'Espace Enfant est ChildTileMenu, ailleurs sur la page),
              donc rien à pousser à droite dans cette en-tête. */}
          <div className="flex shrink-0 items-center gap-1">
            <OrgChartButton />
            <ChildNotificationBell initialNotifications={notifications} initialEnabled={notificationsEnabled} />
          </div>
          {/* Retour de Cindy du 2026-08-25 : "CETTE SEMAINE" se retrouvait
              coupé en haut de l'en-tête — même correctif que page.tsx,
              inset-y-0 + flex + items-center centre à l'intérieur de la
              vraie hauteur du conteneur, jamais au-delà. */}
          <div className="sm:absolute sm:inset-y-0 sm:left-1/2 sm:flex sm:max-w-[calc(100%-18rem)] sm:-translate-x-1/2 sm:items-center">
            <WeekStripBanner events={headerWeekEvents} />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
        <div>
          {(teams.length > 0 || ownJersey?.jersey != null) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {teams.map((t) => (
                <span
                  key={t.id}
                  className="rounded-full bg-ubac-yellow/15 px-2.5 py-0.5 text-xs font-semibold text-ubac-yellow-dark"
                >
                  {t.category ?? t.name}
                </span>
              ))}
              {ownJersey?.jersey != null && (
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-500">
                  N° {ownJersey.jersey}
                </span>
              )}
            </div>
          )}
        </div>

        <ChildTileMenu sections={sections} />
      </div>
    </div>
  );
}

