import Image from "next/image";
import Link from "next/link";
import {
  Building2,
  ClipboardList,
  HeartHandshake,
  HandHeart,
  KeyRound,
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

// Retour de Cindy du 25/08 : copy en prose (une phrase d'accroche + une
// phrase de contenu) plutôt qu'une liste à puces — rendu en <p>, pas en
// <ul>/<CheckCircle2>. 5 cartes désormais (ajout "Pour les Bénévoles",
// même traitement "Nouveau" que "Pour les Enfants").
const roles = [
  {
    icon: Building2,
    title: "Pour le Bureau",
    description:
      "Une vision globale du club, en un coup d'œil. Membres, cotisations, synchronisation FFBB et hub WhatsApp centralisé.",
  },
  {
    icon: ClipboardList,
    title: "Pour les Coachs",
    description:
      "Vos équipes et sous-groupes gérés simplement. Présences, convocations et retours de match, sans échange de mails interminable.",
  },
  {
    icon: HeartHandshake,
    title: "Pour les Parents",
    description:
      "Le profil de votre enfant et ses convocations à portée de main. Covoiturage, goûters, maillots : tout s'organise ici.",
  },
  {
    icon: KeyRound,
    title: "Pour les Enfants",
    badge: "Nouveau",
    description:
      "Une connexion simple avec un code à 4 chiffres, sans email ni téléphone. Planning, équipe et consignes du coach, en un clin d'œil.",
  },
  {
    // HandHeart plutôt que HeartHandshake (déjà pris par "Pour les
    // Parents") — même icône que la section Bénévoles du tableau de bord
    // (admin-view.tsx), pour une cohérence entre l'app et la page publique.
    icon: HandHeart,
    title: "Pour les Bénévoles",
    badge: "Nouveau",
    description:
      "Un club qui vit grâce à vous. Inscrivez-vous aux créneaux qui vous conviennent — buvette, table de marque, tournois — et suivez votre engagement sur la saison.",
  },
];

const clubStats = [
  { icon: Users, value: "200", label: "licenciés" },
  { icon: LayoutGrid, value: "10", label: "catégories, du baby basket aux seniors" },
  // MapPin, comme "Nos gymnases" plus bas : trois communes, trois lieux.
  { icon: MapPin, value: "3", label: "communes partenaires" },
];

// Retour de Cindy du 29/08 : la liste vient désormais de la même vue
// (sponsor_display) que les logos affichés dans les espaces connectés —
// un seul endroit (l'onglet Sponsors du Bureau) à tenir à jour pour que le
// site public et l'appli reflètent toujours le même partenariat, au lieu
// d'un tableau codé en dur ici, invisible du Bureau et donc systématiquement
// oublié à chaque changement.
async function getSponsors(): Promise<
  { id: string; name: string; logo_url: string; website_url: string | null }[]
> {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data } = await supabase
    .from("sponsor_display")
    .select("id, name, logo_url, website_url")
    .order("sort_order", { ascending: true });
  return data ?? [];
}

// Revalidé toutes les heures plutôt qu'à chaque requête (page par ailleurs
// entièrement statique) : un changement de sponsor n'a aucune urgence à la
// minute près.
export const revalidate = 3600;

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

