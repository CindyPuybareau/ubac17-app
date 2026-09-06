import { Contact } from "lucide-react";
import { formatPersonName, sortByLastName } from "@/lib/names";
import type { ChildCoach, ChildEvent, ChildTeammate } from "@/app/enfant/view/child-dashboard";
import ChildTeamTab from "@/app/enfant/view/child-team-tab";
import ChildEventsTab from "@/app/enfant/view/child-events-tab";
import ChildResultsTab from "@/app/enfant/view/child-results-tab";
import SponsorsDisplay from "@/app/dashboard/sponsors-display";
import ClubReportsSection from "@/app/dashboard/club-reports-section";
import type { ClubReport, SponsorDisplay } from "@/app/dashboard/page";

// Retour de Cindy du 05/09 ("profil et bénévoles doivent être fusionnés") :
// en plus de ses événements/besoins de bénévolat habituels (voir
// benevole-view.tsx), un bénévole avec un profil d'accès sur-mesure voit
// ici, TOUJOURS en lecture seule, les briques que le Bureau a cochées pour
// lui (voir /benevole/view/page.tsx pour le calcul de allowedBriques et le
// chargement des données). Aucun de ces composants n'appelle Supabase
// depuis le navigateur : ce sont les mêmes déjà utilisés en lecture seule
// côté Espace Enfant (ChildTeamTab/ChildEventsTab/ChildResultsTab) ou
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
      <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <Contact className="h-3.5 w-3.5 text-navy" />
        Membres ({sorted.length})
      </p>
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

export default function BenevoleProfileSections({
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
}) {
  const has = (b: string) => allowedBriques.includes(b);
  const teamRefs = teams.map((t) => ({ id: t.id, name: t.name, category: t.category }));

  const hasAny =
    has("membres") ||
    has("equipes") ||
    has("evenements") ||
    has("matchs_resultats") ||
    has("sponsors") ||
    has("compte_rendu_mairies") ||
    has("compte_rendu_bureau") ||
    has("compte_rendu_coachs");

  if (!hasAny) return null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        En plus, le Bureau t&apos;a donné accès à :
      </p>

      {has("membres") && <MembersSection members={members} />}

      {has("equipes") &&
        teams.map((t) => (
          <ChildTeamTab
            key={t.id}
            title={t.name ?? "Équipe"}
            coaches={t.coaches}
            teammates={t.teammates}
          />
        ))}

      {has("evenements") && <ChildEventsTab events={events} teams={teamRefs} />}

      {has("matchs_resultats") && <ChildResultsTab events={events} teams={teamRefs} />}

      {has("sponsors") && <SponsorsDisplay sponsors={sponsors} />}

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
  );
}
