"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, CalendarDays } from "lucide-react";

export type ChildNotification = {
  id: string;
  teamName: string | null;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

// Même comportement que NotificationBell côté Espace Parent (voir
// dashboard/notification-bell.tsx), avec deux différences imposées par
// l'architecture enfant (pas d'auth.uid(), pas de session Supabase) :
// - la liste initiale vient en props de page.tsx (lue en service_role),
//   pas d'un rpc() appelé directement par ce composant ;
// - "marquer comme lu" et le bouton on/off passent chacun par une route
//   API dédiée (/api/child-notifications/*) qui revérifie le cookie de
//   session avant d'écrire — jamais un appel Supabase direct depuis ce
//   composant, pour rester fidèle à l'architecture "aucune écriture,
//   même en théorie" du reste de l'Espace Enfant (seules ces deux routes,
//   volontairement très étroites, y dérogent).
export default function ChildNotificationBell({
  initialNotifications,
  initialEnabled,
}: {
  initialNotifications: ChildNotification[];
  initialEnabled: boolean;
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const [savingPref, setSavingPref] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) {
      setMarking(true);
      try {
        const res = await fetch("/api/child-notifications/read-all", { method: "POST", credentials: "same-origin" });
        // Optimiste seulement si l'écriture a vraiment réussi côté serveur
        // — sinon le badge se remettrait à jour tout seul en apparence
        // sans que la lecture soit réellement enregistrée en base.
        if (res.ok) {
          const now = new Date().toISOString();
          setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
        }
      } catch {
        // Silencieux : le badge restera simplement à jour au prochain
        // chargement de la page si cette requête échoue.
      } finally {
        setMarking(false);
      }
    }
  }

  async function togglePreference() {
    const next = !enabled;
    setSavingPref(true);
    try {
      const res = await fetch("/api/child-notifications/preference", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (res.ok) setEnabled(next);
    } catch {
      // Le bouton reste sur son état précédent si la requête échoue.
    } finally {
      setSavingPref(false);
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
        <Bell className="h-5 w-5 shrink-0" />
        {enabled && unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        // Même correction que NotificationBell côté Espace Parent (voir
        // dashboard/notification-bell.tsx) : fixed + marges fixes sur
        // mobile, ancré au viewport plutôt qu'au bouton, pour ne jamais
        // dépasser de l'écran quelle que soit la position de la cloche.
        <div className="fixed inset-x-4 top-16 z-30 overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80">
          <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
            <p className="text-sm font-semibold text-zinc-900">Notifications</p>
            {marking && <span className="text-[11px] text-zinc-400">Mise à jour...</span>}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {!enabled ? (
              <p className="px-4 py-6 text-center text-sm text-zinc-400">
                Notifications désactivées.
              </p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-zinc-400">Aucune notification pour le moment.</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex gap-2.5 border-b border-zinc-50 px-4 py-3 last:border-b-0 ${
                    !n.readAt ? "bg-ubac-yellow/5" : ""
                  }`}
                >
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-navy" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-zinc-900">{n.title}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">{n.body}</p>
                    <p className="mt-1 text-[11px] text-zinc-400">
                      {n.teamName ? `${n.teamName} · ` : ""}
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

          <div className="border-t border-zinc-100 px-4 py-3">
            <button
              type="button"
              onClick={togglePreference}
              disabled={savingPref}
              className={`flex w-full items-center justify-between gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                enabled
                  ? "border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                  : "bg-navy text-white hover:brightness-110"
              }`}
            >
              <span className="flex items-center gap-1.5">
                {enabled ? <BellOff className="h-3.5 w-3.5 shrink-0" /> : <Bell className="h-3.5 w-3.5 shrink-0" />}
                {savingPref ? "..." : enabled ? "Désactiver les notifications" : "Activer les notifications"}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
