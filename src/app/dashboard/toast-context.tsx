"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, TriangleAlert } from "lucide-react";

// Toast partagé (retour de Cindy du 09/09, "confirmations visuelles
// immédiates après chaque action clé") : jusqu'ici, trois écrans
// (cotisation-participants-table.tsx, members-table.tsx, team-card.tsx)
// avaient chacun leur propre petite implémentation locale de ce même
// mécanisme -- trois copies du même bouton, jamais un seul modèle
// réutilisé, et tout le reste de l'appli (créer un événement, un
// sponsor...) n'avait rien du tout. Même schéma que mobile-nav-context.tsx/
// section-nav-context.tsx : un contexte monté une fois en haut de l'arbre
// (voir page.tsx), consommé par n'importe quel composant via useToast()
// sans avoir à faire descendre de props.
//
// Style visuel repris à l'identique de la version la plus complète
// (cotisation-participants-table.tsx) : pilule fixe en bas de l'écran,
// navy pour un succès, rouge pour une erreur -- une erreur reste affichée
// plus longtemps (9s contre 4s), le temps de vraiment la lire plutôt
// qu'un simple accusé de réception.
type ToastState = { message: string; variant: "success" | "error" } | null;

const ToastContext = createContext<{
  showToast: (message: string) => void;
  showErrorToast: (message: string) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);

  function showToast(message: string) {
    setToast({ message, variant: "success" });
    setTimeout(() => setToast(null), 4000);
  }

  // Les erreurs portent souvent une information à retenir (cause exacte
  // d'un échec d'envoi...), donc affichées plus longtemps qu'une simple
  // confirmation de succès.
  function showErrorToast(message: string) {
    setToast({ message, variant: "error" });
    setTimeout(() => setToast(null), 9000);
  }

  return (
    <ToastContext.Provider value={{ showToast, showErrorToast }}>
      {children}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-[60] flex max-w-[90vw] -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-lg ${
            toast.variant === "error" ? "bg-red-600" : "bg-navy"
          }`}
        >
          {toast.variant === "error" ? (
            <TriangleAlert className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          )}
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  // Hors d'un ToastProvider (ne devrait pas arriver dans les espaces
  // connectés, tous enveloppés depuis page.tsx) : no-op silencieux plutôt
  // qu'un crash -- l'action elle-même continue de fonctionner, seule la
  // confirmation visuelle manquerait.
  return (
    ctx ?? {
      showToast: () => {},
      showErrorToast: () => {},
    }
  );
}
