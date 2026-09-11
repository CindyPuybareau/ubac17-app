"use client";

import { Menu } from "lucide-react";
import { useMobileNav } from "./mobile-nav-context";

// Visible seulement sous le seuil desktop (lg:hidden) — au-dessus, la
// barre latérale classique suffit, ce bouton n'aurait rien à ouvrir.
//
// Retour de Cindy du 11/09 ("le menu doit être nettement plus visible,
// surtout sur mobile") : fond plein doré (ubac-yellow, même couleur que
// les CTA principaux de l'appli) plutôt qu'un simple trait blanc
// identique aux deux icônes secondaires du header (organigramme, cloche)
// — c'est la seule des trois qui ouvre la navigation principale, elle
// doit se voir comme telle au premier coup d'œil. h-11 w-11 (44px) : zone
// tactile minimale plutôt que dépendre d'un padding qui, avec l'icône
// choisie, pouvait tomber sous ce seuil. active: (pas seulement hover:,
// qui ne se déclenche pas au tap sur mobile) assombrit le doré au clic.
// strokeWidth 2.5 (au lieu de 2 par défaut) : l'icône reste bien nette,
// même à proximité de la mascotte du header.
export default function MobileMenuButton() {
  const { setOpen } = useMobileNav();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      title="Menu"
      aria-label="Menu"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ubac-yellow text-navy transition-colors active:bg-ubac-yellow-dark hover:bg-ubac-yellow-dark lg:hidden"
    >
      <Menu className="h-5 w-5 shrink-0" strokeWidth={2.5} />
    </button>
  );
}
