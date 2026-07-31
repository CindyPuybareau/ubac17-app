import Image from "next/image";
import Link from "next/link";
import {
  CalendarDays,
  Users,
  BellRing,
  CheckCircle2,
  ShieldCheck,
  MapPin,
  Trophy,
} from "lucide-react";

const features = [
  {
    icon: Users,
    title: "Gestion des membres",
    description:
      "Joueurs, parents et équipes centralisés au même endroit, avec un profil clair pour chacun.",
  },
  {
    icon: CalendarDays,
    title: "Calendrier du club",
    description:
      "Tous les matchs et entraînements de l'équipe, visibles en un coup d'œil.",
  },
  {
    icon: BellRing,
    title: "Convocations",
    description:
      "Envoyez les convocations aux matchs et entraînements directement depuis l'app.",
  },
  {
    icon: CheckCircle2,
    title: "Réponses en temps réel",
    description:
      "Présent, Absent ou Retard : chacun répond en un tap, le coach voit tout instantanément.",
  },
];

const clubStats = [
  { value: "200", label: "licenciés" },
  { value: "10", label: "catégories, du baby basket aux seniors" },
  { value: "3", label: "communes partenaires" },
];

const gyms = [
  { commune: "Angoulins", lieu: "Salle polyvalente, Chemin des Marais" },
  {
    commune: "Châtelaillon-Plage",
    lieu: "Complexe sportif, Allée du Stade",
  },
  { commune: "Saint-Vivien", lieu: "Salle polyvalente, 26 Grande Rue" },
];

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-white">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="UBAC" width={36} height={36} className="h-9 w-9 object-contain" priority />
            <span className="text-lg font-semibold text-ubac-blue">
              UBAC
            </span>
          </div>
          <Link
            href="/connexion"
            className="rounded-full bg-ubac-yellow px-5 py-2 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark"
          >
            Se connecter
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="bg-ubac-blue">
          <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-24">
            <p className="text-sm font-semibold uppercase tracking-wider text-ubac-yellow">
              Union Basket Angoulins Châtelaillon
            </p>
            <h1 className="mt-3 text-3xl font-bold leading-tight text-white sm:text-5xl">
              La gestion du club,
              <br className="hidden sm:block" /> simple pour tout le monde.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base text-white/80 sm:text-lg">
              Un club familial et à taille humaine : membres, calendrier,
              convocations et réponses en temps réel, dans une seule
              application.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/connexion"
                className="w-full rounded-full bg-ubac-yellow px-6 py-3 text-center text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark sm:w-auto"
              >
                Se connecter
              </Link>
              <span className="flex items-center gap-1.5 text-xs text-white/70">
                <ShieldCheck className="h-4 w-4" />
                Accès réservé aux membres du club
              </span>
            </div>
          </div>
        </section>

        <section className="border-b border-zinc-100 bg-zinc-50">
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-4 py-10 sm:grid-cols-3 sm:px-6">
            {clubStats.map(({ value, label }) => (
              <div key={label} className="text-center">
                <p className="text-3xl font-bold text-ubac-blue">{value}</p>
                <p className="mt-1 text-sm text-zinc-500">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <h2 className="text-center text-2xl font-bold text-zinc-900">
            Pensé pour le terrain
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-zinc-500">
            Une V1 concentrée sur l&apos;essentiel pour les équipes du club.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {features.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="flex gap-4 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ubac-blue/10 text-ubac-blue">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-semibold text-zinc-900">{title}</h3>
                  <p className="mt-1 text-sm text-zinc-500">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-zinc-100 bg-zinc-50">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
            <div className="flex items-center justify-center gap-2 text-ubac-blue">
              <Trophy className="h-5 w-5" />
              <h2 className="text-center text-2xl font-bold text-zinc-900">
                Nos gymnases
              </h2>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {gyms.map(({ commune, lieu }) => (
                <div
                  key={commune}
                  className="flex gap-3 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm"
                >
                  <MapPin className="h-5 w-5 shrink-0 text-ubac-blue" />
                  <div>
                    <h3 className="font-semibold text-zinc-900">{commune}</h3>
                    <p className="mt-1 text-sm text-zinc-500">{lieu}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-black/5 py-6 text-center text-xs text-zinc-400">
        UBAC — Union Basket Angoulins Châtelaillon
      </footer>
    </div>
  );
}
