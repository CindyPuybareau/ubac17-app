"use client";

import { Menu } from "lucide-react";
import { useMobileNav } from "./mobile-nav-context";

// Visible seulement sous le seuil desktop (lg:hidden) — au-dessus, la
// barre latérale classique suffit, ce bouton n'aurait rien à ouvrir.
export default function MobileMenuButton() {
  const { setOpen } = useMobileNav();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      title="Menu"
      className="flex shrink-0 items-center justify-center rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
    >
      <Menu className="h-5 w-5 shrink-0" />
    </button>
  );
}
