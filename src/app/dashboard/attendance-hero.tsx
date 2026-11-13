"use client";

import { useEffect, useState } from "react";
import AnimatedNumber from "./animated-number";

// Bandeau "présence aux entraînements" (retour de Cindy du 13/11, "plus
// touchy, plus sexy... on peut le faire aussi comme ça dans le tableau de
// bord") : partagé par le résumé d'équipe du Bilan de la saison et la carte
// "Entraînements du mois" du tableau de bord -- bandeau bleu de l'appli,
// anneau de progression coloré selon le taux, pastille de verdict. Mêmes
// seuils que les barres des joueurs : < 50 % rouge, < 80 % orange, sinon
// vert.
export function AttendanceHero({
  title,
  rate,
  className = "",
}: {
  title: string;
  // 0-100, null quand aucun entraînement n'a eu lieu sur la période.
  rate: number | null;
  className?: string;
}) {
  const verdict =
    rate === null
      ? null
      : rate < 50
        ? { label: "À surveiller", className: "bg-red-500/20 text-red-200" }
        : rate < 80
          ? { label: "Correct", className: "bg-amber-400/20 text-amber-200" }
          : { label: "Excellent", className: "bg-emerald-400/20 text-emerald-200" };
  return (
    <div className={`flex items-center gap-4 bg-gradient-to-br from-navy via-navy to-navy-dark px-4 py-4 ${className}`}>
      <ProgressRing rate={rate} />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ubac-yellow">{title}</p>
        <p className="mt-0.5 text-sm font-medium text-white/85">de présence en moyenne</p>
        {verdict && (
          <span className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${verdict.className}`}>
            {verdict.label}
          </span>
        )}
      </div>
    </div>
  );
}

// Anneau de progression : se remplit à l'apparition (sauf "réduire les
// animations"), le pourcentage grimpe en même temps (AnimatedNumber).
function ProgressRing({ rate }: { rate: number | null }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(rate ?? 0));
    return () => cancelAnimationFrame(frame);
  }, [rate]);
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const stroke =
    rate === null ? "stroke-white/30" : rate < 50 ? "stroke-red-400" : rate < 80 ? "stroke-amber-400" : "stroke-emerald-400";
  return (
    <div className="relative h-[76px] w-[76px] shrink-0">
      <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="38" cy="38" r={radius} fill="none" strokeWidth="7" className="stroke-white/15" />
        <circle
          cx="38"
          cy="38"
          r={radius}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(shown, 100) / 100)}
          className={`${stroke} transition-[stroke-dashoffset] duration-[900ms] ease-out motion-reduce:transition-none`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-lg font-bold tabular-nums text-white">
        {rate === null ? "—" : <AnimatedNumber value={rate} kind="percent" />}
      </span>
    </div>
  );
}
