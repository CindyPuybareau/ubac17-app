"use client";

import Image from "next/image";
import { Calendar, Check, HandHeart, MapPin } from "lucide-react";
import { styleFor, formatEventTime } from "@/app/dashboard/event-style";
import type { VolunteerNeed } from "@/app/dashboard/event-volunteer-needs";
import EmptyState from "@/app/dashboard/empty-state";
import AdminSidebar, { type AdminSection } from "@/app/dashboard/admin-sidebar";
import { MobileNavProvider } from "@/app/dashboard/mobile-nav-context";
import MobileMenuButton from "@/app/dashboard/mobile-menu-button";
import OrgChartButton from "@/app/dashboard/org-chart-button";
import CommissionNotificationBell, {
  type CommissionNotification,
} from "./commission-notification-bell";
import type { ClubReport, SponsorDisplay } from "@/app/dashboard/page";
import { buildProfileSections, type ProfileMember, type ProfileTeam } from "@/app/benevole/view/profile-sections";
import GuestRsvpPaidEventCard from "@/app/benevole/view/guest-rsvp-card";
import CommissionNeedsBlock from "@/app/benevole/view/commission-needs-block";
import type { ProfileCalendarEvent } from "@/lib/read-only-briques-data";

// Événement tel que vu depuis le lien d'une commission : date/heure/lieu,
// présent/absent + paiement (même carte que le Calendrier, retour de Cindy
// du 25/09) et les besoins d'organisation. Ciblage garanti par la requête
// elle-même (commission/[token]/page.tsx filtre déjà sur
// commission_group_ids) -- jamais besoin de le revérifier ici.
export type CommissionEvent = {
  id: string;
  title: string | null;
  eventType: string | null;
  location: string | null;
  salle: string | null;
  startTime: string;
  endTime: string | null;
  teamName: string | null;
  isPaid: boolean;
  paidAmount: number | null;
  paymentLink: string | null;
  paidParticipants: { name: string }[];
};

// Un seul geste : se proposer, prénom à l'appui (retour de Cindy du 10/09
// -- le lien est partagé par toute une commission, pas propre à une
// personne : pas d'identité permanente à retrouver d'un visiteur à
// l'autre, juste un prénom saisi à chaque fois). Écrit via
// /api/commission-signup, jamais un appel Supabase direct (aucune session
// d'aucune sorte sur ce lien). CommissionNeedRow/CommissionNeedsBlock
// extraits le 25/09 dans commission-needs-block.tsx, réutilisés ici et
// dans profile-sections.tsx (Calendrier) -- voir plus bas.

