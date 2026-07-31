import { SALLE_META, type Salle } from "./salles";

export default function SalleBadge({ salle }: { salle: string }) {
  const meta = SALLE_META[salle as Salle];
  return (
    <span
      className={`flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${meta?.badge ?? "bg-zinc-100 text-zinc-600"}`}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: meta?.dot }}
      />
      {salle}
    </span>
  );
}
