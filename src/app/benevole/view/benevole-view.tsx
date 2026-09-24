"use client";

import Image from "next/image";
import { formatFirstName } from "@/lib/names";
import { HandHeart } from "lucide-react";
import AdminSidebar, { type AdminSection } from "@/app/dashboard/admin-sidebar";
import { MobileNavProvider } from "@/app/dashboard/mobile-nav-context";
import MobileMenuButton from "@/app/dashboard/mobile-menu-button";
import OrgChartButton from "@/app/dashboard/org-chart-button";
import type { ChildEvent } from "@/app/enfant/view/child-dashboard";
import type { ClubReport, SponsorDisplay } from "@/app/dashboard/page";
import { buildProfileSections, type ProfileMember, type ProfileTeam } from "./profile-sections";
import BenevoleNotificationBell, { type BenevoleNotification } from "./benevole-notification-bell";

// Retour de Cindy du 13/09 ("les bénévoles invités peuvent être supprimés
// partout... un bénévole fait partie d'une commission quoi qu'il arrive") :
// l'onglet "Mes événements" (invitations individuelles à un événement
// précis, event_benevole_invites) est retiré -- chaque bénévole voit
// désormais les besoins d'organisation qui le concernent via le lien de SA
// commission (/commission/[token], "Besoins bénévoles"), plus via un lien
// personnel dédié à un événement précis. Ce composant ne garde donc que le
// même menu par briques que les commissions (buildProfileSections), plus
// son groupe WhatsApp et ses notifications -- voir git history pour
// l'ancien onglet (BenevoleEvent/EventCard/BenevoleNeedRow/
// BenevoleRsvpButtons/computeBenevolePendingItem/PendingRsvpPopup) si jamais
// il fallait un jour le retrouver.
export default function BenevoleView({
  firstName,
  allowedBriques,
  profileTeams,
  profileTeamRefs,
  profileMembers,
  profileEvents,
  profileSponsors,
  profileClubReports,
  attendanceByEventId,
  myWhatsappGroups,
  profileDashboardCounts,
  profileWhatsappGroups,
  notifications,
  notificationsEnabled,
}: {
  firstName: string | null;
  // Retour de Cindy du 05/09 ("profil et bénévoles doivent être
  // fusionnés") : voir profile-sections.tsx. allowedBriques vide (cas
  // historique, aucun profil assigné) -> aucune entrée de menu en plus.
  allowedBriques: string[];
  profileTeams: ProfileTeam[];
  // Retour de Cindy du 24/09 : sélecteur d'équipe de Calendrier/Matchs,
  // voir son commentaire dans profile-sections.tsx/read-only-briques-data.ts.
  profileTeamRefs: { id: string; name: string | null; category: string | null }[];
  profileMembers: ProfileMember[];
  profileEvents: ChildEvent[];
  profileSponsors: SponsorDisplay[];
  profileClubReports: ClubReport[];
  // Retour de Cindy du 11/09 ("qui est présent/absent ?") : voir
  // read-only-briques-data.ts, gouverné par la brique "membres".
  attendanceByEventId: Record<string, { name: string | null; status: string }[]>;
  // Retour de Cindy du 06/09 ("je ne vois pas dans Vie du club son groupe
  // WhatsApp") : à quel(s) groupe(s) ce bénévole a été rattaché (voir
  // benevoles-manager.tsx) -- jamais conditionné par une brique, c'est une
  // information sur lui, pas un droit d'accès.
  myWhatsappGroups: { id: string; name: string; inviteLink: string | null }[];
  // Retour de Cindy du 12/09 : voir read-only-briques-data.ts.
  profileDashboardCounts: {
    memberCount: number;
    teamCount: number;
    upcomingEventCount: number;
    birthdaysThisWeekCount: number;
  } | null;
  profileWhatsappGroups: { id: string; name: string; inviteLink: string | null }[];
  // Retour de Cindy du 06/09 ("ajouter aux bénévoles les notifications
  // comme pour tous les autres espaces") : voir benevole-notification-
  // bell.tsx.
  notifications: BenevoleNotification[];
  notificationsEnabled: boolean;
}) {
  // Retour de Cindy du 06/09 ("un menu comme les autres espaces... toutes
  // les vues de l'application doivent se ressembler") : même AdminSidebar
  // que Bureau/Coach/Famille (sidebar fixe sur PC, panneau + bouton
  // hamburger sur mobile via MobileNavProvider/MobileMenuButton) plutôt
  // qu'un simple empilement de blocs sur une seule page. Une entrée par
  // brique cochée dans son profil d'accès (voir profile-sections.tsx),
  // s'il en a un -- "Mes événements" (retiré le 13/09) n'est plus le
  // premier élément forcé, ce menu peut donc être vide (cas historique,
  // aucune brique cochée) si son commission/profil n'en a coché aucune.
  const builtSections = buildProfileSections({
    allowedBriques,
    teams: profileTeams,
    teamRefs: profileTeamRefs,
    members: profileMembers,
    events: profileEvents,
    sponsors: profileSponsors,
    clubReports: profileClubReports,
    whatsappGroups: myWhatsappGroups,
    whatsappDirectory: profileWhatsappGroups,
    dashboardCounts: profileDashboardCounts,
    attendanceByEventId,
  });
  // Retour de Cindy du 13/09 : filet de sécurité (même principe que
  // admin-view.tsx, profil restreint sans la moindre brique cochée) --
  // avant le retrait de "Mes événements", ce menu avait toujours au moins
  // une entrée ; ce n'est plus garanti pour un bénévole jamais configuré.
  const sections: AdminSection[] =
    builtSections.length > 0
      ? builtSections
      : [
          {
            key: "no-access",
            label: "Accès",
            icon: <HandHeart className="h-4 w-4 shrink-0" />,
            content: (
              <p className="rounded-2xl border border-zinc-100 bg-white p-4 text-sm text-zinc-500">
                Aucun accès n&apos;est encore configuré pour toi. Demande au Bureau
                de t&apos;ajouter à une commission (message WhatsApp épinglé dans
                ton groupe) ou de configurer ton accès individuel.
              </p>
            ),
          },
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
                <h1 className="truncate text-xl font-bold text-white">
                  {formatFirstName(firstName) || "bénévole"}
                </h1>
              </div>
            </div>
            {/* Retour de Cindy du 06/09 ("notifications... et
                l'organigramme") : mêmes icônes, même ordre que la bande
                bleue Bureau/Coach/Famille (page.tsx) — organigramme
                (aucune dépendance de données, une simple image statique)
                puis cloche puis menu. */}
            <div className="flex shrink-0 items-center gap-1">
              <OrgChartButton />
              <BenevoleNotificationBell
                initialNotifications={notifications}
                initialEnabled={notificationsEnabled}
              />
              <MobileMenuButton />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          <AdminSidebar sections={sections} />
        </main>
      </div>
    </MobileNavProvider>
  );
}
