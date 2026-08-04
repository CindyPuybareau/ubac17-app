import { ExternalLink } from "lucide-react";
import FfbbSync from "./ffbb-sync";
import type { TeamWithMembers } from "./team-manager";

export default function CoachFfbb({ teams }: { teams: TeamWithMembers[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-ubac-yellow/30 bg-ubac-yellow/5 p-4 text-sm text-zinc-600">
        Les classements officiels FFBB ne sont pas encore synchronisés dans
        l&apos;application — seul le calendrier des matchs peut être importé
        automatiquement pour l&apos;instant. Utilise le lien de la fiche
        équipe ci-dessous pour consulter les classements directement sur le
        site de la FFBB.
      </div>

      {teams.map((team) => (
        <div key={team.id} className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-zinc-900">
            {team.name}
            {team.category && team.category !== team.name ? ` · ${team.category}` : ""}
          </h3>
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
        </div>
      ))}

      {teams.length === 0 && (
        <p className="text-sm text-zinc-500">Aucune équipe pour le moment.</p>
      )}
    </div>
  );
}
