import { ExternalLink } from "lucide-react";
import FfbbSync from "./ffbb-sync";
import type { TeamWithMembers } from "./team-manager";

export default function CoachFfbb({
  teams,
  teamRoleByTeamId,
}: {
  teams: TeamWithMembers[];
  // Cette liste mélange équipes coachées et équipes où l'utilisateur n'est
  // que joueur (comme l'onglet Mes Équipes) — sans ce garde, "Enregistrer"
  // sur une équipe jouée-mais-pas-coachée affichait "Lien enregistré."
  // alors que la policy RLS ("coach update own teams") refusait
  // silencieusement l'écriture : aucune erreur ne remonte sur un UPDATE
  // filtré par RLS, seulement une ligne modifiée en moins.
  teamRoleByTeamId: Record<string, "COACH" | "PLAYER">;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-ubac-yellow/30 bg-ubac-yellow/5 p-4 text-sm text-zinc-600">
        Les classements officiels FFBB ne sont pas encore synchronisés dans
        l&apos;application — seul le calendrier des matchs peut être importé
        automatiquement pour l&apos;instant. Utilise le lien de la fiche
        équipe ci-dessous pour consulter les classements directement sur le
        site de la FFBB.
      </div>

      {teams.map((team) => {
        const isPlayerTeam = (teamRoleByTeamId[team.id] ?? "COACH") === "PLAYER";
        return (
          <div key={team.id} className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-zinc-900">
              {team.name}
              {team.category && team.category !== team.name ? ` · ${team.category}` : ""}
            </h3>
            {isPlayerTeam ? (
              // Lecture seule : la synchro FFBB reste à ses coachs et au
              // Bureau, comme la gestion de l'effectif dans Mes Équipes.
              team.ffbb_url ? (
                <a
                  href={team.ffbb_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-ubac-blue hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  Voir la fiche équipe et les classements sur competitions.ffbb.com
                </a>
              ) : (
                <p className="mt-3 text-sm text-zinc-400">
                  Aucun lien FFBB renseigné pour cette équipe.
                </p>
              )
            ) : (
              <>
                <div className="mt-3">
                  <FfbbSync teamId={team.id} initialUrl={team.ffbb_url} />
                </div>
                {team.ffbb_url && (
                  <a
                    href={team.ffbb_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-ubac-blue hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Voir la fiche équipe et les classements sur competitions.ffbb.com
                  </a>
                )}
              </>
            )}
          </div>
        );
      })}

      {teams.length === 0 && (
        <p className="text-sm text-zinc-500">Aucune équipe pour le moment.</p>
      )}
    </div>
  );
}
