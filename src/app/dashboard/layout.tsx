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

  const [profileResult, ownPlayerRowResult] = await Promise.all([
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
  ]);

  logQueryErrors("layout dashboard (header)", { profileResult, ownPlayerRowResult });

  const profile = profileResult.data;
  const ownPlayerRow = ownPlayerRowResult.data;
  const displayFirstName = profile?.first_name ?? ownPlayerRow?.first_name ?? null;

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
