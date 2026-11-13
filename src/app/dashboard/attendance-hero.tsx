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
  subtitle = "de présence en moyenne",
  tone = "club",
}: {
  title: string;
  // 0-100, null quand aucun entraînement n'a eu lieu sur la période.
  rate: number | null;
  className?: string;
  subtitle?: string;
  // "personal" (Famille / Enfant, retour de Cindy du 13/11) : verdicts
  // encourageants plutôt qu'un "À surveiller" adressé à un enfant.
  tone?: "club" | "personal";
}) {
  const labels =
    tone === "personal"
      ? { low: "Chaque entraînement compte", mid: "Bonne présence", high: "Super assiduité !" }
      : { low: "À surveiller", mid: "Correct", high: "Excellent" };
  const verdict =
    rate === null
      ? null
      : rate < 50
        ? { label: labels.low, className: "bg-red-500/20 text-red-200" }
        : rate < 80
          ? { label: labels.mid, className: "bg-amber-400/20 text-amber-200" }
          : { label: labels.high, className: "bg-emerald-400/20 text-emerald-200" };
  return (
    <div className={`flex items-center gap-4 bg-gradient-to-br from-navy via-navy to-navy-dark px-4 py-4 ${className}`}>
      <ProgressRing rate={rate} />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ubac-yellow">{title}</p>
        <p className="mt-0.5 text-sm font-medium text-white/85">{subtitle}</p>
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
// strokeClassName : couleur imposée (bandeau "matchs", toujours jaune club) ;
// sinon couleur selon le taux (présence).
export function ProgressRing({ rate, strokeClassName }: { rate: number | null; strokeClassName?: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(rate ?? 0));
    return () => cancelAnimationFrame(frame);
  }, [rate]);
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const stroke =
    rate === null
      ? "stroke-white/30"
      : (strokeClassName ??
        (rate < 50 ? "stroke-red-400" : rate < 80 ? "stroke-amber-400" : "stroke-emerald-400"));
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
      {/* Retour de Cindy du 13/11 ("100 % déborde de l'anneau") : taille
          adaptée au nombre de chiffres, et le "%" en plus petit. */}
      <span className="absolute inset-0 flex items-center justify-center whitespace-nowrap font-bold tabular-nums text-white">
        {rate === null ? (
          <span className="text-lg">—</span>
        ) : (
          <>
            <span className={Math.round(rate) >= 100 ? "text-base" : "text-lg"}>
              <AnimatedNumber value={rate} kind="integer" />
            </span>
            <span className="ml-0.5 text-[11px] font-semibold text-white/80">%</span>
          </>
        )}
      </span>
    </div>
  );
}

// Cases "matchs" sous le bandeau (Famille / Enfant, retour de Cindy du
// 13/11) : icône de couleur, présent / total en gros, type en dessous --
// même famille que les cases du résumé d'équipe du Bilan de la saison.
// Seuls les types qui ont eu au moins un rendez-vous apparaissent.
export type PresenceTile = {
  key: string;
  label: string;
  present: number;
  total: number;
  icon: React.ReactNode;
  toneClassName: string;
};

export function PresenceTiles({ tiles }: { tiles: PresenceTile[] }) {
  const shown = tiles.filter((t) => t.total > 0);
  if (shown.length === 0) return null;
  const cols = shown.length === 1 ? "grid-cols-1" : shown.length === 2 || shown.length === 4 ? "grid-cols-2" : "grid-cols-3";
  return (
    <div className={`grid gap-2 ${cols}`}>
      {shown.map((t) => (
        <div key={t.key} className="flex flex-col items-center gap-1 rounded-xl bg-zinc-50 px-1.5 py-2 text-center">
          <span className={`flex h-7 w-7 items-center justify-center rounded-full ${t.toneClassName}`}>{t.icon}</span>
          <span className="text-lg font-bold leading-none tabular-nums text-zinc-900">
            {t.present}
            <span className="text-sm font-semibold text-zinc-400">/{t.total}</span>
          </span>
          <span className="text-[11px] font-medium leading-tight text-zinc-500">{t.label}</span>
        </div>
      ))}
    </div>
  );
}
