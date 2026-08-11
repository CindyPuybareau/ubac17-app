import {
  ClipboardList,
  Coffee,
  Flag,
  KeyRound,
  Megaphone,
  Shirt,
  Timer,
  Users,
  Utensils,
} from "lucide-react";

// Liste blanche : le nom de l'icône vient de la base (event_role_types.icon),
// et on ne peut pas importer dynamiquement un composant à partir d'une
// chaîne arbitraire. Un nom inconnu retombe sur ClipboardList plutôt que de
// casser l'affichage.
export const ROLE_ICONS = {
  Shirt: { component: Shirt, label: "Maillot", className: "text-sky-600" },
  Utensils: { component: Utensils, label: "Couverts", className: "text-amber-600" },
  Coffee: { component: Coffee, label: "Boisson", className: "text-orange-600" },
  ClipboardList: { component: ClipboardList, label: "Feuille", className: "text-navy" },
  Timer: { component: Timer, label: "Chrono", className: "text-purple-600" },
  Flag: { component: Flag, label: "Drapeau", className: "text-red-600" },
  KeyRound: { component: KeyRound, label: "Clés", className: "text-zinc-600" },
  Megaphone: { component: Megaphone, label: "Annonce", className: "text-emerald-600" },
  Users: { component: Users, label: "Personnes", className: "text-blue-600" },
} as const;

export type RoleIconName = keyof typeof ROLE_ICONS;

export const ROLE_ICON_NAMES = Object.keys(ROLE_ICONS) as RoleIconName[];

function resolve(icon: string | null) {
  return ROLE_ICONS[(icon ?? "") as RoleIconName] ?? ROLE_ICONS.ClipboardList;
}

export default function RoleIcon({
  icon,
  className = "h-4 w-4 shrink-0",
}: {
  icon: string | null;
  className?: string;
}) {
  const entry = resolve(icon);
  const Icon = entry.component;
  return <Icon className={`${className} ${entry.className}`} />;
}
