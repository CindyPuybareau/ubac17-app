"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useScrollTopOnChange } from "@/lib/use-scroll-top-on-change";

export type AdminSection = {
  key: string;
  label: string;
  // Barre du bas (mobile) seulement : un intitulé plus long ("Organisation
  // & Bilan") tient très bien dans la sidebar desktop (toute la largeur
  // pour lui), mais se fait tronquer en "Organisation ..." une fois
  // serré entre 3 autres onglets sur un écran de téléphone. Repli sur
  // label si absent — la plupart des intitulés courts n'en ont pas besoin.
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

  if (!current) return null;

  return (
    <div className="lg:flex lg:gap-6">
      {/* Desktop: fixed-style vertical sidebar */}
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
      <div className="min-w-0 flex-1 pb-20 lg:pb-0">{current.content}</div>

      {/* Mobile / tablet: bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex gap-1 overflow-x-auto border-t border-navy-dark bg-navy px-1 py-1.5 lg:hidden">
        {sections.map((section) => {
          if (section.href) {
            return (
              <a
                key={section.key}
                href={section.href}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-[68px] flex-1 flex-col items-center gap-0.5 rounded-lg px-1.5 py-1.5 text-[11px] font-medium text-white/60"
              >
                {section.icon}
                <span className="w-full truncate text-center leading-tight">
                  {section.shortLabel ?? section.label}
                </span>
              </a>
            );
          }
          const isActive = section.key === current.key;
          return (
            <button
              key={section.key}
              onClick={() => setActive(section.key)}
              className={`flex min-w-[68px] flex-1 flex-col items-center gap-0.5 rounded-lg px-1.5 py-1.5 text-[11px] font-medium transition-colors ${
                isActive ? "text-ubac-yellow" : "text-white/60"
              }`}
            >
              {section.icon}
              <span className="w-full truncate text-center leading-tight">
                {section.shortLabel ?? section.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
