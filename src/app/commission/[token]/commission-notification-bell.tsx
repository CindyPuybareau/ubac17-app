"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, CalendarDays } from "lucide-react";

export type CommissionNotification = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
};

function storageKey(groupId: string) {
  return `ubac_commission_notif_seen_${groupId}`;
}

// Retour de Cindy du 13/09 ("via leur espace dédié... ils ont un lien qui
// leur ouvre un espace") : contrairement aux 3 autres cloches (Bureau/Coach/
// Famille via auth.uid(), bénévole/enfant via un cookie de session propre à
// UNE personne), le lien d'une commission est PARTAGÉ par tout un groupe,
// sans identité individuelle — vérifié en base le 13/09, 8 commissions sur
// 9 n'ont d'ailleurs aucun membre recensé dans l'appli. Impossible donc de
// savoir QUI a déjà vu une notification : marquer "lu" côté serveur
// marquerait la notification comme vue pour toute la commission dès qu'UNE
// seule personne ouvre la cloche. Le repère "lu jusqu'à telle date" vit
// donc dans le navigateur de CHAQUE visiteur (localStorage), jamais en
// base — comportement confirmé par Cindy ("localStorage par appareil").
export default function CommissionNotificationBell({
  groupId,
  notifications,
}: {
  groupId: string;
  notifications: CommissionNotification[];
}) {
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  // Distingue "pas encore lu le localStorage" de "rien vu pour l'instant" :
  // sans ça, le tout premier rendu (serveur, puis client avant l'effet
  // ci-dessous) afficherait un badge basé sur AUCUN repère plutôt que sur
  // le vrai dernier passage de ce navigateur -- un mismatch d'hydratation
  // React en plus d'un badge temporairement faux.
  const [hydrated, setHydrated] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(storageKey(groupId));
    } catch {
      seen = null;
    }
    setLastSeen(seen);
    setHydrated(true);
  }, [groupId]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const unreadCount = hydrated
    ? notifications.filter((n) => !lastSeen || n.createdAt > lastSeen).length
    : 0;

  // Shake joué une seule fois, seulement une fois qu'on sait vraiment s'il
  // y a du non-lu (après hydratation) — jamais avant, pour ne pas se fier
  // à un badge encore à zéro par construction (voir hydrated ci-dessus).
  const [shake, setShake] = useState(false);
  const shakeTriggeredRef = useRef(false);
  useEffect(() => {
    if (!hydrated || shakeTriggeredRef.current) return;
    shakeTriggeredRef.current = true;
    if (unreadCount > 0) {
      setShake(true);
      const t = setTimeout(() => setShake(false), 600);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) {
      // Le plus récent des createdAt suffit (pas besoin de Date.now(),
      // jamais en avance sur les notifications déjà reçues) : marque tout
      // ce qui est affiché comme vu par CE navigateur, en une fois.
      const latest = notifications.reduce(
        (max, n) => (n.createdAt > max ? n.createdAt : max),
        lastSeen ?? ""
      );
      try {
        localStorage.setItem(storageKey(groupId), latest);
      } catch {
        // Silencieux : le badge réapparaîtra simplement à la prochaine
        // visite si localStorage est indisponible (navigation privée...).
      }
      setLastSeen(latest);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        aria-label="Notifications"
        className="relative flex items-center gap-1.5 rounded-lg p-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
      >
        <Bell className={`h-5 w-5 shrink-0 ${shake ? "animate-bell-shake" : ""}`} />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-4 top-16 z-30 overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80">
          <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
            <p className="text-sm font-semibold text-zinc-900">Notifications</p>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-zinc-400">Aucune notification pour le moment.</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex gap-2.5 border-b border-zinc-50 px-4 py-3 last:border-b-0 ${
                    hydrated && (!lastSeen || n.createdAt > lastSeen) ? "bg-ubac-yellow/5" : ""
                  }`}
                >
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-navy" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-zinc-900">{n.title}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">{n.body}</p>
                    <p className="mt-1 text-[11px] text-zinc-400">
                      {new Date(n.createdAt).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
