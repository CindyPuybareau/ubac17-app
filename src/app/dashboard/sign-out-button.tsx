"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 10);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
        scrolled
          ? "border-ubac-yellow/40 text-ubac-yellow hover:bg-ubac-yellow/10"
          : "border-white/40 text-white hover:bg-white/10"
      }`}
    >
      Se déconnecter
    </button>
  );
}
