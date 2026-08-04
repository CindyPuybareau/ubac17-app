import FfbbSync from "./ffbb-sync";

type TeamRef = {
  id: string;
  name: string | null;
  category: string | null;
  ffbb_url: string | null;
};

export default function FfbbManager({ teams }: { teams: TeamRef[] }) {
  return (
    <div className="flex flex-col gap-4">
      {teams.map((team) => (
        <div
          key={team.id}
          className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm"
        >
          <h3 className="font-semibold text-zinc-900">
            {team.name}
            {team.category && team.category !== team.name ? ` · ${team.category}` : ""}
          </h3>
          <div className="mt-3">
            <FfbbSync teamId={team.id} initialUrl={team.ffbb_url} />
          </div>
        </div>
      ))}
      {teams.length === 0 && (
        <p className="text-sm text-zinc-500">Aucune équipe pour le moment.</p>
      )}
    </div>
  );
}
