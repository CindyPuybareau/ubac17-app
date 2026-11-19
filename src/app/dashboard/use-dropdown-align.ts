"use client";

// Menus déroulants qui restent dans l'écran (retour de Cindy du 19/11,
// "le responsive sur le filtre n'est pas bon... checker ce type de filtre
// pour ne pas que ce soit ailleurs") : à l'ouverture, on mesure la place
// disponible autour du bouton et le menu s'ouvre vers la droite (aligné sur
// le bord gauche du bouton) ou vers la gauche (aligné sur son bord droit),
// selon ce qui tient. Mesure faite au clic, jamais pendant l'affichage.
import { useCallback, useRef, useState } from "react";

const GUTTER = 16;

export function useDropdownAlign<T extends HTMLElement>(panelWidth: number) {
  const anchorRef = useRef<T>(null);
  const [align, setAlign] = useState<"left" | "right">("left");

  const measure = useCallback(() => {
    const el = anchorRef.current;
    if (!el || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    const viewport = window.innerWidth;
    const width = Math.min(panelWidth, viewport - GUTTER * 2);
    const fitsOpeningRight = rect.left + width <= viewport - GUTTER;
    const fitsOpeningLeft = rect.right - width >= GUTTER;
    setAlign(fitsOpeningRight || !fitsOpeningLeft ? "left" : "right");
  }, [panelWidth]);

  // Classe Tailwind à poser sur le menu (en plus d'une largeur fixe et de
  // max-w-[calc(100vw-2rem)] pour ne jamais dépasser la largeur de l'écran).
  const alignClass = align === "left" ? "left-0" : "right-0";

  return { anchorRef, measure, alignClass };
}
