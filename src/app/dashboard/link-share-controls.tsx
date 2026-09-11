"use client";

import { useState } from "react";
import { Check, Copy, type LucideIcon } from "lucide-react";

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

// Icône d'action secondaire (ex. "Configurer les accès") — plus visible
// que l'ancien simple trait gris : fond circulaire discret + info-bulle,
// même teinte navy que le reste de la charte plutôt qu'un gris clair sans
// contraste.
export function IconActionButton({
  icon: Icon,
  label,
  onClick,
  className = "",
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy/5 text-navy transition-colors hover:bg-navy/15 ${className}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
