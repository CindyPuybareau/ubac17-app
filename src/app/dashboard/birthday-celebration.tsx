"use client";

import { useEffect, useState } from "react";
import ConfettiBurst from "@/components/confetti-burst";

// Confettis le jour d'un anniversaire (retour de Cindy du 13/11,
// "calendrier fun") : une seule fois par jour et par personne sur ce
// téléphone (mémorisé localement), jamais à chaque ouverture du calendrier.
// Coach / Famille / Enfant seulement -- jamais côté Bureau (voir
// calendar-view.tsx). ConfettiBurst respecte déjà "réduire les animations".
export default function BirthdayCelebration({ celebrationKey }: { celebrationKey: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const storageKey = `ubac-birthday-${celebrationKey}`;
    let already = false;
    try {
      already = window.localStorage.getItem(storageKey) === "1";
    } catch {
      already = false;
    }
    if (already) return;
    const frame = requestAnimationFrame(() => {
      setShow(true);
      try {
        window.localStorage.setItem(storageKey, "1");
      } catch {
        // Stockage indisponible (navigation privée) : tant pis, les
        // confettis rejoueront simplement à la prochaine ouverture.
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [celebrationKey]);
  if (!show) return null;
  return <ConfettiBurst />;
}
