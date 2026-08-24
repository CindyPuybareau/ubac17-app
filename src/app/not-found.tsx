import Link from "next/link";
import { Home, KeyRound, SearchX } from "lucide-react";

// Page 404 sur-mesure (retour de Cindy, tâche 9 du topo "Maillot Neuf
// UBAC" — "actuellement la 404 par défaut de Next.js, à remplacer par une
// page à l'identité du club") : même traitement visuel que le bandeau des
// espaces connectés (dégradé navy, logo en filigrane) et que le hero de la
// page d'accueil (src/app/page.tsx), pour que même une page d'erreur reste
// reconnaissable comme UBAC plutôt que comme un écran Next.js générique.
export default function NotFound() {
  return (
    <div className="relative flex min-h-full flex-1 items-center justify-center overflow-hidden bg-gradient-to-br from-navy via-navy to-navy-dark px-4 py-16 sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.06] to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-72 w-72 bg-contain bg-right-top bg-no-repeat opacity-[0.08] sm:h-96 sm:w-96"
        style={{ backgroundImage: "url(/logo.png)" }}
      />
      <div className="relative flex w-full max-w-md flex-col items-center gap-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-ubac-yellow">
          <SearchX className="h-8 w-8" />
        </span>

        <div>
          <p className="font-numeric text-6xl font-bold text-ubac-yellow sm:text-7xl">404</p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Panier manqué</h1>
          <p className="mt-3 text-sm text-white/70 sm:text-base">
            La page que tu cherches n&apos;existe pas ou plus — vérifie le lien,
            ou repars du bon panneau.
          </p>
        </div>

        <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="flex w-full items-center justify-center gap-1.5 rounded-full bg-ubac-yellow px-6 py-3 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark sm:w-auto"
          >
            <Home className="h-4 w-4" />
            Retour à l&apos;accueil
          </Link>
          <Link
            href="/enfant"
            className="flex w-full items-center justify-center gap-1.5 rounded-full border border-white/30 px-5 py-3 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 sm:w-auto"
          >
            <KeyRound className="h-4 w-4" />
            Espace Enfant
          </Link>
        </div>
      </div>
    </div>
  );
}
