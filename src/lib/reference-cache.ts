import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";

// Retour de Cindy du 15/09 ("faire venir les informations plus tard...
// trouver des combines") : teams/category_tariffs/access_profiles changent
// rarement (une nouvelle équipe, un tarif ajusté... quelques fois par
// saison) mais étaient jusqu'ici redemandées à la base à chaque
// changement d'onglet (Bureau/Coach/Famille), pour TOUT le monde. Mises en
// cache ici 45s (partagé entre tous les visiteurs, pas par utilisateur) :
// une modification (ajout d'équipe, tarif...) met au plus 45s à apparaître
// partout, contre un aller-retour base en moins à chaque clic le reste du
// temps. Jamais utilisé pour du calendrier/présences/paiements, qui
// restent toujours calculés en direct (voir page.tsx).
//
// createServiceClient (contourne la RLS) plutôt que le client lié à la
// session : unstable_cache interdit d'appeler cookies() (donc le client
// serveur habituel) à l'intérieur de la fonction mise en cache, et de
// toute façon la valeur cachée doit être la même quel que soit qui
// l'a déclenchée en premier. Sûr ici seulement parce que ces 3 tables
// renvoient des lignes identiques pour tout le monde côté club (vérifié
// dans pg_policies : "teams" a `using (true)`, category_tariffs/
// access_profiles sont réservées au Bureau mais sans filtre par
// administrateur précis) -- jamais un pattern à réutiliser pour une table
// dont le contenu dépend de qui regarde.
const REVALIDATE_SECONDS = 45;

export const getCachedTeams = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    return supabase
      .from("teams")
      .select(
        "id, name, category, ffbb_url, ffbb_last_synced_at, pending_coach_names, sort_order, photo_url"
      )
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("category");
  },
  ["reference-teams"],
  { revalidate: REVALIDATE_SECONDS, tags: ["reference-teams"] }
);

export const getCachedCategoryTariffs = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    return supabase.from("category_tariffs").select("category, prix").order("category");
  },
  ["reference-category-tariffs"],
  { revalidate: REVALIDATE_SECONDS, tags: ["reference-category-tariffs"] }
);

export const getCachedAccessProfiles = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    return supabase
      .from("access_profiles")
      .select("id, name, access_profile_briques(brique)")
      .order("name");
  },
  ["reference-access-profiles"],
  { revalidate: REVALIDATE_SECONDS, tags: ["reference-access-profiles"] }
);
