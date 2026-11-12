import { Check, Clock, X } from "lucide-react";

// Pastilles de présence (audit visuel du 12/11, "pas de doublons
// d'informations") : la pastille EST le bouton qui déplie les noms -- plus
// de seconde ligne "8 joueurs/joueuses présent(e)s" répétant le même
// chiffre juste en dessous. Partagées par RsvpAttendance (calendar-view.tsx,
// Bureau/Coach/Famille) et AttendanceSummary (espace Enfant), petit module
// à part pour que l'espace Enfant n'embarque pas tout le calendrier.
export type RsvpPillVariant = "present" | "late" | "absent" | "pending";

export const RSVP_PILL_BASE =
  "inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none";

export const RSVP_PILL_CLASSES: Record<RsvpPillVariant, string> = {
  present: "bg-status-success/10 text-status-success",
  late: "bg-status-pending/10 text-status-pending-dark",
  absent: "bg-status-urgent/10 text-status-urgent-dark",
  pending: "bg-zinc-100 text-zinc-600",
};

// Ajoutées à une pastille cliquable (et à la pastille ouverte).
export const RSVP_PILL_CLICKABLE = "transition-shadow hover:ring-1 hover:ring-current";
export const RSVP_PILL_OPEN = "ring-1 ring-current";

export function rsvpPillLabel(variant: RsvpPillVariant, count: number) {
  if (variant === "present") return `${count} présent${count > 1 ? "s" : ""}`;
  if (variant === "absent") return `${count} absent${count > 1 ? "s" : ""}`;
  if (variant === "late") return `${count} en retard`;
  return `${count} en attente`;
}

export function RsvpPillIcon({ variant }: { variant: RsvpPillVariant }) {
  if (variant === "present") return <Check className="h-3 w-3" />;
  if (variant === "absent") return <X className="h-3 w-3" />;
  return <Clock className="h-3 w-3" />;
}
