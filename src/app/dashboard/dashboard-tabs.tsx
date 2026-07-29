"use client";

import { useState, type ReactNode } from "react";
import { Shield, Users, CalendarDays, Home } from "lucide-react";

export type DashboardTab = {
  key: string;
  label: string;
  content: ReactNode;
};

function iconFor(key: string) {
  if (key === "admin") return Shield;
  if (key === "coach") return Users;
  if (key === "family") return Users;
  if (key.startsWith("player-")) return CalendarDays;
  return Home;
}

export default function DashboardTabs({ tabs }: { tabs: DashboardTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);

  if (tabs.length === 0) {
    return null;
  }

  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="flex flex-col gap-4">
      {/* Desktop / tablet: inline pill tabs */}
      <div className="hidden flex-wrap gap-2 sm:flex">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              current.key === tab.key
                ? "border-ubac-yellow bg-ubac-yellow/10 text-ubac-yellow-dark"
                : "border-zinc-200 text-zinc-600"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="pb-20 sm:pb-0">{current.content}</div>

      {/* Mobile: fixed bottom navigation bar */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-navy-dark bg-navy px-1 py-1.5 sm:hidden">
        {tabs.map((tab) => {
          const Icon = iconFor(tab.key);
          const isActive = current.key === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-colors ${
                isActive ? "text-ubac-yellow" : "text-white/60"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="w-full truncate text-center">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
