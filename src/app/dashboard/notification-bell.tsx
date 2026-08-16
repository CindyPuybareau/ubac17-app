"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { teamLabel } from "@/lib/teams";
import PushSubscribe from "./push-subscribe";

type NotificationRow = {
  id: string;
  team_id: string | null;
  team_name: string | null;
  event_id: string | null;
  title: string;
  body: string;
  url: string | null;
  created_at: string;
  read_at: string | null;
};

// Historique 30 derniers jours (côté écran, pas côté requête — la fonction
// renvoie déjà tout ce qui compte) : matchs, entraînements, changements
// d'horaire, demandes de présence — tout ce qui passe aujourd'hui par
// sendEventPush()/request-attendance-button.tsx, désormais aussi loggé en
// base (voir la migration 20260817000000_notifications.sql).
export default function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase.rpc("notifications_for_me", { p_limit: 30 });
    setNotifications((data as NotificationRow[] | null) ?? []);
  }

  useEffect(() => {
    load();
    // Rafraîchi périodiquement plutôt qu'en temps réel (pas d'abonnement
    // Realtime dédié pour ce premier jet) : un décalage d'une minute sur
    // le compteur non-lu est sans conséquence pour ce genre d'alerte.
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const unreadCount = (notifications ?? []).filter((n) => !n.read_at).length;

  // Ouvrir la cloche vaut prise de connaissance : marque tout ce qui est
  // affiché comme lu en une seule fois, plutôt qu'un clic par ligne — plus
  // simple, et c'est le comportement attendu d'une cloche de
  // notifications.
  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) {
      setMarking(true);
      const supabase = createClient();
      await supabase.rpc("mark_all_notifications_read");
      setMarking(false);
      load();
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
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-xl">
          <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
            <p className="text-sm font-semibold text-zinc-900">Notifications</p>
            {marking && <span className="text-[11px] text-zinc-400">Mise à jour...</span>}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications === null ? (
              <p className="px-4 py-6 text-center text-sm text-zinc-400">Chargement...</p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-zinc-400">Aucune notification pour le moment.</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex gap-2.5 border-b border-zinc-50 px-4 py-3 last:border-b-0 ${
                    !n.read_at ? "bg-ubac-yellow/5" : ""
                  }`}
                >
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-navy" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-zinc-900">{n.title}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">{n.body}</p>
                    <p className="mt-1 text-[11px] text-zinc-400">
                      {n.team_name ? `${teamLabel({ name: n.team_name })} · ` : ""}
                      {new Date(n.created_at).toLocaleDateString("fr-FR", {
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

          {/* Interrupteur "recevoir les notifications" : même composant que
              partout ailleurs dans l'app (family-view.tsx, coach-view.tsx),
              simplement rendu accessible directement depuis la cloche
              plutôt qu'enfoui dans un onglet. */}
          <div className="border-t border-zinc-100 px-4 py-3">
            <PushSubscribe />
          </div>
        </div>
      )}
    </div>
  );
}
