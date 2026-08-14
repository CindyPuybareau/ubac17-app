import { createClient } from "@supabase/supabase-js";
import { styleFor, isMatchType, homeAwayLabel } from "@/app/dashboard/event-style";
import { parseMatchTitle } from "@/lib/match-display";
import { venueQuery } from "@/app/dashboard/salles";

// Route délibérément anonyme : une appli d'agenda qui s'abonne à cette URL
// ne porte jamais de session Supabase, seulement le jeton dans le chemin.
// C'est calendar_feed_events() qui fait office de contrôle d'accès — cette
// route se contente donc du client anonyme habituel, jamais d'une clé de
// service.
type FeedRow = {
  id: string;
  title: string | null;
  event_type: string | null;
  is_home: boolean | null;
  location: string | null;
  salle: string | null;
  start_time: string;
  end_time: string | null;
  team_name: string;
};

// RFC 5545 : virgule, point-virgule et antislash doivent être échappés
// dans un champ texte, un saut de ligne devient un \n littéral.
function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\r?\n/g, "\\n");
}

function toIcsUtc(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function summaryFor(row: FeedRow) {
  const type = styleFor(row.event_type).label;
  if (isMatchType(row.event_type)) {
    const { opponent } = parseMatchTitle(row.title);
    const home = homeAwayLabel(row.is_home);
    return `${row.team_name} — ${type}${home ? ` (${home})` : ""} vs ${opponent}`;
  }
  return `${row.team_name} — ${row.title || type}`;
}

function buildIcs(rows: FeedRow[]) {
  const now = toIcsUtc(new Date().toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UBAC//Calendrier//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:UBAC",
    "X-WR-TIMEZONE:Europe/Paris",
  ];

  for (const row of rows) {
    // Un déplacement sans heure de fin garde une durée par défaut plutôt
    // que de s'afficher comme un événement ponctuel sans étendue.
    const endIso =
      row.end_time ?? new Date(new Date(row.start_time).getTime() + 90 * 60000).toISOString();
    const venue = venueQuery({ salle: row.salle, location: row.location });

    lines.push(
      "BEGIN:VEVENT",
      `UID:${row.id}@ubac17.app`,
      `DTSTAMP:${now}`,
      `DTSTART:${toIcsUtc(row.start_time)}`,
      `DTEND:${toIcsUtc(endIso)}`,
      `SUMMARY:${escapeIcsText(summaryFor(row))}`
    );
    if (venue) lines.push(`LOCATION:${escapeIcsText(venue)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase.rpc("calendar_feed_events", { p_token: token });
  if (error) {
    return new Response("Lien invalide.", { status: 404 });
  }

  const ics = buildIcs((data ?? []) as FeedRow[]);
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
