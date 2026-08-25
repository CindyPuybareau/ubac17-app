import Image from "next/image";
import Link from "next/link";
import {
  Building2,
  ClipboardList,
  HeartHandshake,
  KeyRound,
  CheckCircle2,
  MapPin,
  Users,
  LayoutGrid,
  Handshake,
} from "lucide-react";
import { FacebookIcon, InstagramIcon } from "@/components/social-icons";
import RevealOnScroll from "@/components/reveal-on-scroll";

// Réseaux sociaux du club — header (menu) et footer (point 6) partagent la
// même source plutôt que de dupliquer les URLs à deux endroits.
const socialLinks = [
  { href: "https://www.facebook.com/ubac17/", label: "Facebook", icon: FacebookIcon },
  { href: "https://www.instagram.com/ubac17", label: "Instagram", icon: InstagramIcon },
];

// Ancres du menu — pointent vers les sections existantes (#fonctionnalites,
// #gymnases) et vers deux sections à venir dans ce même chantier
// (#sponsors : point 5, #contact : le footer enrichi au point 6). Les liens
// vers ces deux dernières ne feront rien tant que ces sections n'existent
// pas encore, le temps de les construire dans les prochaines étapes.
const navLinks = [
  { href: "#fonctionnalites", label: "Fonctionnalités" },
  { href: "#gymnases", label: "Gymnases" },
  { href: "#sponsors", label: "Sponsors" },
  { href: "#contact", label: "Contact" },
];

const roles = [
  {
    icon: Building2,
    title: "Pour le Bureau",
    points: [
      "Vision globale à 360° sur le club",
      "Membres, cotisations, synchronisation FFBB et hub WhatsApp",
    ],
  },
  {
    icon: ClipboardList,
    title: "Pour les Coachs",
    points: [
      "Gestion des équipes, mères et sous-équipes",
      "Suivi des présences, convocations et retours de match",
    ],
  },
  {
    icon: HeartHandshake,
    title: "Pour les Parents",
    points: [
      "Gestion des profils enfants et réponses aux convocations",
      "Organisation simplifiée : covoiturage, goûter, maillots",
    ],
  },
  {
    icon: KeyRound,
    title: "Pour les Enfants",
    badge: "Nouveau",
    points: [
      "Connexion autonome avec un simple code PIN à 4 chiffres, sans email ni téléphone",
      "Planning, équipe, résultats et consignes du coach en lecture seule",
    ],
  },
];

const clubStats = [
  { icon: Users, value: "200", label: "licenciés" },
  { icon: LayoutGrid, value: "10", label: "catégories, du baby basket aux seniors" },
  // MapPin, comme "Nos gymnases" plus bas : trois communes, trois lieux.
  { icon: MapPin, value: "3", label: "communes partenaires" },
];

// Logos + lien vers le site de chaque partenaire — récupérés depuis la
// page officielle du club (ubac17.fr/dossier-dinscription/, section "Nos
// partenaires"), fichiers rapatriés dans public/sponsors/. À tenir à jour
// à la main si un partenariat change (pas de source dynamique ici).
const sponsors = [
  { name: "O2", logo: "/sponsors/o2.png", url: "https://www.o2.fr/demander-un-devis#/1-services" },
  {
    name: "L'Équipe by Steal",
    logo: "/sponsors/lequipe-by-steal.jpg",
    url: "https://www.planity.com/lequipe-by-steal-17340-chatelaillon-plage",
  },
  { name: "Opticéo", logo: "/sponsors/opticeo.png", url: "https://www.opticeo.fr/boutiques/la-rochelle" },
  {
    name: "Areas",
    logo: "/sponsors/areas.jpg",
    url: "https://www.areas.fr/agence-assurance/17088/m.damien-la-rochelle",
  },
  {
    name: "Burgeot Stores",
    logo: "/sponsors/burgeot-stores.jpg",
    url: "https://www.komilfo.fr/magasins/burgeot-stores-rochelle-17",
  },
  { name: "DIN", logo: "/sponsors/din.png", url: "https://www.d-i-n.fr/" },
];

