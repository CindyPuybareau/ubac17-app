"use client";

import { useState, type ReactNode } from "react";

export type DashboardTab = {
  key: string;
  label: string;
  content: ReactNode;
};

export default function DashboardTabs({ tabs }: { tabs: DashboardTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);

  if (tabs.length === 0) {
    return null;
  }

  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="flex flex-col gap-4">
      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                current.key === tab.key
                  ? "border-ubac-yellow bg-ubac-yellow/10 text-ubac-yellow-dark"
                  : // Retour de Cindy du 29/08 ("les onglets se fondent dans le
                    // fond") : sans fond propre, un onglet non actif (bordure
                    // grise très claire, aucun remplissage) se distinguait à
                    // peine du fond crème général de l'appli (--background,
                    // globals.css) — même correctif déjà en place ailleurs
                    // pour ce genre de pastille (team-selector-pills.tsx).
                    "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {current.content}
    </div>
  );
}