export default async function Home() {
  const sponsors = await getSponsors();
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
        <section className="relative overflow-hidden bg-ubac-blue">
          {/* Point 7 (retour de Cindy) : emplacement pour 1-2 vraies photos
              du club, en attendant un motif vectoriel de terrain de basket
              à la place — zéro risque d'image cassée, cohérent avec la
              charte. Le jour où Cindy fournit une vraie photo : remplacer
              ce <svg> par <Image src="/club-photos/hero.jpg" fill
              className="object-cover" alt="..." /> + un dégradé navy
              par-dessus (from-navy/90 via-navy/70 to-navy-dark/90) pour
              garder le texte lisible quelle que soit la photo. */}
          <svg
            aria-hidden="true"
            viewBox="0 0 700 394"
            preserveAspectRatio="xMidYMid slice"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.15]"
          >
            <line x1="350" y1="0" x2="350" y2="394" stroke="#F4C430" strokeWidth="1.5" />
            <circle cx="350" cy="197" r="60" stroke="#F4C430" strokeWidth="1.5" fill="none" />
            <circle cx="350" cy="197" r="3" fill="#F4C430" />
            <path d="M 0 47 A 130 130 0 0 1 0 347" stroke="#F4C430" strokeWidth="1.5" fill="none" />
            <path d="M 700 47 A 130 130 0 0 0 700 347" stroke="#F4C430" strokeWidth="1.5" fill="none" />
            <rect x="0" y="122" width="190" height="150" stroke="#F4C430" strokeWidth="1.5" fill="none" />
            <rect x="510" y="122" width="190" height="150" stroke="#F4C430" strokeWidth="1.5" fill="none" />
          </svg>
          <div className="relative mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-24">
            <p className="text-sm font-semibold uppercase tracking-wider text-ubac-yellow">
              Union Basket Angoulins Châtelaillon Saint-Vivien
            </p>
            <h1 className="mt-3 text-3xl font-bold leading-tight text-white sm:text-5xl">
              Vous jouez collectif sur le terrain.
              <br className="hidden sm:block" /> On joue collectif en coulisses.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base text-white/80 sm:text-lg">
              UBAC, c&apos;est un club familial, ancré sur trois communes, où
              chacun — bureau, coachs, parents, enfants et bénévoles — a
              enfin un espace pensé pour lui. Une seule application, zéro
              prise de tête.
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
                Découvrez le club et venez nous rejoindre.
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
                {/* Retour de Cindy : le "1" de Space Grotesk (.font-numeric)
                    ne lui plaît pas sur ce chiffre — police par défaut ici,
                    match-score.tsx (scores de match) n'est pas concerné. */}
                <p className="mt-3 text-3xl font-bold text-ubac-blue">{value}</p>
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
            Bureau, coachs, parents, enfants et bénévoles : à chacun son
            espace, simple et clair.
          </p>

          {/* 5 cartes : 3 colonnes plutôt que 4 (mieux réparties en 3+2
              qu'en 4+1 sur une ligne incomplète). */}
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {roles.map(({ icon: Icon, title, description, badge }) => (
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
                <p className="text-sm text-zinc-600">{description}</p>
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
              Nos partenaires
            </h2>
          </div>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-zinc-500">
            Merci à celles et ceux qui soutiennent le club, saison après
            saison.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {sponsors.map(({ id, name, logo_url, website_url }, i) => {
              // <img> brut plutôt que next/image : logo_url peut venir du
              // bucket Storage sponsor-logos (Bureau), domaine non
              // whitelisté dans next.config — même raison qu'avatar-
              // upload.tsx pour les photos de profil.
              const content = (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logo_url}
                  alt={name}
                  className="h-12 w-auto object-contain sm:h-14"
                />
              );
              return (
                <RevealOnScroll key={id} delayMs={i * 80}>
                  {website_url ? (
                    <a
                      href={website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Site de ${name}`}
                      title={name}
                      className="flex h-24 items-center justify-center rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                    >
                      {content}
                    </a>
                  ) : (
                    <div
                      title={name}
                      className="flex h-24 items-center justify-center rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm"
                    >
                      {content}
                    </div>
                  )}
                </RevealOnScroll>
              );
            })}
          </div>
        </section>
      </main>

      <footer id="contact" className="scroll-mt-20 border-t border-black/5 bg-zinc-50">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-2">
              <Image src="/logo.png" alt="UBAC" width={32} height={32} className="h-8 w-8 object-contain" />
              <span className="text-sm font-semibold text-ubac-blue">
                Union Basket Angoulins Châtelaillon
              </span>
            </div>
            <div className="flex items-center gap-4">
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

          {/* Logos FFBB / communes partenaires : pas encore reçus de
              Cindy — section volontairement omise pour l'instant plutôt
              que des cadres vides, à ajouter dès qu'elle les fournit. */}

          <div className="mt-6 flex flex-col flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-zinc-200 pt-6 text-xs text-zinc-500 sm:flex-row">
            <a
              href="https://ubac17.fr"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-ubac-blue"
            >
              ubac17.fr
            </a>
            <span className="hidden text-zinc-300 sm:inline">·</span>
            <a href="mailto:ubac17.basket@gmail.com" className="transition-colors hover:text-ubac-blue">
              ubac17.basket@gmail.com
            </a>
            <span className="hidden text-zinc-300 sm:inline">·</span>
            <Link href="/mentions-legales" className="transition-colors hover:text-ubac-blue">
              Mentions légales
            </Link>
            <span className="hidden text-zinc-300 sm:inline">·</span>
            <Link href="/confidentialite" className="transition-colors hover:text-ubac-blue">
              Politique de confidentialité
            </Link>
          </div>

          <p className="mt-6 text-center text-xs text-zinc-400">
            UBAC — Union Basket Angoulins Châtelaillon Saint-Vivien
          </p>
        </div>
      </footer>
    </div>
  );
}
