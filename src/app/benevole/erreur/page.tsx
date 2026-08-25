import Image from "next/image";

// Atterrissage quand /benevole/[token] ne reconnaît pas le jeton (lien
// mal copié, bénévole retiré côté Bureau) — même ton que les messages
// d'erreur équivalents de l'Espace Enfant.
export default function BenevoleErreurPage() {
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
        <h1 className="mt-3 text-xl font-bold text-zinc-900">Lien invalide</h1>
        <p className="mt-3 text-sm text-zinc-500">
          Ce lien n&apos;est plus valide. Demande un nouveau lien au Bureau du club.
        </p>
      </div>
    </div>
  );
}
