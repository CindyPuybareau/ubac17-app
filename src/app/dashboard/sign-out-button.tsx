"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton({
  variant = "header",
}: {
  variant?: "header" | "inline";
}) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (variant === "inline") {
    return (
      <button
        onClick={handleSignOut}
        className="flex items-center gap-1.5 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
      >
        <LogOut className="h-3.5 w-3.5 shrink-0" />
        Déconnexion
      </button>
    );
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
