"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, Users, ShieldCheck, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { resizeImageForTeamPhoto } from "@/lib/image-resize";
import AnimatedNumber from "./animated-number";
import { DayEventCard, type WeekStripEvent } from "./week-strip-banner";
import type { SpaceDashboardSummary as SpaceDashboardSummaryData } from "@/lib/space-dashboard";

type MatchFilter = "official" | "friendly" | "all";

// Retour de Cindy du 13/09 ("photo d'équipe... nombre de joueurs... matchs
// officiels/amicaux joués, un truc dynamique et chouette... saison qui
// change automatiquement... points marqués... prochain événement") : voir
// space-dashboard.ts pour le calcul des données, ce composant ne fait que
// l'affichage + l'interaction (filtre officiel/amical, envoi de la photo).
// Un seul composant pour les 3 espaces (Bureau/Coach/Famille) -- summary
// reflète déjà le bon périmètre (club entier ou équipe(s) concernée(s)),
// jamais de sélecteur ici.
export default function SpaceDashboardSummary({
  summary,
  canManagePhoto,
}: {
  summary: SpaceDashboardSummaryData;
  // Bureau (toute équipe) ou coach de CETTE équipe précise (voir la policy
  // du bucket team-photos) -- calculé par l'appelant, jamais recalculé ici.
  canManagePhoto: boolean;
}) {
  const [filter, setFilter] = useState<MatchFilter>("official");
  const [photoUrl, setPhotoUrl] = useState(summary.photoUrl);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const stats =
    filter === "official"
      ? summary.official
      : filter === "friendly"
        ? summary.friendly
        : {
            played: summary.official.played + summary.friendly.played,
            points: summary.official.points + summary.friendly.points,
            won: summary.official.won + summary.friendly.won,
          };

  async function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !summary.singleTeamId) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Choisis une image.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const { blob, ext } = await resizeImageForTeamPhoto(file);
      const supabase = createClient();
      const path = `${summary.singleTeamId}/photo.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("team-photos")
        .upload(path, blob, { upsert: true, cacheControl: "3600", contentType: blob.type || file.type });
      if (uploadErr) {
        setUploadError("Envoi impossible, réessaie.");
        return;
      }
      const { data } = supabase.storage.from("team-photos").getPublicUrl(path);
      const bustedUrl = `${data.publicUrl}?t=${Date.now()}`;
      const { error: updateErr } = await supabase
        .from("teams")
        .update({ photo_url: bustedUrl })
        .eq("id", summary.singleTeamId);
      if (updateErr) {
        setUploadError("Enregistrement impossible, réessaie.");
        return;
      }
      setPhotoUrl(bustedUrl);
    } catch {
      setUploadError("Image illisible, réessaie avec une autre photo.");
    } finally {
      setUploading(false);
    }
  }

  // Retour de Cindy du 13/09 ("la carte prochain événement ne doit pas
  // être en lecture seule... vue carte complète, même design") : même
  // carte que le bandeau "Cette semaine" (DayEventCard, week-strip-
  // banner.tsx), jamais réécrite à part -- roles/tasks/carpool/showCarpool
  // toujours vides ici (le Tableau de bord ne gère pas maillots/goûter,
  // seulement les besoins d'organisation, comme la carte Coach existante),
  // ce qui masque naturellement MatchTasksPanel sans condition à ajouter.
  //
  // Retour de Cindy du 14/09 ("le bureau n'a pas qu'un seul entraînement de
  // prévu... si plusieurs événements dans la journée, pouvoir les
  // visualiser") : summary.nextEvents porte déjà TOUS les événements du
  // jour le plus proche (space-dashboard.ts) -- une carte par événement,
  // jamais une seule tronquée.
  const nextEventsForCards: WeekStripEvent[] = summary.nextEvents.map((e) => ({
    id: e.id,
    title: e.title,
    eventType: e.eventType,
    startTime: e.startTime,
    endTime: e.endTime,
    impactTime: e.impactTime,
    notes: e.notes,
    isPaid: e.isPaid,
    paymentLink: e.paymentLink,
    location: e.location,
    salle: e.salle,
    isHome: e.isHome,
    teamName: e.teamName,
    source: e.source,
    rsvpPlayers: e.rsvpPlayers,
    rsvpCounts: e.rsvpCounts,
    presentPlayers: e.presentPlayers,
    absentPlayers: e.absentPlayers,
    roles: [],
    tasks: {},
    carpool: [],
    showCarpool: false,
    needs: e.needs,
  }));

  // "Aujourd'hui" plutôt qu'une date qu'on doit lire et comparer soi-même
  // à la volée -- comparaison de dates en Europe/Paris (toLocaleDateString
  // avec ce fuseau explicite), jamais le fuseau du navigateur qui affiche
  // la page (déjà Paris pour tout le monde ici, mais évite toute ambiguïté).
  const firstNextEvent = nextEventsForCards[0];
  const nextDayLabel = firstNextEvent
    ? new Date(firstNextEvent.startTime).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) ===
      new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })
      ? "Aujourd'hui"
      : new Date(firstNextEvent.startTime).toLocaleDateString("fr-FR", {
          timeZone: "Europe/Paris",
          weekday: "long",
          day: "numeric",
          month: "long",
        })
    : "";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      {/* Retour de Cindy du 14/09 ("nos photos de groupe sont en format
          portrait... têtes coupées, le badge de saison cache une partie
          des visages") : le badge "Saison" sort complètement de la photo
          -- même habillage que le signet "MES ENFANTS" (family-view.tsx),
          au-dessus des pastilles de filtre plutôt que superposé. */}
      <span className="inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full bg-ubac-yellow/15 px-3 py-1 text-xs font-semibold uppercase leading-none text-ubac-yellow-dark">
        Saison {summary.seasonLabel}
      </span>

      {/* Retour de Cindy du 13/09 ("statistique matchs amicaux aussi...
          onglet déroulant pour pouvoir choisir") : 3 positions plutôt
          qu'un simple on/off, "Tous" cumule les deux -- même style de
          pastille que TeamFilterDropdown/"Aujourd'hui" déjà dans
          l'appli. */}
      <div className="flex w-fit rounded-full border border-zinc-200 bg-zinc-50 p-0.5 text-xs font-semibold">
        {(
          [
            { key: "official", label: "Officiels" },
            { key: "friendly", label: "Amicaux" },
            { key: "all", label: "Tous" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setFilter(opt.key)}
            className={`rounded-full px-3 py-1.5 transition-colors ${
              filter === opt.key ? "bg-navy text-white" : "text-zinc-500 hover:text-navy"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Retour de Cindy du 14/09 ("je me suis trompée, pardon, paysage !") :
          empilé sur mobile (photo pleine largeur en haut, ratio paysage
          raisonnable, grille KPI 2x2 dessous) -- côte à côte à partir de
          sm: (photo ~58% de la largeur, pour respecter son ratio naturel
          plutôt que l'écraser, grille sur le reste). aspect-[4/3] --
          "raisonnable" plutôt qu'un bandeau très large et écrasé (16/9
          sur toute la largeur du composant, essayé puis retiré) : moins
          de recadrage sur une photo de groupe déjà large. */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-2xl border border-zinc-100 bg-navy shadow-sm sm:w-[58%]">
          {summary.singleTeamId && photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-navy via-navy to-navy-dark">
              <Image src="/logo.png" alt="UBAC" width={64} height={64} className="object-contain opacity-90" />
            </div>
          )}
          {/* Logo mascotte en petit coin bas-droit UNIQUEMENT par-dessus une
              vraie photo (retour de Cindy du 14/09, "petit, semi-
              transparent... sans jamais recouvrir de visages") -- jamais
              au centre d'une photo de groupe, contrairement au repli
              ci-dessus (aucune photo, rien à recouvrir). */}
          {summary.singleTeamId && photoUrl && (
            <Image
              src="/logo.png"
              alt=""
              aria-hidden
              width={28}
              height={28}
              className="absolute bottom-2 right-2 h-7 w-7 object-contain opacity-60"
            />
          )}
          {canManagePhoto && summary.singleTeamId && (
            <>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                title="Changer la photo de l'équipe"
                className="absolute bottom-2 left-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-navy/70 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-navy-dark disabled:opacity-60"
              >
                <Camera className="h-4 w-4" />
              </button>
              <input ref={inputRef} type="file" accept="image/*" onChange={onPhotoChange} className="hidden" />
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:flex-1 sm:grid-cols-2">
          <KpiTile icon={Users} iconClass="text-navy" iconBgClass="bg-navy/10" value={summary.playerCount} label="Joueurs" />
          <KpiTile
            icon={Trophy}
            iconClass="text-ubac-yellow-dark"
            iconBgClass="bg-ubac-yellow/15"
            value={stats.played}
            label="Matchs joués"
          />
          {/* Retour de Cindy du 14/09 ("Victoires") : remplace "Équipes"
              (jamais pertinent hors Bureau -- teamCount y valait toujours
              null) -- celle-ci s'applique partout (club entier ou une
              seule équipe), et complète mieux "Matchs joués"/"Points
              marqués" dans une grille 2x2 qui n'a plus de case creuse. */}
          <KpiTile icon={ShieldCheck} iconClass="text-court-green" iconBgClass="bg-court-green/10" value={stats.won} label="Victoires" />
          <KpiTile
            icon={Trophy}
            iconClass="text-coral"
            iconBgClass="bg-coral/10"
            value={stats.points}
            label="Points marqués"
          />
        </div>
      </div>
      {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}

      {nextEventsForCards.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {nextDayLabel}
            {nextEventsForCards.length > 1 ? ` · ${nextEventsForCards.length} événements` : ""}
          </p>
          <div className="flex flex-col gap-2">
            {nextEventsForCards.map((event) => (
              <DayEventCard key={event.id} event={event} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiTile({
  icon: Icon,
  iconClass,
  iconBgClass,
  value,
  label,
}: {
  icon: typeof Users;
  iconClass: string;
  iconBgClass: string;
  value: number;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-zinc-100 bg-white px-2 py-2.5 text-center shadow-sm">
      <span className={`flex h-7 w-7 items-center justify-center rounded-full sm:h-8 sm:w-8 ${iconBgClass}`}>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${iconClass}`} />
      </span>
      <p className="text-base font-bold text-zinc-900 sm:text-lg">
        <AnimatedNumber value={value} kind="integer" />
      </p>
      <p className="text-[10px] font-medium leading-tight text-zinc-500 sm:text-[11px]">{label}</p>
    </div>
  );
}
