import { Shield, LayoutGrid } from "lucide-react";
import TeamManager, { type TeamWithMembers } from "./team-manager";

type Person = { id: string; first_name: string | null; last_name: string | null };

export default function AdminView({
  clubFunction,
  teams,
  allPlayers,
  allProfiles,
}: {
  clubFunction?: string | null;
  teams: TeamWithMembers[];
  allPlayers: Person[];
  allProfiles: Person[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-green-700">
        Espace Bureau
        {clubFunction ? ` · ${clubFunction}` : ""}
      </span>
      <p className="text-sm text-zinc-500">
        Accès complet à la gestion du club.
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-700">
            <LayoutGrid className="h-5 w-5" />
          </span>
          <div>
            <p className="text-2xl font-bold text-zinc-900">{teams.length}</p>
            <p className="text-sm text-zinc-500">Équipes</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-700">
            <Shield className="h-5 w-5" />
          </span>
          <div>
            <p className="text-2xl font-bold text-zinc-900">
              {allProfiles.length}
            </p>
            <p className="text-sm text-zinc-500">Membres</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-zinc-900">Gestion des équipes</h3>
        <TeamManager
          teams={teams}
          allPlayers={allPlayers}
          allProfiles={allProfiles}
        />
      </div>
    </div>
  );
}
