"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

// Compte à rebours avant un match (retour de Cindy du 13/11, "un peu de
// fun") : "Dans 3 jours", "Demain", "Aujourd'hui · dans 3 h", "Dans 45 min",
// "En cours". Calculé seulement après montage (l'heure du serveur et celle
// du téléphone diffèrent, jamais de décalage d'affichage au chargement),
// puis remis à jour chaque minute. Rien une fois le match terminé.
function parisDayKey(d: Date): string {
  return d.toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
}

function countdownLabel(start: Date, end: Date | null, now: Date): { text: string; live: boolean; soon: boolean } | null {
  const ms = start.getTime() - now.getTime();
  const endMs = (end ?? new Date(start.getTime() + 2 * 60 * 60 * 1000)).getTime();
  if (ms <= 0) {
    return now.getTime() < endMs ? { text: "En cours", live: true, soon: true } : null;
  }
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return { text: `Dans ${minutes} min`, live: false, soon: true };
  const sameDay = parisDayKey(start) === parisDayKey(now);
  if (sameDay) return { text: `Aujourd'hui · dans ${Math.round(minutes / 60)} h`, live: false, soon: true };
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (parisDayKey(start) === parisDayKey(tomorrow)) return { text: "Demain", live: false, soon: true };
  // Jours calendaires (Paris) plutôt que des tranches de 24 h.
  const startDay = new Date(`${parisDayKey(start)}T00:00:00Z`).getTime();
  const today = new Date(`${parisDayKey(now)}T00:00:00Z`).getTime();
  const days = Math.round((startDay - today) / (24 * 60 * 60 * 1000));
  return { text: `Dans ${days} jours`, live: false, soon: false };
}

export default function MatchCountdown({ startTime, endTime }: { startTime: string; endTime?: string | null }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setNow(new Date()));
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(interval);
    };
  }, []);
  if (!now) return null;
  const label = countdownLabel(new Date(startTime), endTime ? new Date(endTime) : null, now);
  if (!label) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        label.live
          ? "bg-red-500 text-white"
          : label.soon
            ? "bg-ubac-yellow text-navy"
            : "bg-ubac-yellow/20 text-ubac-yellow-dark"
      }`}
    >
      {label.live ? (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
        </span>
      ) : (
        <Timer className="h-3 w-3" />
      )}
      {label.text}
    </span>
  );
}
