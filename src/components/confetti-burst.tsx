"use client";

import { useEffect, useRef } from "react";

// Petite pluie de confettis en canvas — pas de dépendance externe, cohérent
// avec le reste du projet (voir image-resize.ts, batch.ts...). Contenue
// dans son parent : celui-ci doit être `relative overflow-hidden`, ce
// composant se pose en `absolute inset-0` par-dessus. Se dessine seule
// pendant ~2,5s puis s'efface — jamais rejouée après (voir
// celebrated-matches.ts pour le "une seule fois par personne").
const COLORS = ["#F4C430", "#203090", "#4a5cba", "#f7d466", "#ffffff"];
const PARTICLE_COUNT = 70;
const DURATION_MS = 2500;

export default function ConfettiBurst() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Respect du système : aucune animation ne se déclenche pour qui a
    // demandé moins de mouvement.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * width,
      y: -20 - Math.random() * height * 0.6,
      size: 4 + Math.random() * 5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      speedY: 2 + Math.random() * 2.5,
      speedX: (Math.random() - 0.5) * 2,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10,
    }));

    const start = performance.now();
    let raf = 0;

    function draw(now: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      particles.forEach((p) => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.rotation += p.rotationSpeed;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });
      if (now - start < DURATION_MS) {
        raf = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    }
    raf = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
