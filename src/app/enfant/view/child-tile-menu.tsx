"use client";

import { isValidElement, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, LogOut } from "lucide-react";
import type { AdminSection } from "@/app/dashboard/admin-sidebar";

// Menu "tuiles" propre à l'Espace Enfant (retour de Cindy du 2026-08-24,
// item 7 du topo "Maillot Neuf UBAC" : "tuiles plus grandes et colorées,
// cibles tactiles agrandies, logo plus présent") — remplace complètement
// le menu liste partagé (AdminSidebar, utilisé tel quel par
// Bureau/Coach/Famille) pour cet espace uniquement : un enfant profite de
// grosses cibles colorées façon écran d'accueil plutôt que d'une liste
// compacte pensée pour un usage plus "gestionnaire". Reprend le même
// type AdminSection que les 3 autres espaces (aucune donnée dupliquée
// côté child-dashboard.tsx) mais gère sa propre sélection et son propre
// rendu — un vrai second composant, jamais une variante d'AdminSidebar,
// pour ne rien risquer sur les espaces qui en dépendent encore.
//
// Toujours visible, jamais caché derrière un bouton hamburger (à la
// différence du panneau mobile d'AdminSidebar) : une grille de tuiles est
// déjà compacte, la replier n'aurait fait que rajouter un tap avant
// chaque changement d'onglet.
const TILE_COLORS = [
  "bg-coral text-white",
  "bg-court-green text-white",
  "bg-ubac-yellow text-navy",
  "bg-navy text-white",
  "bg-parquet text-white",
];

function firstLeafKey(sections: AdminSection[]): string | undefined {
  for (const section of sections) {
    if (section.children && section.children.length > 0) {
      const leaf = firstLeafKey(section.children);
      if (leaf) return leaf;
      continue;
    }
    if (!section.href && !section.logoutAction) return section.key;
  }
  return undefined;
}

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

function containsKey(sections: AdminSection[], targetKey: string): boolean {
  return sections.some(
    (s) => s.key === targetKey || (s.children ? containsKey(s.children, targetKey) : false)
  );
}

// Grossit l'icône (h-4 w-4 dans les sections définies côté
// child-dashboard.tsx, pensée pour l'ancienne liste étroite) sans devoir
// faire porter deux tailles différentes au même tableau `sections` — le
// sélecteur `[&>svg]` cible le <svg> rendu par le composant Lucide reçu
// en `icon`, quelle que soit sa classe d'origine.
function BigIcon({ icon }: { icon: React.ReactNode }) {
  if (!isValidElement(icon)) return null;
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 [&>svg]:h-6 [&>svg]:w-6">
      {icon as ReactElement}
    </span>
  );
}

export default function ChildTileMenu({ sections }: { sections: AdminSection[] }) {
  const [active, setActive] = useState<string | undefined>(() => firstLeafKey(sections));
  // Sous-groupe actuellement ouvert (ici, seul "Matchs & Résultats" en a
  // un) : ses tuiles remplacent la grille principale le temps d'y
  // naviguer, avec une tuile "Retour" plutôt qu'un vrai changement
  // d'écran — pas besoin de plus pour une seule profondeur de sous-menu.
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null);
  const current = active ? findSection(sections, active) : undefined;
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/child-logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const openGroup = openGroupKey
    ? sections.find((s) => s.key === openGroupKey)
    : null;
  const visibleTiles = openGroup?.children ?? sections;

  return (
    <div className="flex flex-col gap-4">
      {openGroup && (
        <button
          onClick={() => setOpenGroupKey(null)}
          className="flex w-fit items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 shadow-sm hover:bg-zinc-50"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Retour
        </button>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {visibleTiles.map((section, i) => {
          if (section.logoutAction) {
            return (
              <button
                key={section.key}
                onClick={handleLogout}
                className="flex flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-zinc-200 bg-transparent p-4 text-center text-zinc-400 transition-colors hover:bg-zinc-50"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100">
                  <LogOut className="h-6 w-6" />
                </span>
                <span className="text-sm font-bold">{section.label}</span>
              </button>
            );
          }
          const hasChildren = Boolean(section.children && section.children.length > 0);
          const isActive = Boolean(
            current &&
              (hasChildren
                ? containsKey(section.children!, current.key)
                : current.key === section.key)
          );
          const color = TILE_COLORS[i % TILE_COLORS.length];
          return (
            <button
              key={section.key}
              onClick={() => {
                if (hasChildren) {
                  setOpenGroupKey(section.key);
                  return;
                }
                setActive(section.key);
                setOpenGroupKey(null);
              }}
              className={`flex flex-col items-center justify-center gap-2 rounded-3xl p-4 text-center shadow-sm transition-transform active:scale-95 ${color} ${
                isActive ? "ring-4 ring-white ring-offset-2 ring-offset-navy/20" : ""
              }`}
            >
              <BigIcon icon={section.icon} />
              <span className="text-sm font-bold leading-tight">{section.label}</span>
            </button>
          );
        })}
      </div>

      {!openGroup && current && !current.children && (
        <div className="flex flex-col gap-4">{current.content}</div>
      )}
    </div>
  );
}
