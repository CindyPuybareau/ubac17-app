import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeNameForMatching } from "@/lib/names";

// Retour de Cindy du 12/11 ("les comptes en double, on peut les supprimer ?
// une croix par exemple") : écran Bureau "Comptes à rattacher"
// (unlinked-accounts-panel.tsx). Supprimer un compte de connexion demande
// la clé service_role (auth.admin.deleteUser) -- d'où cette route serveur.
//
// Suppression explicite, faite par un membre du Bureau depuis l'interface
// (CLAUDE.md §1). Garde-fous, TOUS revérifiés ici côté serveur, jamais
// sur la seule foi de l'écran :
//  1. l'appelant est Bureau (is_club_admin) ;
//  2. le compte visé n'est relié à RIEN : ni fiche (players.profile_id),
//     ni enfant (parent_player), ni équipe coachée (team_coaches), ni
//     accès Bureau (club_administrators) -- aucune donnée du club ne
//     dépend de lui ;
//  3. motif "duplicate" : c'est bien un DOUBLON -- une fiche au même
//     prénom + nom (ou inversés) est déjà reliée à un AUTRE compte, avec
//     lequel la personne peut se connecter.
//     motif "not-member" (retour de Cindy du 12/11, "ni membre ni rien") :
//     le Bureau atteste que la personne ne fait pas partie du club --
//     seuls les garde-fous 1 et 2 s'appliquent.
// Ce que la suppression emporte (cascade en base) : la ligne profiles, ses
// abonnements push et ses notifications lues -- rien d'autre.
export async function POST(request: Request) {
  const authedSupabase = await createClient();
  const {
    data: { user },
  } = await authedSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  }
  const { data: isAdmin } = await authedSupabase.rpc("is_club_admin");
  if (!isAdmin) {
    return NextResponse.json({ error: "Réservé au Bureau." }, { status: 403 });
  }

  const { profileId, reason = "duplicate" } = (await request.json().catch(() => ({}))) as {
    profileId?: string;
    reason?: "duplicate" | "not-member";
  };
  if (!profileId || profileId === user.id || (reason !== "duplicate" && reason !== "not-member")) {
    return NextResponse.json({ error: "Compte invalide." }, { status: 400 });
  }

  let service: ReturnType<typeof createServiceClient>;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "Configuration serveur incomplète." }, { status: 500 });
  }

  const [profileRes, ownFicheRes, parentRes, coachRes, linkedFichesRes] = await Promise.all([
    service.from("profiles").select("id, first_name, last_name, email").eq("id", profileId).maybeSingle(),
    service.from("players").select("id").eq("profile_id", profileId).limit(1),
    service.from("parent_player").select("player_id").eq("parent_id", profileId).limit(1),
    service.from("team_coaches").select("team_id").eq("coach_id", profileId).limit(1),
    service.from("players").select("first_name, last_name, profile_id").not("profile_id", "is", null),
  ]);
  if (profileRes.error || ownFicheRes.error || parentRes.error || coachRes.error || linkedFichesRes.error) {
    return NextResponse.json({ error: "Vérification impossible, réessaie." }, { status: 500 });
  }
  const profile = profileRes.data;
  if (!profile) {
    return NextResponse.json({ error: "Compte introuvable." }, { status: 404 });
  }

  const adminRes = profile.email
    ? await service.from("club_administrators").select("email").ilike("email", profile.email.trim()).limit(1)
    : { data: [], error: null };
  if (adminRes.error) {
    return NextResponse.json({ error: "Vérification impossible, réessaie." }, { status: 500 });
  }

  if (
    (ownFicheRes.data ?? []).length > 0 ||
    (parentRes.data ?? []).length > 0 ||
    (coachRes.data ?? []).length > 0 ||
    (adminRes.data ?? []).length > 0
  ) {
    return NextResponse.json(
      { error: "Ce compte est relié à une fiche, un enfant, une équipe ou au Bureau : suppression refusée." },
      { status: 409 }
    );
  }

  const first = normalizeNameForMatching(profile.first_name);
  const last = normalizeNameForMatching(profile.last_name);
  const isDuplicate =
    Boolean(first) &&
    Boolean(last) &&
    (linkedFichesRes.data ?? []).some((p) => {
      if (p.profile_id === profileId) return false;
      const pFirst = normalizeNameForMatching(p.first_name);
      const pLast = normalizeNameForMatching(p.last_name);
      return (pFirst === first && pLast === last) || (pFirst === last && pLast === first);
    });
  if (reason === "duplicate" && !isDuplicate) {
    return NextResponse.json(
      { error: "Aucune fiche de cette personne n'a d'autre compte : ce n'est pas un doublon." },
      { status: 409 }
    );
  }

  const { error: deleteError } = await service.auth.admin.deleteUser(profileId);
  if (deleteError) {
    return NextResponse.json({ error: "Suppression impossible, réessaie." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
