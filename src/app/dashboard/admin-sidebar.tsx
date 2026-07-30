"use client";

import { useState, type ReactNode } from "react";

export type AdminSection = {
  key: string;
  label: string;
  icon: ReactNode;
  content: ReactNode;
};

export default function AdminSidebar({
  sections,
}: {
  sections: AdminSection[];
}) {
  const [active, setActive] = useState(sections[0]?.key);
  const current = sections.find((s) => s.key === active) ?? sections[0];

  if (!current) return null;

  return (
    <div className="lg:flex lg:gap-6">
      {/* Desktop: fixed-style vertical sidebar */}
      <nav className="hidden h-fit w-56 shrink-0 rounded-2xl bg-navy p-3 lg:sticky lg:top-20 lg:block">
        <ul className="flex flex-col gap-1">
          {sections.map((section) => {
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
              <span className="w-full truncate text-center">{section.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
