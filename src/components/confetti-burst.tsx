"use client";

import { useEffect, useRef } from "react";

// Plein écran (retour de Cindy du 26/08, "quelque chose de wahou") — un
// canvas fixe qui recouvre tout le viewport plutôt que seulement la carte
// du résultat : `position: fixed` traverse un ancêtre `overflow-hidden`
// sans problème (seuls transform/filter/perspective créeraient un nouveau
// contexte qui le piégerait). Toujours pas de dépendance externe (cohérent
// avec le reste du projet). Une pluie de confettis + deux jets façon
// "canon à confettis" depuis les coins bas, avec gravité pour un vrai arc
// de chute. Se dessine seule pendant ~3,2s puis disparaît — jamais
// rejouée après (voir celebrated-matches.ts pour le "une seule fois par
// personne"). Respecte prefers-reduced-motion : aucune animation dans ce
// cas.
const COLORS = ["#F4C430", "#203090", "#4a5cba", "#f7d466", "#ffffff", "#22c55e"];
const RAIN_COUNT = 140;
const BURST_COUNT_PER_SIDE = 30;
const GRAVITY = 0.12;
// Retour de Cindy du 29/08 ("l'animation 3 fois au moins pour le moment") :
// un seul jet de chaque coin se lisait comme un simple sursaut plutôt
// qu'une vraie célébration — trois vagues espacées de 900ms, façon salves
// successives d'un vrai canon à confettis. DURATION_MS s'étend d'autant
// pour laisser la dernière vague retomber avant que le canvas s'efface.
const BURST_WAVES = 3;
const BURST_INTERVAL_MS = 900;
const DURATION_MS = 3200 + (BURST_WAVES - 1) * BURST_INTERVAL_MS;

type Particle = {
  x: number;
  y: number;
  size: number;
  color: string;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
};

function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export default function ConfettiBurst() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const rain: Particle[] = Array.from({ length: RAIN_COUNT }, () => ({
      x: Math.random() * width,
      y: -20 - Math.random() * height * 0.5,
      size: 5 + Math.random() * 6,
      color: randomColor(),
      vx: (Math.random() - 0.5) * 2,
      vy: 2.5 + Math.random() * 3,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 12,
    }));

    // Deux jets depuis les coins bas, direction opposée, avec une vitesse
    // verticale négative forte (vers le haut) — la gravité s'occupe
    // ensuite de les faire retomber en arc, comme un vrai canon à
    // confettis de fête.
    function burstFrom(originX: number, direction: number): Particle[] {
      return Array.from({ length: BURST_COUNT_PER_SIDE }, () => ({
        x: originX,
        y: height,
        size: 5 + Math.random() * 6,
        color: randomColor(),
        vx: direction * (3 + Math.random() * 5),
        vy: -(9 + Math.random() * 7),
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 14,
      }));
    }

    const particles = [...rain, ...burstFrom(0, 1), ...burstFrom(width, -1)];
    // Vague 0 déjà tirée juste au-dessus — les suivantes s'ajoutent
    // pendant la boucle, une fois leur tour venu.
    let nextWave = 1;

    const start = performance.now();
    let raf = 0;

    function draw(now: number) {
      if (!ctx) return;
      const elapsed = now - start;
      while (nextWave < BURST_WAVES && elapsed >= nextWave * BURST_INTERVAL_MS) {
        particles.push(...burstFrom(0, 1), ...burstFrom(width, -1));
        nextWave += 1;
      }
      ctx.clearRect(0, 0, width, height);
      particles.forEach((p) => {
        p.vy += GRAVITY;
        p.x += p.vx;
        p.y += p.vy;
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
      className="pointer-events-none fixed inset-0 z-50 h-screen w-screen"
    />
  );
}
