import { Tag } from "lucide-react";
import CotisationRow from "./cotisation-row";
import type { AdminCotisation } from "./page";

// "Cotisation & Licence" (retour de Cindy du 24/09) : le reflet, côté
// famille/enfant, de l'onglet Bureau "Cotisations & Licences" (admin-view.tsx)
// -- seulement la cotisation de SAISON (sans collecte, voir cotisations-
// manager.tsx : seasonCotisations = cotisations.filter(c => !c.collecteId)),
// jamais un stage/tournoi/boutique (-> event-cotisations-card.tsx, "Événements
// payants", carte séparée). C'est la licence : elle doit rester visible pour
// CHAQUE enfant quel que soit son statut (Payé, Offert, En attente...) --
// avant cette date, une cotisation "Payé" disparaissait une fois réglée (utile
// pour une collecte ponctuelle, pas pour une donnée d'identité comme la
// licence).
export default function FamilyCotisationCard({
  cotisations,
}: {
  cotisations: AdminCotisation[];
}) {
  const seasonCotisations = cotisations.filter((c) => !c.collecteId);

  if (seasonCotisations.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm sm:p-5">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <Tag className="h-3.5 w-3.5 text-blue-700" />
          Cotisation &amp; Licence
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          Aucune cotisation enregistrée pour l&apos;instant.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm sm:p-5">
      <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <Tag className="h-3.5 w-3.5 text-blue-700" />
        Cotisation &amp; Licence
      </p>
      <div className="flex flex-col gap-2">
        {seasonCotisations.map((c) => (
          <CotisationRow key={c.id} c={c} showPlayerName={seasonCotisations.length > 1} />
        ))}
      </div>
    </div>
  );
}
