import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, role")
    .eq("id", user.id)
    .single();

  const isCoach = profile?.role === "COACH" || profile?.role === "ADMIN";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-500">Bienvenue,</p>
          <h1 className="text-2xl font-bold text-zinc-900">
            {profile?.first_name ?? user.email}
          </h1>
        </div>
        <SignOutButton />
      </div>

      <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-ubac-blue">
          {isCoach ? "Espace Coach" : "Espace Parent / Joueur"}
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          {isCoach
            ? "Créer des événements, convoquer les joueurs et suivre les présences arrivent bientôt ici."
            : "Ton calendrier et tes convocations à venir arriveront bientôt ici."}
        </p>
      </div>
    </div>
  );
}
