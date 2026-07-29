import { Users, CalendarPlus, BellRing, ClipboardCheck } from "lucide-react";

const shortcuts = [
  {
    icon: CalendarPlus,
    title: "Créer un événement",
    description: "Planifier un match ou un entraînement.",
  },
  {
    icon: BellRing,
    title: "Convocations",
    description: "Convoquer tes joueurs à un match ou entraînement.",
  },
  {
    icon: ClipboardCheck,
    title: "Présences",
    description: "Suivre les réponses et saisir les présences.",
  },
];

export default function CoachView({
  teams,
}: {
  teams: { id: string; name: string | null; category: string | null }[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-ubac-blue">
          <Users className="h-5 w-5" />
          <h3 className="font-semibold text-zinc-900">Mes équipes</h3>
        </div>
        <ul className="mt-2 flex flex-wrap gap-2">
          {teams.map((team) => (
            <li
              key={team.id}
              className="rounded-full bg-ubac-blue/10 px-3 py-1 text-sm font-medium text-ubac-blue"
            >
              {team.name}
              {team.category ? ` · ${team.category}` : ""}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {shortcuts.map(({ icon: Icon, title, description }) => (
          <div
            key={title}
            className="flex gap-4 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ubac-blue/10 text-ubac-blue">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-semibold text-zinc-900">{title}</h3>
              <p className="mt-1 text-sm text-zinc-500">{description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
