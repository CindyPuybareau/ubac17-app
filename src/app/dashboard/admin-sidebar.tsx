"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { useScrollTopOnChange } from "@/lib/use-scroll-top-on-change";
import { useMobileNav } from "./mobile-nav-context";

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
};

export default function AdminSidebar({
  sections,
}: {
  sections: AdminSection[];
}) {
  // Deep-link support (see buildAppDeepLink in lib/whatsapp.ts): a shared
  // "?section=…" URL — or an "?openMember=…" / "?openGroup=…" link, which
  // implies its natural section — jumps straight to the right tab on
  // first render. Read once via lazy initial state, not an effect, so
  // there's no flash of the default section first.
  const searchParams = useSearchParams();
  const [active, setActive] = useState(() => {
    const sectionParam = searchParams.get("section");
    if (sectionParam && sections.some((s) => s.key === sectionParam)) {
      return sectionParam;
    }
    if (searchParams.get("openMember") && sections.some((s) => s.key === "members")) {
      return "members";
    }
    if (searchParams.get("openGroup") && sections.some((s) => s.key === "whatsapp")) {
      return "whatsapp";
    }
    return sections[0]?.key;
  });
  const current = sections.find((s) => s.key === active) ?? sections[0];

  // Every role's top-level tab bar (Calendrier/Membres/Équipes/...) runs
  // through this one shared component, so this single hook covers the
  // scroll-to-top requirement for Bureau, Coach, and Famille alike.
  useScrollTopOnChange(active);

  // Panneau mobile/tablette (retour de Cindy du 2026-08-22 : la barre du
  // bas imposait un défilement horizontal dès qu'il y avait beaucoup
  // d'onglets) — ouvert/fermé depuis le bouton hamburger de la bande
  // bleue, via le contexte partagé (voir mobile-nav-context.tsx).
  const { open, setOpen } = useMobileNav();

  function selectSection(key: string) {
    setActive(key);
    setOpen(false);
  }

  if (!current) return null;

  return (
    <div className="lg:flex lg:gap-6">
      {/* Desktop: fixed-style vertical sidebar, inchangée */}
      <nav className="hidden h-fit w-56 shrink-0 rounded-2xl bg-navy p-3 lg:sticky lg:top-20 lg:block">
        <ul className="flex flex-col gap-1">
          {sections.map((section) => {
            if (section.href) {
              return (
                <li key={section.key}>
                  <a
                    href={section.href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    {section.icon}
                    {section.label}
                  </a>
                </li>
              );
            }
            const isActive = section.key === current.key;
            return (
              <li key={section.key}>
                <button
                  onClick={() => setActive(section.key)}
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
          })}
        </ul>
      </nav>

      {/* Content: rendered once, shared by both layouts */}
      <div className="min-w-0 flex-1">{current.content}</div>

      {/* Mobile / tablette : panneau ouvert depuis le bouton hamburger de
          la bande bleue, plus de barre fixe en bas — même liste que la
          sidebar desktop (libellé complet, plus de coupure à gérer). */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <nav
            className="absolute right-3 top-3 flex max-h-[calc(100vh-1.5rem)] w-64 flex-col gap-1 overflow-y-auto rounded-2xl bg-navy p-3 shadow-xl"
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
              {sections.map((section) => {
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
                const isActive = section.key === current.key;
                return (
                  <li key={section.key}>
                    <button
                      onClick={() => selectSection(section.key)}
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
              })}
            </ul>
          </nav>
        </div>
      )}
    </div>
  );
}
