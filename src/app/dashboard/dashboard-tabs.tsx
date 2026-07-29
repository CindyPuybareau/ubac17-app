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
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              current.key === tab.key
                ? "border-ubac-blue bg-ubac-blue/10 text-ubac-blue"
                : "border-zinc-200 text-zinc-600"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>{current.content}</div>
    </div>
  );
}
