import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";
import AdminView from "./admin-view";
import CoachView from "./coach-view";
import MemberView from "./member-view";

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
    .select("first_name, last_name, role, club_function")
    .eq("id", user.id)
    .single();

  // Role comes only from the DB row tied to the authenticated user (never
  // from client input), so a member can't spoof their way into another
  // role's view.
  const role = profile?.role;

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

      {role === "ADMIN" ? (
        <AdminView clubFunction={profile?.club_function} />
      ) : role === "COACH" ? (
        <CoachView />
      ) : (
        <MemberView />
      )}
    </div>
  );
}
