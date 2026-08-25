"use client";

import { useEffect, useRef, useState } from "react";

// Côté serveur (premier rendu SSR), window n'existe pas — sans mouvement
// par défaut dans ce cas, l'hydratation côté client corrige aussitôt avec
// la vraie préférence système.
function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Petite animation d'apparition au scroll (fondu + léger décalage vers le
// haut) — un simple IntersectionObserver, pas de dépendance externe.
// Déclenchée une seule fois par élément (pas de va-et-vient en remontant
// la page). Respecte prefers-reduced-motion : apparition immédiate, sans
// mouvement, pour qui a demandé moins d'animations au niveau système — géré
// via l'état initial plutôt qu'un setState synchrone dans l'effet
// (react-hooks/purity), l'observer ne s'installe alors même jamais.
export default function RevealOnScroll({
  children,
  delayMs = 0,
  className = "",
}: {
  children: React.ReactNode;
  // Décalage pour un effet en cascade entre plusieurs éléments voisins
  // (voir la section chiffres clés, page.tsx).
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(prefersReducedMotion);

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
      } ${className}`}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  );
}
