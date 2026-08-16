"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export default function ChildLogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/child-logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  // Même bouton (texte, icône, style) que SignOutButton côté Espace Parent
  // — l'enfant clique sur le même geste, présenté de la même façon.
  return (
    <button
      onClick={handleLogout}
      aria-label="Se déconnecter"
      className="flex items-center gap-1.5 rounded-lg p-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
    >
      <LogOut className="h-5 w-5 shrink-0" />
      <span className="hidden sm:inline">Déconnexion</span>
    </button>
  );
}
