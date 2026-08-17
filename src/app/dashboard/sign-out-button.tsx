"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    // Redirection dans un `finally` : un signOut() qui échoue (réseau,
    // verrou interne du SDK) faisait planter le clic silencieusement —
    // rien ne se passait, sans erreur ni navigation, comme si le bouton
    // ne répondait plus.
    try {
      await supabase.auth.signOut();
    } finally {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <button
      onClick={handleSignOut}
      aria-label="Se déconnecter"
      className="flex items-center gap-1.5 rounded-lg p-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
    >
      <LogOut className="h-5 w-5 shrink-0" />
      <span className="hidden sm:inline">Déconnexion</span>
    </button>
  );
}
