import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Client "système", sans session utilisateur : réservé aux routes serveur
// qui tournent hors d'un contexte de connexion (cron, webhooks) et qui ont
// besoin de lire/écrire au nom du club entier en contournant la RLS —
// nécessaire ici puisqu'un job planifié n'a ni auth.uid() ni cookie de
// session à présenter. La clé service_role ne doit JAMAIS atteindre le
// navigateur : ce fichier n'est importé que par du code serveur (routes
// API), jamais par un composant client.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  // .trim() : une clé collée depuis le presse-papier embarque parfois un
  // espace ou un saut de ligne en trop — invisible à l'œil dans le champ
  // Vercel, mais suffisant pour que l'en-tête HTTP construit avec cette
  // valeur soit rejeté (Headers.set: "..." is an invalid header value),
  // faisant échouer silencieusement absolument tout appel service_role.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY absente de l'environnement.");
  }
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
