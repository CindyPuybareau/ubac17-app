import { Ticket } from "lucide-react";
import { computeStatus } from "./cotisation-participants-table";
import CotisationRow from "./cotisation-row";
import type { AdminCotisation } from "./page";

// "Événements payants" (retour de Cindy du 24/09, "ça doit s'appeler
// événement payant quand on clique sur présent, basta... presque une autre
// carte, pas la cotisation de la licence, rien à voir") : le reflet, côté
// famille/enfant, de l'onglet Bureau "Événements payants" (cotisations-
// manager.tsx : toute cotisation AVEC un collecte_id, jamais la cotisation de
// saison -- voir family-cotisation-card.tsx pour celle-là). Une ligne
// n'apparaît ici que si le joueur a répondu Présent/En retard à l'événement
// (sync_paid_event_cotisation_on_rsvp, base de données) -- rien à filtrer en
// plus côté affichage. Contrairement à la licence, une fois réglée elle n'a
// plus rien à signaler (même logique qu'avant sur l'ancienne carte "Ma
// cotisation") : elle disparaît d'ici, et la carte entière se masque s'il
// n'y a aucun événement payant en attente (occasionnel par nature, pas une
// donnée d'identité permanente).
export default function EventCotisationsCard({
  cotisations,
}: {
  cotisations: AdminCotisation[];
}) {
  const pending = cotisations.filter((c) => c.collecteId && computeStatus(c) !== "PAYE");

  if (pending.length === 0) return null;

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm sm:p-5">
      <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <Ticket className="h-3.5 w-3.5 text-ubac-yellow-dark" />
        Événements payants
      </p>
      <div className="flex flex-col gap-2">
        {pending.map((c) => (
          <CotisationRow key={c.id} c={c} showPlayerName={pending.length > 1} />
        ))}
      </div>
    </div>
  );
}
