"use client";

import type { ReactNode } from "react";

// Remplace window.confirm() : la popup native du navigateur affiche son
// propre chrome ("ubac17-app.vercel.app indique...") et ne peut pas être
// stylée — elle ne ressemble à rien de l'appli (retour de Cindy du
// 2026-08-21). Même carte que le modal de retrait déjà en place dans
// team-card.tsx (removeTarget/removeCoachTarget), extraite ici pour que
// chaque confirmation destructive de l'appli partage exactement le même
// habillage plutôt que de le recopier à chaque fois.
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmer",
  pending = false,
  pendingLabel,
  error,
  destructive = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  pending?: boolean;
  pendingLabel?: string;
  error?: string | null;
  // Rouge pour une action destructive (supprimer, retirer...), navy sinon.
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="mb-2 font-semibold text-zinc-900">{title}</h3>
        <p className="mb-4 text-sm text-zinc-600">{message}</p>
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="flex-1 rounded-full border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`flex-1 rounded-full px-3 py-1.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
              destructive ? "bg-red-600 hover:bg-red-700" : "bg-navy hover:bg-navy-dark"
            }`}
          >
            {pending ? (pendingLabel ?? "...") : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
