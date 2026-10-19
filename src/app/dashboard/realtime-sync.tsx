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
  // Retour de Cindy du 19/10 ("supprime les groupes WhatsApp de partout") :
  // whatsapp_groups reste ici -- partagée avec "Accès Commissions &
  // Administration" (category='COMMISSION'), toujours modifiée en direct
  // par le Bureau. whatsapp_group_members et whatsapp_messages, eux,
  // retirés en même temps que le reste de "Groupes WhatsApp" : plus aucun
  // lecteur/écrivain dans l'appli, les tables restent en base (jamais
  // purgées) mais n'ont plus besoin d'être écoutées.
  "whatsapp_groups",
  // Ajoutées après l'audit du 360° : ces tables étaient écrites par l'app
  // sans être écoutées, donc leurs changements n'atteignaient les autres
  // rôles qu'après un F5.
  "teams", // création/renommage d'une équipe
  "parent_player", // rattachement d'un parent à son enfant (espace Famille)
  "profiles", // nom, téléphone, email d'un compte — colonnes de contact
  "collectes", // stages & événements payants
  "category_tariffs", // tarifs par catégorie
  // Besoins d'organisation (buvette, table de marque...) : déjà publiées
  // côté Supabase (20261012000000) mais jamais ajoutées ici — un "Je m'en
  // occupe" n'atteignait donc les autres onglets ouverts qu'après un F5
  // (trouvé lors de l'audit du 2026-08-20).
  "event_volunteer_needs",
  "event_volunteer_signups",
  "club_reports", // comptes rendus mairies/Bureau/coachs (audit du 01/09)
  "match_official_roles", // Organisation match à domicile (retour du 17/09)
  // Retour de Cindy du 16/10 ("Inventaire") : Bureau ET coachs modifient la
  // même liste -- cas typique de la règle 360° (contrairement à sponsors,
  // Bureau seul, jamais ajouté ici).
  "inventory_items",
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
