"use client";

import Image from "next/image";
import { BarChart3, Cake, CalendarDays, Trophy, Users } from "lucide-react";
import AdminSidebar, { type AdminSection } from "@/app/dashboard/admin-sidebar";
import OrgChartButton from "@/app/dashboard/org-chart-button";
import PenalitesCard from "@/app/dashboard/penalites-card";
import ChildAvatarUpload from "./child-avatar-upload";
import { MobileNavProvider } from "@/app/dashboard/mobile-nav-context";
import MobileMenuButton from "@/app/dashboard/mobile-menu-button";
import { formatFirstName } from "@/lib/names";
import { styleFor, isMatchType, homeAwayLabel, formatEventTime } from "@/app/dashboard/event-style";
import { parseMatchTitle } from "@/lib/match-display";
import { localDateFromParts } from "@/lib/local-date";
import ChildLogoutButton from "./child-logout-button";
import ChildCalendarTab from "./child-calendar-tab";
import ChildTeamTab from "./child-team-tab";
import ChildResultsTab from "./child-results-tab";
import ChildPresenceTab from "./child-presence-tab";
import ChildNotificationBell, { type ChildNotification } from "./child-notification-bell";

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
};

export type ChildTeammate = {
  id: string;
  firstName: string | null;
  birthDate: string | null;
  jerseyNumber: number | null;
  position: string | null;
  isSelf: boolean;
};

export type ChildCoach = { id: string; firstName: string | null; lastName: string | null };

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
  nextEventAttendance: { name: string | null; status: string }[];
  notifications: ChildNotification[];
  notificationsEnabled: boolean;
  // Lecture seule (retour de Cindy du 2026-08-22, "près de Bilan de
  // présence") : saisies par le Bureau, jamais modifiables ici.
  penalites: ChildPenalite[];
}) {
  const now = Date.now();
  const nextEvent = events.find((e) => new Date(e.startTime).getTime() >= now) ?? null;
  // Onglet "Résultats" : tout le calendrier de matchs/amicaux de la
  // saison, joués ou non, dans l'ordre chronologique — mêmes règles que
  // la vue Résultats du calendrier Bureau/Coach/Parent (calendar-view.tsx,
  // seasonMatches), en lecture seule ici comme tout le reste de l'espace
  // Enfant.
  const seasonMatches = events
    .filter((e) => isMatchType(e.eventType))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const teammatesOnly = teammates.filter((t) => !t.isSelf);

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
          {nextEvent ? <NextEventCard event={nextEvent} /> : (
            <div className="rounded-2xl border border-zinc-100 bg-white p-4 text-sm text-zinc-500 shadow-sm">
              Rien de prévu pour le moment.
            </div>
          )}

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
        <ChildTeamTab
          teammates={teammatesOnly}
          coaches={coaches}
          nextEvent={nextEvent}
          nextEventAttendance={nextEventAttendance}
        />
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
      key: "results",
      label: "Matchs et résultats",
      icon: <Trophy className={iconClass} />,
      content: <ChildResultsTab seasonMatches={seasonMatches} teams={teams} />,
    },
  ];

  return (
    <MobileNavProvider>
    <div className="flex flex-1 flex-col">
      {/* Même traitement que l'en-tête de l'Espace Parent (dashboard/page.tsx,
          retour de Cindy du 2026-08-22) : logo seul, padding bas généreux
          pour le débordement de l'avatar. */}
      <header className="sticky top-0 z-10 bg-navy px-4 pb-9 pt-3 sm:px-6 sm:pb-11">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between">
          <Image src="/logo.png" alt="UBAC" width={48} height={48} className="h-11 w-11 object-contain sm:h-12 sm:w-12" priority />
          <div className="flex items-center gap-1">
            <OrgChartButton />
            <ChildNotificationBell initialNotifications={notifications} initialEnabled={notificationsEnabled} />
            <ChildLogoutButton />
            <MobileMenuButton />
          </div>
        </div>
      </header>

      {/* z-20 > le z-10 de l'en-tête sticky (voir dashboard/page.tsx pour
          l'explication complète — même correctif ici). */}
      <div className="relative z-20 mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-4 pb-6 sm:px-6 sm:pb-10">
        <div>
          <div className="-mt-10 flex items-center gap-3 sm:-mt-12">
            <ChildAvatarUpload avatarUrl={avatarUrl} name={firstName} />
            <h1 className="text-2xl font-bold text-navy">
              {formatFirstName(firstName) || "champion"}
            </h1>
          </div>
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

        <AdminSidebar sections={sections} />
      </div>
    </div>
    </MobileNavProvider>
  );
}

// Compte à rebours simple ("Aujourd'hui" / "Demain" / "Dans N jours"),
// calculé à l'ouverture de la page — pas besoin d'un vrai minuteur pour
// une granularité à la journée.
function daysUntilLabel(startIso: string): string {
  const start = new Date(startIso);
  const startOfDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.round((startOfDay.getTime() - startOfToday.getTime()) / 86400000);
  if (days <= 0) return "Aujourd'hui !";
  if (days === 1) return "Demain !";
  return `Dans ${days} jours`;
}

function NextEventCard({ event }: { event: ChildEvent }) {
  const style = styleFor(event.eventType);
  const parsed = parseMatchTitle(event.title);
  const home = event.isHome ?? parsed.isHome;
  const lieu = event.salle || event.location;

  return (
    <div className={`rounded-2xl border-2 bg-white p-4 shadow-sm ${style.border.replace("border-l-", "border-")}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${style.badge}`}>
          {style.label}
        </span>
        <span className="rounded-full bg-navy px-3 py-1 text-xs font-bold text-ubac-yellow">
          {daysUntilLabel(event.startTime)}
        </span>
      </div>
      <p className="mt-2 text-lg font-bold text-zinc-900">
        {isMatchType(event.eventType)
          ? [homeAwayLabel(home), parsed.opponent ? `vs ${parsed.opponent}` : null].filter(Boolean).join(" · ")
          : event.title ?? style.label}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
        <span>
          {new Date(event.startTime).toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
          , {formatEventTime(event.startTime, event.endTime)}
        </span>
        {lieu && <span>· {lieu}</span>}
      </div>
    </div>
  );
}
