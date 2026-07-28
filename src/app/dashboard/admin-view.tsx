import { Users, Shield, LayoutGrid, Settings } from "lucide-react";

const shortcuts = [
  {
    icon: LayoutGrid,
    title: "Vue d'ensemble du club",
    description: "Effectifs, équipes et activité récente en un coup d'œil.",
  },
  {
    icon: Users,
    title: "Gestion globale des équipes",
    description: "Créer, modifier et affecter les équipes du club.",
  },
  {
    icon: Shield,
    title: "Tous les membres",
    description: "Liste complète des coachs, parents et joueurs du club.",
  },
  {
    icon: Settings,
    title: "Administration",
    description: "Réglages du club, rôles et paramètres avancés.",
  },
];

export default function AdminView({
  clubFunction,
}: {
  clubFunction?: string | null;
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {shortcuts.map(({ icon: Icon, title, description }) => (
          <div
            key={title}
            className="flex gap-4 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-700">
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
