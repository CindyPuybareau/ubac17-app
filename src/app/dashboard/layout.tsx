import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logQueryErrors } from "@/lib/query-errors";
import { formatFirstName } from "@/lib/names";
import NotificationBell from "./notification-bell";
import OrgChartButton from "./org-chart-button";
import AvatarUpload from "./avatar-upload";
import { MobileNavProvider } from "./mobile-nav-context";
import { SectionNavProvider } from "./section-nav-context";
import { ToastProvider } from "./toast-context";
import MobileMenuButton from "./mobile-menu-button";
import RealtimeSync from "./realtime-sync";

// Retour de Cindy du 12/09 ("le badge de rôle doit rester au-dessus des
// onglets Bureau/Mon équipe, quel que soit celui sélectionné"), déplacé ici
// le 08/11 ("au-dessus de Bonjour Basile") depuis dashboard-tabs.tsx : le
// rôle d'une personne au Bureau ne dépend ni de l'onglet actif ni du
// sélecteur d'espace -- il vit désormais dans ce bandeau partagé, calculé
// une seule fois. Les libellés stockés (club_function, voir
// BUREAU_ROLE_OPTIONS dans member-detail-modal.tsx) restent inchangés en
// base -- seule leur présentation ici est raccourcie/harmonisée (accord au
// féminin sur "adjointe", "Vice-" plutôt que "... Adjoint" pour rester
// court sur toutes les fonctions). Une valeur historique qui ne
// correspondrait à aucune de ces options (saisie libre d'avant ce
// catalogue) s'affiche telle quelle plutôt que de disparaître
// silencieusement.
const BUREAU_ROLE_LABELS: Record<string, string> = {
  "Président / Vice-Président": "Président / Vice-président",
  "Trésorier / Trésorier Adjoint": "Trésorier / Vice-trésorier",
  "Secrétaire / Secrétaire Adjoint": "Secrétaire / Secrétaire adjointe",
  "Membre du Bureau": "Membre du Bureau",
  "Comité directeur": "Comité directeur",
};

function bureauRoleLabel(clubFunction: string | null | undefined) {
  if (!clubFunction) return null;
  return BUREAU_ROLE_LABELS[clubFunction] ?? clubFunction;
}

