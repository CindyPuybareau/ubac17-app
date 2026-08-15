"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAY_LABELS = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];
const MONTH_LABELS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const MINUTE_STEP = 5;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const STANDARD_MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// Même format qu'un <input type="datetime-local"> ("YYYY-MM-DDTHH:mm"),
// interprété en heure locale de bout en bout — jamais de passage par
// toISOString() ici, qui ferait glisser la date selon le fuseau.
function parseLocal(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  return {
    y: Number(match[1]),
    m: Number(match[2]) - 1,
    d: Number(match[3]),
    h: Number(match[4]),
    min: Number(match[5]),
  };
}

function toLocalValue(y: number, m: number, d: number, h: number, min: number) {
  return `${y}-${pad2(m + 1)}-${pad2(d)}T${pad2(h)}:${pad2(min)}`;
}

function formatDisplay(value: string): string | null {
  const p = parseLocal(value);
  if (!p) return null;
  const date = new Date(p.y, p.m, p.d, p.h, p.min);
  const text = date.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const capitalized = text.charAt(0).toUpperCase() + text.slice(1);
  return `${capitalized} à ${pad2(p.h)}:${pad2(p.min)}`;
}

// Grille fixe de 42 cases (6 semaines, lundi en premier) — inclut les
// derniers jours du mois précédent / premiers du suivant pour ne jamais
// casser la mise en page selon le mois affiché.
function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // getDay(): 0=dimanche -> 0=lundi
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

// Remplace les <input type="datetime-local"> bruts par un vrai composant :
// bouton affichant la date en clair, popover (desktop) / tiroir bas
// (mobile) avec grille de mois + listes déroulantes heure/minute. Mêmes
// value/onChange qu'un input natif ("YYYY-MM-DDTHH:mm") pour rester un
// remplacement direct dans les formulaires existants.
export default function DateTimePicker({
  value,
  onChange,
  placeholder = "Choisir une date et une heure",
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const parsed = parseLocal(value);
  const now = new Date();
  const [viewYear, setViewYear] = useState(parsed?.y ?? now.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.m ?? now.getMonth());

  // Si la valeur change depuis l'extérieur pendant que le picker est fermé
  // (reset de formulaire, ouverture d'un autre événement à éditer...), la
  // vue doit suivre — sinon la réouverture affiche encore l'ancien mois.
  useEffect(() => {
    if (open) return;
    const p = parseLocal(value);
    if (p) {
      setViewYear(p.y);
      setViewMonth(p.m);
    }
  }, [value, open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function fallbackDay(): number {
    if (now.getFullYear() === viewYear && now.getMonth() === viewMonth) return now.getDate();
    return 1;
  }

  function commitDay(d: Date) {
    const h = parsed?.h ?? now.getHours();
    const min = parsed?.min ?? Math.round(now.getMinutes() / MINUTE_STEP) * MINUTE_STEP;
    onChange(toLocalValue(d.getFullYear(), d.getMonth(), d.getDate(), h, min % 60));
  }

  function commitHour(h: number) {
    const y = parsed?.y ?? viewYear;
    const m = parsed?.m ?? viewMonth;
    const d = parsed?.d ?? fallbackDay();
    const min = parsed?.min ?? 0;
    onChange(toLocalValue(y, m, d, h, min));
  }

  function commitMinute(min: number) {
    const y = parsed?.y ?? viewYear;
    const m = parsed?.m ?? viewMonth;
    const d = parsed?.d ?? fallbackDay();
    const h = parsed?.h ?? now.getHours();
    onChange(toLocalValue(y, m, d, h, min));
  }

  function goMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  }

  const grid = buildMonthGrid(viewYear, viewMonth);
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const selectedKey = parsed ? `${parsed.y}-${parsed.m}-${parsed.d}` : null;
  const display = formatDisplay(value);

  // Une valeur existante peut avoir une minute "hors grille" (donnée créée
  // avant ce composant, ou importée) — on l'ajoute à la liste plutôt que de
  // la faire disparaître silencieusement du sélecteur.
  const minuteOptions =
    parsed && !STANDARD_MINUTES.includes(parsed.min)
      ? [...STANDARD_MINUTES, parsed.min].sort((a, b) => a - b)
      : STANDARD_MINUTES;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        id={id}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-left text-sm transition-colors hover:border-zinc-300 ${
          open ? "border-navy ring-1 ring-navy" : "border-zinc-200"
        }`}
      >
        <span className={display ? "text-zinc-900" : "text-zinc-400"}>
          {display ?? placeholder}
        </span>
        <Calendar className="h-4 w-4 shrink-0 text-zinc-400" />
      </button>

      {open && (
        <>
          {/* Fond assombri sur mobile (effet tiroir), invisible sur desktop
              (juste là pour fermer au clic en dehors du popover). */}
          <div
            className="fixed inset-0 z-40 bg-black/30 sm:bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white p-4 shadow-xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-2 sm:max-h-[420px] sm:w-80 sm:overflow-y-auto sm:rounded-2xl"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-zinc-200 sm:hidden" />

            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => goMonth(-1)}
                className="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100"
                aria-label="Mois précédent"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-zinc-900">
                {MONTH_LABELS[viewMonth]} {viewYear}
              </span>
              <button
                type="button"
                onClick={() => goMonth(1)}
                className="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100"
                aria-label="Mois suivant"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-zinc-400">
              {WEEKDAY_LABELS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {grid.map((d) => {
                const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
                const inMonth = d.getMonth() === viewMonth;
                const isToday = key === todayKey;
                const isSelected = key === selectedKey;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => commitDay(d)}
                    className={`aspect-square rounded-full text-sm transition-colors ${
                      isSelected
                        ? "bg-navy font-semibold text-white"
                        : isToday
                          ? "border border-navy/40 font-semibold text-navy"
                          : inMonth
                            ? "text-zinc-700 hover:bg-zinc-100"
                            : "text-zinc-300 hover:bg-zinc-50"
                    }`}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-3">
              <span className="text-xs font-medium text-zinc-500">Heure</span>
              <select
                value={parsed?.h ?? ""}
                onChange={(e) => commitHour(Number(e.target.value))}
                className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm"
              >
                {!parsed && (
                  <option value="" disabled>
                    --
                  </option>
                )}
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {pad2(h)}
                  </option>
                ))}
              </select>
              <span className="text-zinc-400">:</span>
              <select
                value={parsed?.min ?? ""}
                onChange={(e) => commitMinute(Number(e.target.value))}
                className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm"
              >
                {!parsed && (
                  <option value="" disabled>
                    --
                  </option>
                )}
                {minuteOptions.map((m) => (
                  <option key={m} value={m}>
                    {pad2(m)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-auto rounded-full bg-ubac-yellow px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark"
              >
                Valider
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
