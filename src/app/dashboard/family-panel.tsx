import { Users } from "lucide-react";

export default function FamilyPanel({
  names,
}: {
  names: { label: string; isSelf: boolean }[];
}) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-ubac-blue">
        <Users className="h-5 w-5" />
        <h3 className="font-semibold text-zinc-900">
          Calendrier de la famille
        </h3>
      </div>
      <p className="mt-2 text-sm text-zinc-500">
        Tous les matchs et entraînements de{" "}
        {names.map((n, i) => (
          <span key={n.label}>
            {i > 0 && (i === names.length - 1 ? " et " : ", ")}
            <strong>{n.isSelf ? "toi" : n.label}</strong>
          </span>
        ))}{" "}
        s&apos;afficheront ici, regroupés en un seul calendrier.
      </p>
    </div>
  );
}
