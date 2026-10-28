import { Gavel, ExternalLink } from "lucide-react";
import { formatLocalDateFr } from "@/lib/local-date";
import { formatAmount } from "./cotisation-shared";
import { isPaidStatut } from "./penalite-shared";

// Type structurel plutôt qu'AdminPenalite directement : réutilisé tel quel
// par l'espace Enfant (child-dashboard.tsx), qui a son propre type léger
// sans playerId/playerName (un enfant ne voit jamais que SES propres
// pénalités, jamais besoin d'afficher un nom).
type PenaliteLike = {
  id: string;
  playerId?: string;
  playerName?: string;
  amount: number;
  notes: string | null;
  penaliteDate: string | null;
  statut: string | null;
  // Optionnel : le type léger de l'Espace Enfant (child-dashboard.tsx) ne
  // le porte pas du tout — un enfant n'a jamais de lien de paiement
  // affiché, quel que soit l'endroit, même règle que le reste du club
  // (voir child-results-tab.tsx). Rien de spécial à faire ici pour
  // respecter ça : ce champ y est simplement toujours absent.
  paymentLink?: string | null;
};

// Carte de lecture seule réutilisée dans Famille ("Mes pénalités", à côté
// de "Ma cotisation"), Coach ("Pénalités de l'équipe") et Enfant ("Mes
// pénalités", à côté de "Bilan de présence") — retour de Cindy du
// 2026-08-22, "le bloc pénalité doit être visible dans tous les espaces".
// Seul le Bureau peut créer/modifier/supprimer (voir penalites-manager.tsx).
export default function PenalitesCard({
  title = "Pénalités",
  penalites,
  showPlayerName = false,
  emptyLabel = "Aucune pénalité.",
}: {
  title?: string;
  penalites: PenaliteLike[];
  showPlayerName?: boolean;
  emptyLabel?: string;
}) {
  const totalDue = penalites
    .filter((p) => !isPaidStatut(p.statut))
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <Gavel className="h-3.5 w-3.5 text-rose-600" />
        {title}
      </p>

      {penalites.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">{emptyLabel}</p>
      ) : (
        <>
          {totalDue > 0 && (
            <p className="mt-1 text-xs font-semibold text-status-urgent-dark">
              {formatAmount(totalDue)} restant à régler
            </p>
          )}
          <div className="mt-2 flex flex-col gap-1.5">
            {penalites.map((p) => {
              // Retour de Cindy du 29/08 : lien HelloAsso pour payer CETTE
              // pénalité directement depuis l'espace du joueur/parent —
              // jamais une fois "Payée", et jamais côté Enfant (paymentLink
              // y est structurellement absent, voir PenaliteLike ci-dessus).
              const showPayLink = !isPaidStatut(p.statut) && Boolean(p.paymentLink);
              // Retour de Cindy du 28/10 ("le texte aussi peut être aligné
              // avec 30,00 restant...") : px-3 ici décalait le contenu de
              // chaque ligne plus à droite que "X € restant à régler" juste
              // au-dessus (qui, lui, ne vit que dans le padding p-4 de la
              // carte) -- même marge gauche partout.
              return (
                <div key={p.id} className="flex flex-col gap-2 rounded-xl bg-zinc-50 py-2 pl-0 pr-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col">
                      {showPlayerName && (
                        <span className="truncate text-sm font-medium text-zinc-800">
                          {p.playerName}
                        </span>
                      )}
                      {/* Retour de Cindy du 28/10 ("le texte est coupé sur
                          mobile/tablette") : ce motif/ces notes passaient en
                          `truncate` (une seule ligne, "...") alors que la
                          carte, étroite sur mobile et encore plus à l'étroit
                          en grille 2-3 colonnes sur tablette (family-view.tsx),
                          ne laissait la place qu'à 3-4 mots avant de couper --
                          ex. "1ère Faute te...". Un retour à la ligne normal
                          coûte juste un peu de hauteur, jamais d'information
                          perdue. */}
                      <span className="text-xs text-zinc-500">
                        {p.penaliteDate ? formatLocalDateFr(p.penaliteDate) : ""}
                        {p.notes ? ` · ${p.notes}` : ""}
                      </span>
                    </div>
                    {/* Retour de Cindy du 09/09 (phase 1 UX, couleurs
                        sémantiques) : status-* (globals.css) plutôt
                        qu'emerald/rose codées en dur -- même migration
                        que penalites-manager.tsx. */}
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        isPaidStatut(p.statut)
                          ? "bg-status-success/10 text-status-success"
                          : "bg-status-urgent/10 text-status-urgent-dark"
                      }`}
                    >
                      {formatAmount(p.amount)}
                    </span>
                  </div>
                  {/* Retour de Cindy du 28/10 ("le bouton Payer peut être à
                      gauche, aligné avec le reste") : self-end -> self-start,
                      pour qu'il parte du même bord gauche que la date/les
                      notes juste au-dessus, plutôt que collé à droite sous
                      le badge montant. */}
                  {showPayLink && (
                    <a
                      href={p.paymentLink as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-fit items-center gap-1 self-start rounded-full bg-navy px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-navy-dark"
                    >
                      Payer sur HelloAsso
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
