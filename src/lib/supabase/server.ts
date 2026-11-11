import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from a Server Component — ignored when middleware refreshes sessions.
          }
        },
      },
    }
  );
}

// Le proxy (lib/supabase/middleware.ts) a déjà validé la session auprès du
// serveur Auth (getUser, aller-retour réseau) et rafraîchi les jetons avant
// d'arriver ici : layout et page n'ont plus qu'à vérifier localement la
// signature du JWT (getClaims, clés ES256 gardées en cache global par
// auth-js). cache() : un seul appel par requête, partagé entre le layout et
// la page -- au lieu de deux getUser() réseau successifs.
export const getCurrentUser = cache(async (): Promise<{ id: string; email: string | undefined } | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined };
});