// Retour de Cindy du 25/09 ("la carte du tableau de bord doit être active
// avec les présences et absences... regrouper les besoins en organisation
// avec les présences, comme les autres espaces") : même carte que le
// Calendrier (GuestRsvpPaidEventCard) au-dessus de "Besoins d'organisation"
// -- même ordre que calendar-view.tsx côté Bureau/Coach (RSVP puis
// Organisation). Tous les événements de cette liste ciblent déjà CETTE
// commission par construction de la requête (page.tsx,
// .contains("commission_group_ids", [group.id])) : pas de vérification
// supplémentaire à faire ici, contrairement au Calendrier.
function EventCard({ event, needs, token }: { event: CommissionEvent; needs: VolunteerNeed[]; token: string }) {
  const style = styleFor(event.eventType);
  const lieu = event.salle || event.location;

  return (
    <div className={`rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm border-l-4 ${style.border}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}>
          {style.label}
        </span>
        {event.teamName && <span className="text-xs font-semibold text-zinc-500">{event.teamName}</span>}
      </div>
      <p className="mt-1 font-semibold text-zinc-900">{event.title ?? style.label}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3 shrink-0" />
          {new Date(event.startTime).toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
          , {formatEventTime(event.startTime, event.endTime)}
        </span>
        {lieu && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3 shrink-0" />
            {lieu}
          </span>
        )}
      </div>
      <GuestRsvpPaidEventCard
        eventId={event.id}
        token={token}
        isPaid={event.isPaid}
        paidAmount={event.paidAmount}
        paymentLink={event.paymentLink}
        paidParticipants={event.paidParticipants}
      />
      <CommissionNeedsBlock needs={needs} token={token} />
    </div>
  );
}

export default function CommissionView({
  token,
  groupId,
  commissionLabel,
  events,
  volunteerNeedsByEventId,
  notifications,
  allowedBriques,
  profileTeams,
  profileTeamRefs,
  profileMembers,
  profileEvents,
  profileSponsors,
  profileClubReports,
  attendanceByEventId,
  profileWhatsappGroups,
}: {
  token: string;
  // Retour de Cindy du 13/09 ("via leur espace dédié") : id du groupe
  // whatsapp_groups derrière ce lien, nécessaire à CommissionNotification
  // Bell pour sa clé localStorage (une par commission, jamais partagée
  // entre deux liens différents).
  groupId: string;
  commissionLabel: string;
  events: CommissionEvent[];
  volunteerNeedsByEventId: Record<string, VolunteerNeed[]>;
  notifications: CommissionNotification[];
  allowedBriques: string[];
  profileTeams: ProfileTeam[];
  // Retour de Cindy du 24/09 : sélecteur d'équipe de Calendrier/Matchs,
  // voir son commentaire dans profile-sections.tsx/read-only-briques-data.ts.
  profileTeamRefs: { id: string; name: string | null; category: string | null }[];
  profileMembers: ProfileMember[];
  profileEvents: ProfileCalendarEvent[];
  profileSponsors: SponsorDisplay[];
  profileClubReports: ClubReport[];
  // Retour de Cindy du 11/09 ("qui est présent/absent ?") : voir
  // read-only-briques-data.ts, gouverné par la brique "membres".
  attendanceByEventId: Record<string, { name: string | null; status: string }[]>;
  profileWhatsappGroups: { id: string; name: string; inviteLink: string | null }[];
}) {
  // Retour de Cindy du 25/09 ("ordre : tableau de bord, calendrier, besoin
  // bénévole dans le tableau de bord... on supprime les KPI du tableau de
  // bord pour eux") : "Besoins bénévoles" n'est plus sa propre entrée de
  // menu -- il devient le contenu de "Tableau de bord", à la place des 4
  // compteurs (DashboardSection, profile-sections.tsx) qui n'ont plus leur
  // place ici. Construit à la main (pas via buildProfileSections) et
  // TOUJOURS présent en premier, quelle que soit la brique "tableau_de_bord"
  // : c'était déjà le cas de "Besoins bénévoles" avant (jamais conditionné
  // par une brique), ça doit le rester une fois fondu dans Tableau de bord.
  // dashboardCounts omis dans l'appel à buildProfileSections plus bas :
  // sans lui, sa propre entrée "Tableau de bord" (les compteurs) ne se
  // construit jamais, évitant un doublon.
  const tableauDeBordSection: AdminSection = {
    key: "tableau-de-bord",
    label: "Tableau de bord",
    icon: <HandHeart className="h-4 w-4 shrink-0" />,
    content: (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-zinc-500">
          Merci de votre aide ! Voici les événements où le Bureau et les coachs ont besoin de vous
          — cliquez sur un besoin pour vous proposer.
        </p>
        {events.length === 0 ? (
          <EmptyState
            icon={Check}
            message="Aucun besoin pour le moment. Le Bureau et les coachs vous préviendront dès qu'ils auront besoin de vous."
          />
        ) : (
          events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              needs={volunteerNeedsByEventId[event.id] ?? []}
              token={token}
            />
          ))
        )}
      </div>
    ),
  };
  // whatsappGroups=[] : le groupe WhatsApp de CETTE commission n'a pas sa
  // place ici, la personne y est déjà, contrairement à un bénévole qui
  // découvre son rattachement.
  const sections: AdminSection[] = [
    tableauDeBordSection,
    ...buildProfileSections({
      allowedBriques,
      teams: profileTeams,
      teamRefs: profileTeamRefs,
      members: profileMembers,
      events: profileEvents,
      sponsors: profileSponsors,
      clubReports: profileClubReports,
      whatsappGroups: [],
      whatsappDirectory: profileWhatsappGroups,
      attendanceByEventId,
      commissionContext: { token, groupId },
      // Retour de Cindy du 25/09 : même besoins d'organisation qu'au-dessus
      // (déjà calculés une fois dans page.tsx pour tableauDeBordSection),
      // pour que CalendarSection (profile-sections.tsx) les affiche aussi
      // sous la carte présent/absent de chaque événement concerné -- aucune
      // requête de plus.
      volunteerNeedsByEventId,
    }),
  ];

  return (
    <MobileNavProvider>
      <div className="flex flex-1 flex-col overflow-x-hidden bg-zinc-50">
        <header className="bg-gradient-to-br from-navy via-navy to-navy-dark px-4 py-5 shadow-md sm:px-6">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Image src="/logo.png" alt="UBAC" width={44} height={44} className="h-11 w-11 object-contain" priority />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-ubac-yellow">Bonjour</p>
                {/* Retour de Cindy du 24/09 puis du 25/09 ("toujours coupé",
                    "mot coupé") : un nom de commission peut être long
                    ("Calendrier et dates à retenir"). D'abord essayé avec
                    line-clamp-2 (coupait en ellipse dès que 2 lignes ne
                    suffisaient pas) puis break-words (coupait un MOT en
                    plein milieu, "Animatio-n") -- ni l'un ni l'autre n'est
                    propre. Reste ici : ni limite de lignes, ni coupure dans
                    un mot -- le retour à la ligne ne se fait plus qu'entre
                    deux mots entiers (comportement par défaut du
                    navigateur), sur autant de lignes que nécessaire. */}
                <h1 className="text-sm font-bold leading-tight text-white sm:text-xl">
                  l&apos;équipe {commissionLabel}
                </h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <OrgChartButton />
              <CommissionNotificationBell groupId={groupId} notifications={notifications} />
              <MobileMenuButton />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          {/* Retour de Cindy du 25/09 ("on ouvre sur le calendrier aussi
              pour toutes les commissions et administrations") : Tableau de
              bord reste premier dans le MENU (voir sections plus haut),
              mais l'espace continue de s'ouvrir sur Calendrier -- même
              principe que les 4 autres espaces (Bureau/Coach/Famille/
              Enfant), tous ouverts sur leur calendrier malgré Tableau de
              bord en position une dans leur propre menu. */}
          <AdminSidebar sections={sections} defaultActiveKey="calendrier" />
        </main>
      </div>
    </MobileNavProvider>
  );
}
