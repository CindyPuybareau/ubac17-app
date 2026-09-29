"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Retour de Cindy du 25/09 ("obligé de rafraîchir, pas direct l'effacement") :
// une suppression d'inscription à un besoin faite côté Bureau ne disparaît
// pas tout de suite sur la carte bénévole déjà ouverte. Ces pages
// (/commission/[token], /benevole/view) n'ont ni session Supabase Auth ni
// policy RLS de SELECT pour le rôle "anon" sur les tables concernées
// (events, event_volunteer_needs, event_volunteer_signups...) -- un
// abonnement postgres_changes (voir RealtimeSync, dashboard/realtime-sync.tsx)
// n'y recevrait donc STRICTEMENT rien avec la clé publique. Repli simple :
// router.refresh() régulier (jamais de rechargement forcé de la page, ces
// liens publics n'ont aucun état de formulaire en cours à préserver de toute
// façon) -- réduit la fenêtre de donnée périmée à ~90s au lieu d'illimité,
// même esprit que VersionWatcher (src/app/version-watcher.tsx) pour la
// reprise au premier plan (visibilitychange).
export default function TokenPageAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible") router.refresh();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    const interval = setInterval(() => router.refresh(), 90 * 1000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(interval);
    };
  }, [router]);

  return null;
}
