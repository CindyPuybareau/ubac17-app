"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

// Retour de Cindy du 11/09 ("le bouton copier doit être identique
// partout") : un seul composant pour "Copier le lien d'accès enfant"
// (child-access-manager.tsx) ET "Copier son lien" par commission
// (commissions-manager.tsx), plutôt que deux styles divergents -- toute
// future fonctionnalité de partage de lien réutilise celui-ci. `getLink`
// couvre les deux cas : un lien déjà connu (commission, synchrone) ou un
// lien à créer une seule fois s'il n'existe pas encore (Accès enfant,
// via get_or_create_family_access_code -- jamais un nouveau lien à
// chaque clic, correctif du 11/09).
export default function CopyLinkButton({
  label,
  getLink,
  disabled = false,
  className = "",
}: {
  label: string;
  getLink: () => Promise<string | null> | string | null;
  disabled?: boolean;
  className?: string;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "copied" | "error">("idle");

  async function handleClick() {
    if (status === "loading") return;
    setStatus("loading");
    try {
      const link = await getLink();
      if (!link) {
        setStatus("error");
        return;
      }
      await navigator.clipboard.writeText(link);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  const isCopied = status === "copied";
  const isLoading = status === "loading";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isLoading}
      className={`flex w-fit items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
        isCopied
          ? "bg-status-success text-white"
          : "bg-ubac-yellow text-navy hover:bg-ubac-yellow-dark"
      } ${className}`}
    >
      {isCopied ? (
        <>
          <Check className="h-3.5 w-3.5 shrink-0" />
          Lien copié !
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5 shrink-0" />
          {isLoading ? "Création..." : status === "error" ? "Copie impossible, réessaie" : label}
        </>
      )}
    </button>
  );
}

