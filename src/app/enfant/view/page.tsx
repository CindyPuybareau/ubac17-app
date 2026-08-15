import { cookies } from "next/headers";
import Image from "next/image";
import { CalendarDays, MapPin } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/service";
import { CHILD_SESSION_COOKIE, verifyChildSession } from "@/lib/child-session";
import { formatFirstName } from "@/lib/names";
import { styleFor, isMatchType, homeAwayLabel, formatEventTime } from "@/app/dashboard/event-style";
import { parseMatchTitle } from "@/lib/match-display";
import ChildLogoutButton from "./child-logout-button";

// Vue strictement lecture seule : cette page ne rend AUCUN composant
// client capable d'écrire (pas de RSVP, pas d'édition) — la session enfant
// (cookie signé, pas une session Supabase) ne donne accès qu'à ceci.
// service_role est utilisé ici volontairement (l'enfant n'a pas
// d'auth.uid()), donc c'est cette page elle-même, pas une policy RLS, qui
// garantit qu'aucune écriture n'est jamais exposée : uniquement des select
// en dur, jamais un insert/update/delete.
export default async function ChildViewPage() {
  const cookieStore = await cookies();
  const playerId = verifyChildSession(cookieStore.get(CHILD_SESSION_COOKIE)?.value);

  if (!playerId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16 text-center">
        <p className="text-sm text-zinc-500">
          Ta session a expiré. Redemande le lien à un parent pour te reconnecter.
        </p>
      </div>
    );
  }

  const supabase = createServiceClient();

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("id, first_name")
    .eq("id", playerId)
    .maybeSingle();

  if (playerError) {
    console.error("enfant/view — erreur requête players:", playerError);
  }

  if (!player) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16 text-center">
        <p className="text-sm text-zinc-500">
          Profil introuvable. Redemande le lien à un parent et réessaie.
        </p>
        {/* Diagnostic temporaire — à retirer une fois la cause du bug
            identifiée avec Cindy. */}
        {playerError && (
          <p className="mt-3 max-w-xs text-xs text-red-400">
            (diagnostic : {playerError.message})
          </p>
        )}
      </div>
    );
  }

  const { data: teamLinks } = await supabase
    .from("team_players")
    .select("team_id")
    .eq("player_id", playerId);
  const teamIds = (teamLinks ?? []).map((t) => t.team_id);

  const { data: eventsData } =
    teamIds.length > 0
      ? await supabase
          .from("events")
          .select("id, title, event_type, is_home, location, salle, start_time, end_time, teams(name)")
          .in("team_id", teamIds)
          .gte("start_time", new Date().toISOString())
          .order("start_time", { ascending: true })
          .limit(15)
      : { data: [] as never[] };

  const events = (eventsData ?? []) as unknown as {
    id: string;
    title: string | null;
    event_type: string | null;
    is_home: boolean | null;
    location: string | null;
    salle: string | null;
    start_time: string;
    end_time: string | null;
    teams: { name: string | null } | null;
  }[];

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-8">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="UBAC" width={32} height={32} className="h-8 w-8 object-contain" />
            <div>
              <p className="text-xs text-zinc-500">Salut</p>
              <p className="font-bold text-zinc-900">{formatFirstName(player.first_name)} !</p>
            </div>
          </div>
          <ChildLogoutButton />
        </div>

        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          <CalendarDays className="h-3.5 w-3.5" />
          Tes prochains rendez-vous
        </p>

        {events.length === 0 && (
          <p className="rounded-2xl border border-zinc-100 bg-white p-4 text-sm text-zinc-500 shadow-sm">
            Rien de prévu pour le moment.
          </p>
        )}

        {events.map((e) => {
          const style = styleFor(e.event_type);
          const parsed = parseMatchTitle(e.title);
          const home = e.is_home ?? parsed.isHome;
          const lieu = e.salle || e.location;
          return (
            <div
              key={e.id}
              className={`rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm border-l-4 ${style.border}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}>
                  {style.label}
                </span>
                {e.teams?.name && <span className="text-xs font-semibold text-zinc-500">{e.teams.name}</span>}
              </div>
              <p className="mt-1 font-semibold text-zinc-900">
                {isMatchType(e.event_type)
                  ? [homeAwayLabel(home), parsed.opponent ? `vs ${parsed.opponent}` : null]
                      .filter(Boolean)
                      .join(" · ")
                  : e.title ?? style.label}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
                <span>
                  {new Date(e.start_time).toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                  , {formatEventTime(e.start_time, e.end_time)}
                </span>
                {lieu && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {lieu}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
