import type { SupabaseClient } from "@supabase/supabase-js";

// Retour de Cindy du 10/11 ("Événements à la une") : mise en avant
// visuelle gérée par le Bureau, visible par tout le club (table
// featured_highlights, 20261120100000_featured_highlights.sql) --
// indépendante du calendrier, avec un rattachement optionnel à un vrai
// événement (event_id). Une seule requête, appelée une fois par page
// serveur (page.tsx, enfant/view/page.tsx) et descendue en props --
// jamais une requête séparée par espace.
export type FeaturedHighlight = {
  id: string;
  title: string;
  imageUrl: string | null;
  linkUrl: string | null;
  endDate: string | null;
  eventId: string | null;
  eventStartTime: string | null;
};

export async function getActiveFeaturedHighlights(
  supabase: SupabaseClient
): Promise<FeaturedHighlight[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("featured_highlights")
    .select("id, title, image_url, link_url, end_date, event_id, events(start_time)")
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[featured-highlights] lecture a échoué:", error);
    return [];
  }

  return (data ?? []).map((row) => {
    const event = row.events as unknown as { start_time: string } | null;
    return {
      id: row.id,
      title: row.title,
      imageUrl: row.image_url,
      linkUrl: row.link_url,
      endDate: row.end_date,
      eventId: row.event_id,
      eventStartTime: event?.start_time ?? null,
    };
  });
}
