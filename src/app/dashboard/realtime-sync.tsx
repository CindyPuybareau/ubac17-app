"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Tables that any role (Bureau/Coach/Parent) can mutate and that another
// role needs to see reflected without pressing F5 — the "360°" sync rule.
const WATCHED_TABLES = [
  "events",
  "rsvps",
  "event_tasks",
  "event_carpool_offers",
  "cotisations",
  "team_players",
  "team_coaches",
  "players",
  "team_pending_coaches",
  "club_administrators",
] as const;

// Mounted once at the dashboard root (src/app/dashboard/page.tsx) so it
// covers every role from a single place. Debounced: a batch write (e.g.
// "appel express" saving many rsvps at once) fires many change events in
// a burst, but should only trigger one router.refresh().
export default function RealtimeSync() {
  const router = useRouter();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("dashboard-sync");

    WATCHED_TABLES.forEach((table) => {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => {
            router.refresh();
          }, 800);
        }
      );
    });

    channel.subscribe();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
