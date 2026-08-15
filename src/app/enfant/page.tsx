import Image from "next/image";
import { KeyRound } from "lucide-react";

// Pas de sélecteur public ici par choix délibéré (voir la migration
// 20261008000000_child_pin_access.sql) : exposer tous les enfants du club
// sur une page sans authentification serait une fuite de vie privée. Cette
// route sert seulement de point d'atterrissage au bouton "Accès Espace
// Enfant" de la page d'accueil — le vrai lien reste celui, privé et propre
// à chaque famille, généré depuis Mon espace → Mon Équipe → Accès enfant.
export default function EnfantLandingPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16 text-center">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
        <Image
          src="/logo.png"
          alt="UBAC"
          width={48}
          height={48}
          className="mx-auto h-12 w-12 object-contain"
          priority
        />
        <span className="mx-auto mt-3 flex h-10 w-10 items-center justify-center rounded-full bg-ubac-yellow/20 text-ubac-yellow-dark">
          <KeyRound className="h-5 w-5" />
        </span>
        <h1 className="mt-3 text-xl font-bold text-zinc-900">Espace enfant</h1>
        <p className="mt-3 text-sm text-zinc-500">
          Ton accès se fait via un lien privé, propre à ta famille — pas
          depuis cette page. Demande-le à un parent : dans son espace UBAC,
          onglet <strong>Mon espace</strong>, puis <strong>Mon Équipe</strong>{" "}
          (tout en bas de la page), carte <strong>Accès enfant</strong>.
        </p>
        <p className="mt-3 text-xs text-zinc-400">
          Une fois ce lien ouvert sur ton appareil, tu n&apos;auras plus qu&apos;à
          choisir ton prénom et entrer ton code à 4 chiffres.
        </p>
      </div>
    </div>
  );
}
