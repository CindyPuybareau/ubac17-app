import { HandHeart } from "lucide-react";
import type { TaskSource } from "./event-tasks";

// Affiché uniquement pour un volontaire. Une famille désignée par le coach
// ne porte aucun badge : c'est le cas ordinaire, le signaler ajouterait du
// bruit. Et une attribution antérieure à la colonne source (donc null)
// n'affiche rien non plus, faute de savoir qui l'a créée.
export default function TaskSourceBadge({ source }: { source: TaskSource | null }) {
  if (source !== "VOLUNTEER") return null;
  return (
    <span
      title="Cette famille s'est proposée d'elle-même"
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold leading-none text-emerald-700"
    >
      <HandHeart className="h-3 w-3 shrink-0" />
      Volontaire
    </span>
  );
}
