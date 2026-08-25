import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Mise en page commune aux pages légales (mentions-legales, confidentialite)
// — reprend le même en-tête sobre (logo + retour à l'accueil) et le même
// pied de page que la page d'accueil, plutôt qu'une charte à part pour deux
// pages seulement.
export default function LegalPageLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-white">
      <header className="border-b border-black/5 bg-white/90">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="UBAC" width={32} height={32} className="h-8 w-8 object-contain" />
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition-colors hover:text-ubac-blue"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à l&apos;accueil
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl">{title}</h1>
          {updated && (
            <p className="mt-1 text-xs text-zinc-400">Dernière mise à jour : {updated}</p>
          )}
          <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-zinc-600">
            {children}
          </div>
        </div>
      </main>

      <footer className="border-t border-black/5 py-6 text-center text-xs text-zinc-400">
        UBAC — Union Basket Angoulins Châtelaillon Saint-Vivien
      </footer>
    </div>
  );
}
