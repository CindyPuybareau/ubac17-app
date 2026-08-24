"use client";

import { useEffect, useState } from "react";
import CalendarView from "./calendar-view";

// Le calendrier complet (grille, filtres, RSVP...) est le morceau le plus
// lourd à monter côté client de tout Accueil — désormais fusionné avec les
// chiffres clés (retour de Cindy du 2026-08-21), il alourdissait le tout
// premier affichage de la page, qui se sentait plus lent qu'avant même si
// rien n'était cassé (confirmé par Cindy : "non c'est juste long"). Les
// chiffres clés (au-dessus, en Server Component, aucun JS client requis)
// s'affichent donc immédiatement, et le calendrier ne se monte qu'une
// fraction de seconde après — le temps total ne change pas vraiment, mais
// la page ne semble plus figée pendant que tout se prépare d'un coup.
export default function DeferredCalendar(props: React.ComponentProps<typeof CalendarView>) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!ready) {
    // Skeleton aux couleurs de marque plutôt qu'un gris générique (tâche 8
    // du topo "Maillot Neuf UBAC", retour de Cindy du 2026-08-24) — un
    // dégradé navy/or très discret, cohérent avec la pastille de
    // chargement pleine page (voir dashboard/loading.tsx).
    return (
      <div className="h-64 animate-pulse rounded-2xl border border-navy/10 bg-gradient-to-br from-navy/[0.04] via-ubac-yellow/[0.04] to-navy/[0.04]" />
    );
  }

  return <CalendarView {...props} />;
}
