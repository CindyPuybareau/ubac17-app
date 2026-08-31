"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// Destination du lien "connexion rapide par email" (voir connexion/page.tsx,
// handleOtpSubmit) — jamais /dashboard directement. /dashboard est une page
// serveur protégée : elle redirige vers /connexion dès qu'aucune session
// n'est encore visible dans les cookies, et l'échange du jeton du lien
// magique ne peut se faire QUE côté navigateur (il a besoin du vérificateur
// PKCE stocké localement par ce même navigateur au moment de la demande).
// Sans cette étape intermédiaire, le clic sur le lien renvoyait droit vers
// l'écran de connexion, sans le moindre message — un vrai mur silencieux.
export default function LienDeConnexionPage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    // getSession() attend la fin de l'échange automatique (detectSessionInUrl)
    // avant de répondre — pas besoin de le déclencher nous-mêmes.
    // .catch() (audit du 31/08, même filet que connexion/page.tsx pour un
    // souci réseau) : sans lui, un rejet laissait la page bloquée sur
    // "Connexion en cours..." indéfiniment au lieu de proposer de
    // redemander un lien.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        if (data.session) {
          router.replace("/dashboard");
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16 text-center">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
        <Image src="/logo.png" alt="UBAC" width={48} height={48} className="mx-auto h-12 w-12 object-contain" priority />
        {failed ? (
          <>
            <p className="mt-4 text-sm text-zinc-600">
              Ce lien de connexion a expiré ou a déjà été utilisé.
            </p>
            <Link
              href="/connexion"
              className="mt-3 inline-block font-semibold text-ubac-blue"
            >
              Redemander un lien
            </Link>
          </>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">Connexion en cours...</p>
        )}
      </div>
    </div>
  );
}
