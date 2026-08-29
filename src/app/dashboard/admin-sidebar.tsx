"use client";

import { Fragment, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { useMobileNav } from "./mobile-nav-context";
import { createClient } from "@/lib/supabase/client";

export type AdminSection = {
  key: string;
  label: string;
  // N'a plus d'usage depuis que mobile/tablette utilisent le panneau
  // (liste verticale, largeur pleine) plutôt que la barre du bas serrée —
  // conservé optionnel pour ne pas casser un appelant qui le passerait
  // encore, mais rien ne le lit plus.
  shortLabel?: string;
  icon: ReactNode;
  content: ReactNode;
  // Lien externe (ex. "Boutique") plutôt qu'un onglet de contenu : rendu
  // comme un <a target="_blank"> à la place du bouton habituel, jamais
  // sélectionnable/actif. `content` reste ignoré dans ce cas (passer null).
  href?: string;
  // "Déconnexion" (retour de Cindy du 2026-08-22 : déplacée de la bande
  // bleue vers la toute fin du menu) — un geste immédiat, pas un onglet à
  // sélectionner, donc géré ici plutôt que via `content`/`onClick` côté
  // appelant : admin-view.tsx et coach-view.tsx sont des Server
  // Components, incapables de porter un handler client — ce composant,
  // déjà "use client", s'en charge lui-même. "supabase" pour
  // Bureau/Coach/Famille (vraie session Supabase Auth), "child" pour
  // l'espace Enfant (cookie de session signé, voir child-session.ts).
  logoutAction?: "supabase" | "child";
  // Sous-menu (retour de Cindy du 2026-08-22 : "créer des sous menus
  // directement dans le menu, plus d'onglets en haut"). Une section avec
  // `children` n'est plus elle-même sélectionnable — cliquer dessus
  // déplie/replie la liste, exactement comme un accordéon ; `content` reste
  // ignoré dans ce cas (passer null). Seules les feuilles (sections sans
  // `children`) portent du contenu et peuvent devenir `active`.
  children?: AdminSection[];
};

// Recherche récursive : une fois les sous-menus en place, `active` peut
// pointer sur une feuille nichée à n'importe quelle profondeur, un simple
// `sections.find` de premier niveau ne la trouverait plus.
function findSection(sections: AdminSection[], key: string): AdminSection | undefined {
  for (const section of sections) {
    if (section.key === key) return section;
    if (section.children) {
      const found = findSection(section.children, key);
      if (found) return found;
    }
  }
  return undefined;
}

function sectionExists(sections: AdminSection[], key: string): boolean {
  return Boolean(findSection(sections, key));
}

// Première feuille réellement sélectionnable : un parent avec `children`
// n'a pas de contenu propre, donc l'état "actif" par défaut doit descendre
// jusqu'à sa première feuille plutôt que de pointer sur un parent muet.
// Un lien externe (`href`) ou l'action "Déconnexion" (`logoutAction`) n'a
// pas de contenu non plus et ne peut donc jamais devenir la sélection par
// défaut.
function firstLeafKey(sections: AdminSection[]): string | undefined {
  for (const section of sections) {
    if (section.children && section.children.length > 0) {
      const leaf = firstLeafKey(section.children);
      if (leaf) return leaf;
      continue;
    }
    if (!section.href && !section.logoutAction) {
      return section.key;
    }
  }
  return undefined;
}

// Chaîne des clés de parents à ouvrir pour qu'une feuille donnée soit
// visible dans l'accordéon — utilisée pour pré-déplier le bon sous-menu au
// premier rendu (sélection par défaut ou lien profond "?section=…"). `null`
// distingue "pas trouvé du tout" de "trouvé au premier niveau" (trail []).
function ancestorKeys(
  sections: AdminSection[],
  targetKey: string,
  trail: string[] = []
): string[] | null {
  for (const section of sections) {
    if (section.key === targetKey) return trail;
    if (section.children) {
      const found = ancestorKeys(section.children, targetKey, [...trail, section.key]);
      if (found) return found;
    }
  }
  return null;
}

function containsKey(sections: AdminSection[], targetKey: string): boolean {
  return sections.some(
    (s) => s.key === targetKey || (s.children ? containsKey(s.children, targetKey) : false)
  );
}

export default function AdminSidebar({
  sections,
  contentHeader,
  standalone = false,
}: {
  sections: AdminSection[];
  // Bloc rendu au-dessus du contenu de l'onglet actif, dans la colonne de
  // contenu — jamais au-dessus de toute la page ni du menu (retour de
  // Cindy du 2026-08-22, sélecteur d'enfant côté Famille : "au-dessus de
  // l'encart entraînement, pas au-dessus du menu"). Visible sur tous les
  // onglets puisqu'il vit ici plutôt que dans un `content` particulier.
  contentHeader?: ReactNode;
  // Retour de Cindy du 29/08 : "Ma famille" imbriqué dans l'espace Bureau
  // (ou Coach) rend une DEUXIÈME instance de ce composant sur la même
  // page — mais useMobileNav() est un contexte PARTAGÉ, avec un seul
  // bouton hamburger dans la bande bleue pour toute la page. Le menu du
  // Bureau capte ce bouton en premier ; le sous-menu "Ma famille" n'a
  // alors plus aucun moyen de s'ouvrir sur mobile (aucun bouton dédié).
  // `standalone` bascule cette instance sur un état local plutôt que le
  // contexte partagé, et affiche sa liste de sections en permanence (plus
  // besoin d'un hamburger séparé) au lieu du panneau qui se déplie —
  // jamais utilisé pour la navigation de PAGE (Bureau/Coach elle-même),
  // seulement pour une navigation imbriquée comme celle-ci.
  standalone?: boolean;
}) {
  // Deep-link support (see buildAppDeepLink in lib/whatsapp.ts): a shared
  // "?section=…" URL — or an "?openMember=…" / "?openGroup=…" link, which
  // implies its natural section — jumps straight to the right tab on
  // first render. Read once via lazy initial state, not an effect, so
  // there's no flash of the default section first.
  const searchParams = useSearchParams();
  const [active, setActive] = useState(() => {
    const sectionParam = searchParams.get("section");
    if (sectionParam && sectionExists(sections, sectionParam)) {
      return sectionParam;
    }
    if (searchParams.get("openMember") && sectionExists(sections, "members")) {
      return "members";
    }
    if (searchParams.get("openGroup") && sectionExists(sections, "whatsapp")) {
      return "whatsapp";
    }
    return firstLeafKey(sections) ?? sections[0]?.key;
  });
  const current = findSection(sections, active) ?? sections[0];

  // Sous-menus dépliés — plusieurs à la fois, pas de mode accordéon
  // exclusif : rien n'empêche de garder "Cotisations" ouvert en
  // consultant "Événements et Résultats". Initialisé sur la chaîne de
  // parents de la sélection de départ pour que la feuille active soit
  // visible d'entrée, sans clic supplémentaire.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(active ? (ancestorKeys(sections, active) ?? []) : [])
  );
  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  // Pas de scroll-to-top forcé ici (retour de Cindy du 2026-08-22, "au
  // clique sur les onglets du menu, mon écran remonte, c'est
  // désagréable") : avec les sous-menus, cliquer sur un onglet est devenu
  // bien plus fréquent (naviguer entre équipes, entre Cotisations et
  // Pénalités...) et un saut de scroll à chaque clic gênait plus qu'il
  // n'aidait. La sidebar est de toute façon sticky (voir plus bas) : elle
  // reste atteignable sans avoir à remonter la page.

  // Panneau mobile/tablette (retour de Cindy du 2026-08-22 : la barre du
  // bas imposait un défilement horizontal dès qu'il y avait beaucoup
  // d'onglets) — ouvert/fermé depuis le bouton hamburger de la bande
  // bleue, via le contexte partagé (voir mobile-nav-context.tsx).
  // Toujours appelé (règle des Hooks), ignoré si `standalone` (voir plus
  // bas et le commentaire sur la prop).
  const sharedMobileNav = useMobileNav();
  const [localOpen, setLocalOpen] = useState(false);
  const open = standalone ? localOpen : sharedMobileNav.open;
  const setOpen = standalone ? setLocalOpen : sharedMobileNav.setOpen;

  function selectSection(key: string) {
    setActive(key);
    setOpen(false);
  }

  const router = useRouter();
  async function handleLogout(kind: "supabase" | "child") {
    if (kind === "supabase") {
      const supabase = createClient();
      // Volontairement indépendant de la session Enfant (retour de Cindy
      // du 2026-08-23, revenu sur son propre signalement précédent) : le
      // compte enfant (cookie séparé, 400 jours — voir child-session.ts)
      // doit continuer de vivre même si le parent se déconnecte, pour ne
      // jamais couper l'enfant en train d'utiliser l'appareil pour une
      // action du parent qui n'a rien à voir avec lui. Seule une
      // déconnexion explicite depuis /enfant (kind === "child",
      // ci-dessous) coupe cette session-là.
      // Redirection dans un `finally` : un signOut() qui échoue (réseau,
      // verrou interne du SDK) ne doit pas laisser le bouton sans effet.
      try {
        await supabase.auth.signOut();
      } finally {
        router.push("/");
        router.refresh();
      }
    } else {
      await fetch("/api/child-logout", { method: "POST" });
      router.push("/");
      router.refresh();
    }
  }

  if (!current) return null;

  // Un seul rendu récursif partagé par la sidebar desktop et le panneau
  // mobile : les deux affichaient déjà une liste identique, la seule
  // différence était que la sélection ferme aussi le panneau côté mobile
  // (onSelect le porte) — dupliquer la logique d'accordéon en plus de ça
  // aurait doublé la surface à faire évoluer à chaque futur sous-menu.
  function renderSection(section: AdminSection, onSelect: (key: string) => void) {
    if (section.href) {
      return (
        <li key={section.key}>
          <a
            href={section.href}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            {section.icon}
            {section.label}
          </a>
        </li>
      );
    }
    if (section.logoutAction) {
      return (
        <li key={section.key} className="mt-1 border-t border-white/10 pt-1">
          <button
            onClick={() => {
              setOpen(false);
              handleLogout(section.logoutAction!);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            {section.icon}
            {section.label}
          </button>
        </li>
      );
    }
    if (section.children && section.children.length > 0) {
      const isExpanded = expanded.has(section.key);
      // Un rappel visuel discret quand le sous-menu est replié mais
      // contient tout de même la sélection en cours — sans ça, un clic
      // ailleurs qui replie accidentellement le groupe donne l'impression
      // d'avoir perdu sa place.
      const hasActiveDescendant = containsKey(section.children, current.key);
      return (
        <li key={section.key}>
          <button
            onClick={() => toggleExpanded(section.key)}
            aria-expanded={isExpanded}
            // Retour d'audit du 2026-08-25 (P2, accessibilité) : le texte
            // visible du bouton ("Cotisations", "Matchs & Résultats") ne dit
            // pas à un lecteur d'écran qu'il s'agit d'un sous-menu à
            // déplier/replier — aria-expanded porte l'état, aria-label
            // explicite l'action. Chevron ignoré par l'accessibilité
            // (aria-hidden) : il ne fait que doubler visuellement ce
            // qu'aria-expanded annonce déjà.
            aria-label={`${isExpanded ? "Replier" : "Déplier"} le sous-menu ${section.label}`}
            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
              hasActiveDescendant && !isExpanded
                ? "text-ubac-yellow"
                : "text-white/70 hover:bg-white/5 hover:text-white"
            }`}
          >
            {section.icon}
            <span className="flex-1">{section.label}</span>
            {isExpanded ? (
              <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
            )}
          </button>
          {isExpanded && (
            <ul className="mt-1 flex flex-col gap-1 border-l border-white/10 pl-3">
              {section.children.map((child) => renderSection(child, onSelect))}
            </ul>
          )}
        </li>
      );
    }
    const isActive = section.key === current.key;
    return (
      <li key={section.key}>
        <button
          onClick={() => onSelect(section.key)}
          className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
            isActive
              ? "bg-white/10 text-ubac-yellow"
              : "text-white/70 hover:bg-white/5 hover:text-white"
          }`}
        >
          {section.icon}
          {section.label}
        </button>
      </li>
    );
  }

  return (
    <div className="lg:flex lg:gap-6">
      {/* Desktop: fixed-style vertical sidebar, inchangée. En `standalone`
          (retour de Cindy du 29/08, "Ma famille" imbriqué dans le Bureau) :
          toujours visible, aussi sous le seuil lg — il n'existe alors
          aucun bouton hamburger externe capable de l'ouvrir autrement, une
          liste toujours affichée reste le seul moyen fiable d'y naviguer
          sur mobile. */}
      <nav
        className={`h-fit shrink-0 rounded-2xl bg-navy p-3 lg:sticky lg:top-20 lg:w-56 ${
          standalone ? "w-full" : "hidden lg:block"
        }`}
      >
        <ul className="flex flex-col gap-1">
          {sections.map((section) => renderSection(section, setActive))}
        </ul>
      </nav>

      {/* Content: rendered once, shared by both layouts. La key sur ce
          Fragment force un vrai démontage/remontage à chaque changement de
          feuille (retour de Cindy du 2026-08-23 : "Matchs & Résultats" se
          dépliait mais cliquer sur "Matchs officiels"/"Résultats" ne
          faisait rien). Sans elle, deux feuilles qui rendent le même type
          de composant (ex. CalendarView avec un forcedView différent,
          CoachOrganisation/CotisationsManager avec un forcedTab différent)
          faisaient réutiliser par React la même instance montée au lieu
          d'en remonter une nouvelle — leur useState(forcedX ?? défaut) ne
          se réexécute qu'au tout premier montage, donc l'état interne
          restait bloqué sur la toute première valeur cliquée, quel que
          soit le sous-onglet choisi ensuite. */}
      <div className="min-w-0 flex-1 flex-col gap-4 flex">
        {contentHeader}
        <Fragment key={current.key}>{current.content}</Fragment>
      </div>

      {/* Mobile / tablette : panneau ouvert depuis le bouton hamburger de
          la bande bleue, plus de barre fixe en bas — même liste que la
          sidebar desktop (libellé complet, plus de coupure à gérer).
          Jamais en `standalone` : la liste ci-dessus est déjà visible en
          permanence dans ce cas, ce panneau ferait doublon (et n'a de
          toute façon aucun bouton externe pour l'ouvrir). */}
      {!standalone && open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <nav
            // Retour de Cindy du 2026-08-25 ("quand tous mes onglets sont
            // ouverts, je ne peux pas voir les boutons... je dois pouvoir
            // scroller plus que ca") : 100vh sur mobile compte la hauteur
            // totale de la page, y compris la zone que la barre d'adresse
            // du navigateur peut recouvrir — le panneau se calculait donc
            // parfois plus grand que la zone réellement visible, coupant
            // le bas du menu (Déconnexion...) hors de portée du scroll.
            // 100dvh (hauteur de viewport "dynamique") suit la zone
            // vraiment visible à tout moment.
            className="absolute right-3 top-3 flex max-h-[calc(100dvh-1.5rem)] w-64 flex-col gap-1 overflow-y-auto rounded-2xl bg-navy p-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/50">
                Menu
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="flex flex-col gap-1">
              {sections.map((section) => renderSection(section, selectSection))}
            </ul>
          </nav>
        </div>
      )}
    </div>
  );
}