const gyms = [
  {
    commune: "Angoulins-sur-Mer",
    lieu: "Salle polyvalente, Chemin des Marais, 17690 Angoulins",
  },
  {
    commune: "Châtelaillon-Plage",
    lieu: "Complexe sportif, Allée du Stade, 17340 Châtelaillon-Plage",
  },
  {
    commune: "Saint-Vivien",
    lieu: "Salle polyvalente, 26 Grande Rue, 17220 Saint-Vivien",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-white">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex shrink-0 items-center gap-2">
            <Image src="/logo.png" alt="UBAC" width={36} height={36} className="h-9 w-9 object-contain" priority />
          </div>

          {/* Masqué avant md (768px) : avec le logo et les icônes sociales,
              4 liens texte n'ont pas la place de respirer en dessous —
              repris intégralement dans le footer enrichi (point 6). */}
          <nav className="hidden items-center gap-6 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-zinc-600 transition-colors hover:text-ubac-blue"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            {socialLinks.map(({ href, label, icon: Icon }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`UBAC sur ${label}`}
                className="opacity-80 transition-opacity hover:opacity-100"
              >
                <Icon className="h-5 w-5" />
              </a>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="bg-ubac-blue">
          <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-24">
            <p className="text-sm font-semibold uppercase tracking-wider text-ubac-yellow">
              Union Basket Angoulins Châtelaillon Saint-Vivien
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
                Se connecter / S&apos;inscrire
              </Link>
              <Link
                href="/enfant"
                className="flex w-full items-center justify-center gap-1.5 rounded-full border border-white/30 px-5 py-3 text-center text-sm font-medium text-white/90 transition-colors hover:bg-white/10 sm:w-auto"
              >
                <KeyRound className="h-4 w-4" />
                Accès Espace Enfant
              </Link>
            </div>
            {/* Retour de Cindy : lien discret pour les non-membres, sous
                les 2 CTA principaux sans les concurrencer visuellement —
                vers #fonctionnalites pour l'instant (simple ancre sur la
                même page, pas de page dédiée). */}
            <p className="mt-4 text-xs text-white/60">
              Pas encore adhérent·e ?{" "}
              <a href="#fonctionnalites" className="underline underline-offset-2 hover:text-white">
                Découvrir le club et nous rejoindre
              </a>
            </p>
          </div>
        </section>

        <section className="border-b border-zinc-100 bg-zinc-50">
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-4 py-10 sm:grid-cols-3 sm:px-6">
            {clubStats.map(({ icon: Icon, value, label }, i) => (
              <RevealOnScroll
                key={label}
                delayMs={i * 120}
                className="flex flex-col items-center text-center"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-ubac-blue/10 text-ubac-blue">
                  <Icon className="h-6 w-6" />
                </span>
                <p className="font-numeric mt-3 text-3xl font-bold text-ubac-blue">{value}</p>
                <p className="mt-1 text-sm text-zinc-500">{label}</p>
              </RevealOnScroll>
            ))}
          </div>
        </section>

        <section id="fonctionnalites" className="mx-auto max-w-5xl scroll-mt-20 px-4 py-14 sm:px-6">
          <h2 className="text-center text-2xl font-bold text-zinc-900">
            Une application pensée pour chaque membre du club
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-zinc-500">
            Bureau, coachs, parents et enfants : à chacun son espace, simple
            et clair.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {roles.map(({ icon: Icon, title, points, badge }) => (
              <div
                key={title}
                className="flex flex-col gap-4 rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-ubac-blue/10 text-ubac-blue">
                    <Icon className="h-6 w-6" />
                  </span>
                  {badge && (
                    <span className="rounded-full bg-ubac-yellow/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-ubac-yellow-dark">
                      {badge}
                    </span>
                  )}
                </div>
                <h3 className="font-semibold text-zinc-900">{title}</h3>
                <ul className="flex flex-col gap-2.5">
                  {points.map((point) => (
                    <li
                      key={point}
                      className="flex items-start gap-2 text-sm text-zinc-600"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ubac-yellow-dark" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section id="gymnases" className="scroll-mt-20 border-t border-zinc-100 bg-zinc-50">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
            <div className="flex items-center justify-center gap-2 text-ubac-blue">
              <MapPin className="h-5 w-5" />
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

        <section id="sponsors" className="scroll-mt-20 mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <div className="flex items-center justify-center gap-2 text-ubac-blue">
            <Handshake className="h-5 w-5" />
            <h2 className="text-center text-2xl font-bold text-zinc-900">
              Nos sponsors
            </h2>
          </div>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-zinc-500">
            Merci à nos partenaires qui soutiennent le club au quotidien.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {sponsors.map(({ name, logo, url }, i) => (
              <RevealOnScroll key={name} delayMs={i * 80}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Site de ${name}`}
                  title={name}
                  className="flex h-24 items-center justify-center rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  {/* Retour de Cindy : logos en couleurs, pas de
                      niveaux de gris. */}
                  <Image
                    src={logo}
                    alt={name}
                    width={200}
                    height={100}
                    className="h-12 w-auto object-contain sm:h-14"
                  />
                </a>
              </RevealOnScroll>
            ))}
          </div>
        </section>
      </main>

      <footer id="contact" className="scroll-mt-20 border-t border-black/5 py-6 text-center text-xs text-zinc-400">
        UBAC — Union Basket Angoulins Châtelaillon Saint-Vivien
      </footer>
    </div>
  );
}
