import Image from "next/image";

// Le tableau de bord agrège beaucoup de données au premier chargement
// (équipes, calendrier, cotisations, besoins d'organisation...) : plusieurs
// secondes d'écran blanc entre le clic "Se connecter" et l'affichage de
// l'espace, ressenties comme un blocage — retour de Cindy du 2026-08-21.
// Next.js affiche ce fichier instantanément dès la navigation, le temps que
// le Server Component de page.tsx termine son chargement, puis le remplace
// automatiquement par le vrai contenu — aucune donnée ni logique métier ici,
// juste un retour visuel immédiat.
export default function DashboardLoading() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 px-4 py-16">
      <Image
        src="/logo.png"
        alt="UBAC"
        width={48}
        height={48}
        className="h-12 w-12 animate-pulse object-contain"
        priority
      />
      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-zinc-200">
        <div className="h-full w-1/3 animate-[loading-bar_1.1s_ease-in-out_infinite] rounded-full bg-ubac-yellow" />
      </div>
      <p className="text-sm text-zinc-500">Chargement de ton espace...</p>
      <style>{`
        @keyframes loading-bar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}