// Retour de Cindy du 15/09 ("basile encore entre chaque espace") : le
// header (logo, avatar, "Bonjour" + prénom, icônes) vivait dans page.tsx,
// donc chaque changement d'onglet (?tab=...) le recalculait et le
// retransmettait entièrement, alors qu'il ne dépend d'aucune donnée liée à
// l'onglet actif. Sorti ici dans le layout du segment /dashboard : sur une
// navigation côté client (dashboard-tabs.tsx utilise router.push, pas un
// rechargement complet), Next.js réutilise ce layout déjà rendu et ne
// ré-exécute que page.tsx en dessous -- le header devient donc gratuit au
// changement d'onglet au lieu d'être recalculé à chaque clic.
//
// Le bandeau "Cette semaine" (ex-imbriqué en superposition absolue dans ce
// même header) reste volontairement dans page.tsx : ses données
// (headerWeekEvents) viennent du calcul Coach/Famille propre à l'onglet
// actif, donc structurellement lié à page.tsx, pas à ce layout partagé.
// Conséquence visuelle assumée (validée avec Cindy) : sur grand écran
// (lg:), il n'est plus superposé/centré dans le bandeau bleu mais s'affiche
// en bloc normal juste en dessous, au-dessus des onglets. Sur mobile et
// tablette, aucun changement : il était déjà en flux normal à ces tailles.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion");
  }

  const [profileResult, ownPlayerRowResult, adminResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name, avatar_url")
      .eq("id", user.id)
      .single(),
    supabase
      .from("players")
      .select("first_name")
      .eq("profile_id", user.id)
      .maybeSingle(),
    // Retour de Cindy du 08/11 ("rôle au-dessus de Bonjour Basile") : le
    // badge de rôle Bureau vivait dans dashboard-tabs.tsx (recalculé à
    // chaque ?tab=...) ; il rejoint ici le reste du bandeau, qui ne dépend
    // pas de l'onglet actif (voir le commentaire plus haut sur ce layout).
    // En minuscules : club_administrators.email est toujours stocké ainsi
    // (20260918010000), user.email reflète la casse tapée à l'inscription.
    supabase
      .from("club_administrators")
      .select("club_function")
      .eq("email", (user.email ?? "").toLowerCase())
      .maybeSingle(),
  ]);

  logQueryErrors("layout dashboard (header)", { profileResult, ownPlayerRowResult, adminResult });

  const profile = profileResult.data;
  const ownPlayerRow = ownPlayerRowResult.data;
  const displayFirstName = profile?.first_name ?? ownPlayerRow?.first_name ?? null;
  const roleLabel = bureauRoleLabel(adminResult.data?.club_function ?? null);

  return (
    <MobileNavProvider>
      <SectionNavProvider>
        <ToastProvider>
          {/* overflow-x-hidden (retour de Cindy du 2026-08-25, "pas de scroll
              droite gauche sur grand ecran surtout !... le responsive doit etre
              nickel") : filet de sécurité au niveau de la page entière. */}
          <div className="flex flex-1 flex-col overflow-x-hidden">
            <RealtimeSync />
            {/* Retour de Cindy du 2026-08-22 : logo seul (plus de texte "UBAC" à
                côté — la photo de profil ci-dessous porte désormais l'identité
                de la page). Bandeau unifié (direction artistique du
                2026-08-23) : avatar + "Bonjour" + prénom à gauche, grand logo
                en filigrane semi-transparent à droite (derrière les icônes,
                jamais au-dessus : pointer-events-none), icônes fonctionnelles
                inchangées par-dessus. Pas d'overflow-hidden ici (retour de
                Cindy du 2026-08-25, "quand je clique sur les notifications,
                elles sont masquées") : combiné à position sticky, ça rognait
                le popover des notifications dès qu'il dépassait la hauteur de
                l'en-tête. */}
            <header className="sticky top-0 z-10 relative bg-gradient-to-br from-navy via-navy to-navy-dark px-4 py-4 shadow-md sm:px-6 sm:py-5">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.06] to-transparent"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -right-2 top-1/2 h-28 w-28 -translate-y-1/2 bg-contain bg-right bg-no-repeat opacity-25 sm:h-36 sm:w-36"
                style={{ backgroundImage: "url(/logo.png)" }}
              />
              <div className="relative mx-auto flex w-full max-w-[1600px] flex-row items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <AvatarUpload userId={user.id} avatarUrl={profile?.avatar_url ?? null} name={displayFirstName} size="lg" />
                  <div className="min-w-0">
                    {roleLabel && (
                      // Retour de Cindy du 08/11 ("décalage avec Bonjour
                      // Basile", "texte pas centré dans la pastille") :
                      // -ml-2 compense exactement le px-2 de la pastille
                      // pour que SON TEXTE (pas son contour arrondi) démarre
                      // à la même abscisse que "Bonjour"/le prénom juste en
                      // dessous. leading-none seul ne suffisait pas : même
                      // à hauteur de ligne 1, la police réserve plus
                      // d'espace sous la ligne de base (prévu pour des
                      // jambages absents en majuscules) qu'au-dessus --
                      // pt/pb asymétriques (au lieu de py-0.5) pour
                      // compenser à l'œil, police légèrement réduite (9px).
                      // Retour de Cindy du 10/11 ("Secrétaire / Secrétaire
                      // adjointe" coupé/replié sur 2 lignes, nom réduit à
                      // "Bas...") : le plus long des libellés de rôle
                      // (BUREAU_ROLE_LABELS) n'avait ni troncature ni
                      // whitespace-nowrap -- repliait sur 2 lignes au lieu
                      // de suivre la même dégradation propre que le prénom
                      // juste en dessous (déjà truncate). max-w-full pour
                      // se limiter à la largeur réellement dispo (le parent
                      // min-w-0 l'autorise déjà à rétrécir).
                      <span className="mb-1 -ml-2 inline-flex max-w-full items-center truncate whitespace-nowrap rounded-full bg-white/15 px-2 pb-[3px] pt-1 text-[9px] font-semibold uppercase leading-none tracking-wide text-white">
                        {roleLabel}
                      </span>
                    )}
                    <p className="text-xs font-semibold uppercase tracking-wide text-ubac-yellow">
                      Bonjour
                    </p>
                    <h1 className="truncate text-xl font-bold text-white sm:text-2xl">
                      {displayFirstName ? formatFirstName(displayFirstName) : "adhérent·e"}
                    </h1>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <OrgChartButton />
                  <NotificationBell />
                  <MobileMenuButton />
                </div>
              </div>
            </header>

            {children}
          </div>
        </ToastProvider>
      </SectionNavProvider>
    </MobileNavProvider>
  );
}
