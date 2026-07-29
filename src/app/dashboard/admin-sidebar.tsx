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
    <div>
      {/* Desktop: fixed-style vertical sidebar + content area */}
      <div className="hidden gap-6 lg:flex">
        <nav className="h-fit w-56 shrink-0 rounded-2xl bg-navy p-3 lg:sticky lg:top-20">
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
        <div className="min-w-0 flex-1">{current.content}</div>
      </div>

      {/* Mobile / tablet: everything stacked, sidebar hidden */}
      <div className="flex flex-col gap-6 lg:hidden">
        {sections.map((section) => (
          <div key={section.key}>
            <h3 className="mb-2 flex items-center gap-2 font-semibold text-zinc-900">
              {section.icon}
              {section.label}
            </h3>
            {section.content}
          </div>
        ))}
      </div>
    </div>
  );
}
