"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

// Retour de Cindy du 14/09 ("enlever la carte Déconnexion, un bouton plus
// petit dans le menu à droite") : la grosse tuile "Déconnexion" de
// ChildTileMenu (bas de grille, bordure pointillée) laisse place à un
// simple bouton icône dans la bande bleue, à côté de l'organigramme et
// des notifications -- même fetch + redirection que l'ancienne tuile
// (voir logoutAction="child", child-tile-menu.tsx), juste déplacée ici.
export default function ChildLogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/child-logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      title="Se déconnecter"
      className="flex shrink-0 items-center gap-1.5 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
    >
      <LogOut className="h-5 w-5 shrink-0" />
    </button>
  );
}
