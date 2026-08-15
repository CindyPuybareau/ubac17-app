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

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-50"
    >
      <LogOut className="h-3.5 w-3.5" />
      Quitter
    </button>
  );
}
