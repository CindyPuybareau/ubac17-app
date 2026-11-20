"use server";

import { updateTag } from "next/cache";
import { getCurrentUser } from "@/lib/supabase/server";

// Retour de Cindy du 20/11 ("je viens de renommer les U11 Mixte en U11X,
// mais la modification ne se fait pas en instantané") : équipes et tarifs
// sont gardés 45 s en cache partagé (reference-cache.ts). Après un
// renommage de catégorie ou un tarif enregistré, on vide ce cache tout de
// suite pour que le nouveau nom / prix s'affiche dès le rafraîchissement,
// au lieu d'attendre la fin des 45 s. Ne lit ni n'écrit aucune donnée :
// seulement réservé à une personne connectée pour éviter les appels
// anonymes inutiles.
export async function refreshTeamsAndTariffsCache() {
  const user = await getCurrentUser();
  if (!user) return;
  updateTag("reference-teams");
  updateTag("reference-category-tariffs");
}
