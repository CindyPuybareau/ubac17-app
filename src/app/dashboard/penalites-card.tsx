import { Gavel, ExternalLink } from "lucide-react";
import { formatLocalDateFr } from "@/lib/local-date";
import { formatAmount } from "./cotisation-shared";

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
    .filter((p) => p.statut !== "PAYE")
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
            <p className="mt-1 text-xs font-semibold text-rose-600">
              {formatAmount(totalDue)} restant à régler
            </p>
          )}
          <div className="mt-2 flex flex-col gap-1.5">
            {penalites.map((p) => {
              // Retour de Cindy du 29/08 : lien HelloAsso pour payer CETTE
              // pénalité directement depuis l'espace du joueur/parent —
              // jamais une fois "Payée", et jamais côté Enfant (paymentLink
              // y est structurellement absent, voir PenaliteLike ci-dessus).
              const showPayLink = p.statut !== "PAYE" && Boolean(p.paymentLink);
              return (
                <div key={p.id} className="flex flex-col gap-1 rounded-xl bg-zinc-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-col">
                      {showPlayerName && (
                        <span className="truncate text-sm font-medium text-zinc-800">
                          {p.playerName}
                        </span>
                      )}
                      <span className="truncate text-xs text-zinc-500">
                        {p.penaliteDate ? formatLocalDateFr(p.penaliteDate) : ""}
                        {p.notes ? ` · ${p.notes}` : ""}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        p.statut === "PAYE"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {formatAmount(p.amount)}
                    </span>
                  </div>
                  {showPayLink && (
                    <a
                      href={p.paymentLink as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-fit items-center gap-1 self-end rounded-full bg-navy px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-navy-dark"
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
