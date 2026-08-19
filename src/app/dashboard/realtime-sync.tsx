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
  "event_carpool_reservations",
  "cotisations",
  "cotisation_payments",
  "team_players",
  "team_coaches",
  "players",
  "team_pending_coaches",
  "club_administrators",
  "whatsapp_groups",
  "whatsapp_group_members",
  // Ajoutées après l'audit du 360° : ces tables étaient écrites par l'app
  // sans être écoutées, donc leurs changements n'atteignaient les autres
  // rôles qu'après un F5.
  "teams", // création/renommage d'une équipe, lien du groupe WhatsApp
  "parent_player", // rattachement d'un parent à son enfant (espace Famille)
  "profiles", // nom, téléphone, email d'un compte — colonnes de contact
  "whatsapp_messages", // historique des messages par membre
  "collectes", // stages & événements payants
  "category_tariffs", // tarifs par catégorie
  // Besoins d'organisation (buvette, table de marque...) : déjà publiées
  // côté Supabase (20261012000000) mais jamais ajoutées ici — un "Je m'en
  // occupe" n'atteignait donc les autres onglets ouverts qu'après un F5
  // (trouvé lors de l'audit du 2026-08-20).
  "event_volunteer_needs",
  "event_volunteer_signups",
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
