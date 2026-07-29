import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseIcs } from "@/lib/ics";

export async function POST(request: Request) {
  const { teamId } = await request.json();

  if (!teamId) {
    return NextResponse.json({ error: "teamId requis." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("id, calendar_url")
    .eq("id", teamId)
    .single();

  if (teamError || !team?.calendar_url) {
    return NextResponse.json(
      { error: "Aucun lien de calendrier configuré pour cette équipe." },
      { status: 400 }
    );
  }

  let icsText: string;
  try {
    const res = await fetch(team.calendar_url);
    if (!res.ok) {
      return NextResponse.json(
        { error: `Impossible de récupérer le calendrier (statut ${res.status}).` },
        { status: 502 }
      );
    }
    icsText = await res.text();
  } catch {
    return NextResponse.json(
      { error: "Impossible de joindre l'URL du calendrier." },
      { status: 502 }
    );
  }

  const parsedEvents = parseIcs(icsText);

  if (parsedEvents.length === 0) {
    return NextResponse.json({
      imported: 0,
      updated: 0,
      message: "Aucun événement trouvé dans ce flux.",
    });
  }

  let inserted = 0;
  let updated = 0;

  for (const event of parsedEvents) {
    const { data: existing } = await supabase
      .from("events")
      .select("id")
      .eq("team_id", teamId)
      .eq("external_uid", event.uid)
      .maybeSingle();

    const payload = {
      title: event.summary ?? "Match",
      event_type: "MATCH" as const,
      location: event.location,
      start_time: event.start,
      end_time: event.end,
    };

    if (existing) {
      const { error } = await supabase
        .from("events")
        .update(payload)
        .eq("id", existing.id);
      if (!error) updated += 1;
    } else {
      const { error } = await supabase.from("events").insert({
        ...payload,
        team_id: teamId,
        external_uid: event.uid,
      });
      if (!error) inserted += 1;
    }
  }

  return NextResponse.json({ imported: inserted, updated });
}
