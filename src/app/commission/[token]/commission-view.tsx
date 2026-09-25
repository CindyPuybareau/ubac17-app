"use client";

import { useState } from "react";
import Image from "next/image";
import { Calendar, Check, HandHeart, MapPin } from "lucide-react";
import { styleFor, formatEventTime } from "@/app/dashboard/event-style";
import RoleIcon from "@/app/dashboard/role-icon";
import {
  volunteerRoleIcon,
  volunteerRoleLabel,
  type VolunteerNeed,
} from "@/app/dashboard/event-volunteer-needs";
import EmptyState from "@/app/dashboard/empty-state";
import AdminSidebar, { type AdminSection } from "@/app/dashboard/admin-sidebar";
import { MobileNavProvider } from "@/app/dashboard/mobile-nav-context";
import MobileMenuButton from "@/app/dashboard/mobile-menu-button";
import OrgChartButton from "@/app/dashboard/org-chart-button";
import CommissionNotificationBell, {
  type CommissionNotification,
} from "./commission-notification-bell";
import type { ChildEvent } from "@/app/enfant/view/child-dashboard";
import type { ClubReport, SponsorDisplay } from "@/app/dashboard/page";
import { buildProfileSections, type ProfileMember, type ProfileTeam } from "@/app/benevole/view/profile-sections";

// Événement tel que vu depuis le lien d'une commission : date/heure/lieu
// et les besoins d'organisation seulement -- sans "status" : personne
// n'est invité individuellement ici, il n'y a rien à répondre
// présent/absent.
export type CommissionEvent = {
  id: string;
  title: string | null;
  eventType: string | null;
  location: string | null;
  salle: string | null;
  startTime: string;
  endTime: string | null;
  teamName: string | null;
};

function remainingSlots(need: VolunteerNeed) {
  return Math.max(0, need.requiredCount - need.signups.length);
}

// Un seul geste : se proposer, prénom à l'appui (retour de Cindy du 10/09
// -- le lien est partagé par toute une commission, pas propre à une
// personne : pas d'identité permanente à retrouver d'un visiteur à
// l'autre, juste un prénom saisi à chaque fois). Écrit via
// /api/commission-signup, jamais un appel Supabase direct (aucune session
// d'aucune sorte sur ce lien).
function CommissionNeedRow({ need, token }: { need: VolunteerNeed; token: string }) {
  const [localNeed, setLocalNeed] = useState(need);
  const [formOpen, setFormOpen] = useState(false);
  // Retour de Cindy du 13/09 ("une case, nom et un prénom") : un seul champ
  // "Ton prénom" ne suffisait plus à distinguer deux bénévoles homonymes
  // (plusieurs "Marie" possibles sur une même commission). Toujours envoyé
  // comme un seul guestName à l'API (jamais touché, aucune migration) --
  // juste composé des deux ici plutôt qu'un seul champ côté formulaire.
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justJoinedAs, setJustJoinedAs] = useState<string | null>(null);
  const label = volunteerRoleLabel(localNeed.roleCode, localNeed.customLabel);
  const icon = volunteerRoleIcon(localNeed.roleCode);
  const remaining = remainingSlots(localNeed);

  async function submit() {
    const trimmedFirst = guestFirstName.trim();
    const trimmedLast = guestLastName.trim();
    if (!trimmedFirst || !trimmedLast) {
      setError("Indique ton prénom et ton nom.");
      return;
    }
    const trimmed = `${trimmedFirst} ${trimmedLast}`;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/commission-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, needId: localNeed.id, guestName: trimmed }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? "Une erreur est survenue.");
        return;
      }
      setLocalNeed((prev) => ({
        ...prev,
        signups: [
          ...prev.signups,
          {
            id: `local-${Date.now()}`,
            playerId: null,
            benevoleId: null,
            commissionGroupId: null,
            guestName: trimmed,
            playerName: trimmed,
            source: "VOLUNTEER",
          },
        ],
      }));
      setJustJoinedAs(trimmed);
      setFormOpen(false);
      setGuestFirstName("");
      setGuestLastName("");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RoleIcon icon={icon} />
          <p className="text-xs font-medium text-zinc-700">{label}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            remaining > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {remaining > 0
            ? `${localNeed.signups.length}/${localNeed.requiredCount}`
            : `Complet (${localNeed.signups.length}/${localNeed.requiredCount})`}
        </span>
      </div>
      {localNeed.signups.length > 0 && (
        <p className="text-xs text-zinc-400">
          {localNeed.signups.map((s) => s.playerName || "Bénévole").join(", ")}
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {justJoinedAs && !formOpen && (
        <p className="text-xs font-medium text-emerald-600">Merci {justJoinedAs}, c&apos;est noté !</p>
      )}
      {formOpen ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            autoFocus
            value={guestFirstName}
            onChange={(e) => setGuestFirstName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Ton prénom"
            className="w-28 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs"
          />
          <input
            type="text"
            value={guestLastName}
            onChange={(e) => setGuestLastName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Ton nom"
            className="w-28 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs"
          />
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className="rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-dark disabled:opacity-60"
          >
            {pending ? "..." : "Valider"}
          </button>
          <button
            type="button"
            onClick={() => {
              setFormOpen(false);
              setError(null);
            }}
            className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Annuler
          </button>
        </div>
      ) : remaining > 0 ? (
        <button
          type="button"
          onClick={() => {
            setFormOpen(true);
            setJustJoinedAs(null);
          }}
          className="w-fit shrink-0 rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-dark"
        >
          Je me propose
        </button>
      ) : null}
    </div>
  );
}

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
      <div className="mt-3 flex flex-col gap-2 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Besoins d&apos;organisation</p>
        {needs.length === 0 ? (
          <p className="text-xs text-zinc-400">Aucun besoin pour le moment.</p>
        ) : (
          needs.map((need) => <CommissionNeedRow key={need.id} need={need} token={token} />)
        )}
      </div>
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
  profileEvents: ChildEvent[];
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
