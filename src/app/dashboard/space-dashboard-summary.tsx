"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, Dumbbell, Percent, Users, ShieldCheck, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import { uploadTeamPhoto } from "@/lib/team-photo-upload";
import AnimatedNumber from "./animated-number";
import { DayEventCard, type WeekStripEvent } from "./week-strip-banner";
import TeamSelectorPills from "./team-selector-pills";
import { looseFamilyKey, splitTeamName } from "@/lib/teams";
import FfbbRankingTable from "./ffbb-ranking-table";
import WeekTrainingMatchCards from "./week-training-match-cards";
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
  photoRestrictedTeamIds = [],
  showPhoto = true,
  weekEvents,
}: {
  summary: SpaceDashboardSummaryData;
  // Bureau (toute équipe) ou coach de CETTE équipe précise (voir la policy
  // du bucket team-photos) -- calculé par l'appelant, jamais recalculé ici.
  canManagePhoto: boolean;
  // Retour de Cindy du 30/09 ("équipes sœurs") : summary.byTeam peut
  // désormais inclure une déclinaison sœur (consultation seule) en plus
  // des équipes réellement coachées -- ses ids ici pour ne jamais proposer
  // le bouton d'envoi de photo dessus, même quand canManagePhoto est vrai
  // pour le reste.
  photoRestrictedTeamIds?: string[];
  // Retour de Cindy du 12/11 ("le Bureau n'a pas besoin des photos d'équipe
  // dans son tableau de bord") : false côté Bureau -- ni photo, ni pastille
  // "Joueurs" (doublon de "Membres actifs" juste au-dessus). L'envoi des
  // photos par le Bureau vit désormais dans Vie du club → Photos d'équipe
  // (team-photos-manager.tsx) ; les coachs gardent leur bouton ici.
  showPhoto?: boolean;
  // Retour de Cindy du 09/11 ("tout est mélangé pour Basile... le tri
  // devrait se faire pour chaque équipe") : les cartes "Entraînement(s)/
  // Match(s) de la semaine" vivent maintenant ICI (plus en bloc séparé chez
  // l'appelant) précisément pour partager `effectiveTeamId` avec le
  // classement/les KPI juste au-dessus -- un premier essai en bloc sibling,
  // nourri par la liste globale (coach + famille fusionnés, jamais filtrée
  // par équipe), mélangeait les entraînements/matchs de TOUTES les équipes
  // de la personne quel que soit le pastille sélectionnée. `weekEvents`
  // peut donc rester la même liste large (même coach+famille fusionnés) :
  // le filtre par `effectiveTeamId` ci-dessous exclut déjà tout ce qui
  // n'appartient pas à l'équipe active, peu importe sa provenance. Non
  // fourni (Bureau, club entier, jamais ces cartes) : repli sur l'ancien
  // bloc "prochain événement" ci-dessous, inchangé.
  weekEvents?: WeekStripEvent[];
}) {
  const [filter, setFilter] = useState<MatchFilter>("official");
  // Retour de Cindy du 20/09 ("mes deux enfants sont mélangés... un coach
  // qui coache plusieurs équipes, il lui faut des données séparées pour
  // chaque équipe") : summary.byTeam (space-dashboard.ts) porte une entrée
  // par équipe dès qu'il y en a plusieurs -- jamais de vue "Toutes"
  // fusionnée (retour explicite de Cindy), une seule équipe affichée à la
  // fois via ce sélecteur, la première par défaut. byTeam reste vide pour
  // le Bureau (club entier) et pour une seule équipe : dans ces deux cas,
  // hasMultipleTeams est faux et tout se comporte exactement comme avant.
  const hasMultipleTeams = summary.byTeam.length > 1;
  // Retour de Cindy du 30/09 ("Séniors M avant Séniors 1") : byTeam exclut
  // désormais une équipe mère sans match (listTeamsForOfficialMatches,
  // space-dashboard.ts) -- une personne avec initialement DEUX équipes
  // (mère + 1 déclinaison) peut donc se retrouver avec un seul élément
  // dans byTeam après filtrage, alors que summary.singleTeamId (calculé
  // AVANT ce filtrage, sur le nombre d'équipes d'ORIGINE) resterait null,
  // et summary.playerCount/official/friendly (agrégats bruts sur TOUTES
  // les équipes d'origine, mère incluse) resteraient donc le seul repli
  // -- des chiffres qui compteraient à tort l'équipe mère exclue. D'où
  // `byTeam.length > 0`, pas `hasMultipleTeams`, pour la SOURCE des
  // données : dès qu'il reste ne serait-ce qu'une équipe après filtrage,
  // ses propres chiffres priment sur l'agrégat brut. hasMultipleTeams
  // reste `> 1` : décide seulement si le sélecteur de pastilles a un sens
  // à afficher, question différente de "quelles données utiliser".
  const [selectedTeamId, setSelectedTeamId] = useState(summary.byTeam[0]?.teamId);
  const activeTeam =
    summary.byTeam.length > 0
      ? (summary.byTeam.find((t) => t.teamId === selectedTeamId) ?? summary.byTeam[0])
      : null;
  const effectiveTeamId = activeTeam ? activeTeam.teamId : summary.singleTeamId;
  const effectivePlayerCount = activeTeam ? activeTeam.playerCount : summary.playerCount;
  const effectiveOfficialStats = activeTeam ? activeTeam.official : summary.official;
  const effectiveFriendlyStats = activeTeam ? activeTeam.friendly : summary.friendly;
  // Retour de Cindy du 01/10 ("le classement apparaisse dans le tableau de
  // bord aussi") : jamais pour le Bureau (activeTeam toujours null, club
  // entier) -- une équipe mère sans lien FFBB (U13M, U18M...) a aussi un
  // tableau vide, FfbbRankingTable ne rend alors rien (voir son garde-fou).
  const effectiveRanking = activeTeam ? activeTeam.ranking : [];
  const effectiveRankingPhase = activeTeam?.rankingPhase;
  // Retour de Cindy du 09/11 ("les entraînements des Séniors M sont
  // regroupés... U18M pareil, il faudrait qu'on les voie"), puis du 10/11
  // ("les u13m-1 font leur entraînement dans l'équipe mère U13M et on ne
  // le voit pas") : repli d'abord fait CONDITIONNEL (seulement si la
  // déclinaison active n'avait elle-même AUCUN entraînement cette
  // semaine-là), sur la base d'une vérification en base qui ne tenait que
  // pour Séniors 1/2 et U18M-1/2 (aucune séance propre, tout au nom de la
  // mère). Revérifié le 10/11 : TOUS les joueurs de U13M-1/U13M-2 (comme
  // Séniors 1/2 et U18M-1/2) sont EUX AUSSI inscrits dans l'équipe mère
  // (team_players) -- U13M-1 a donc bien sa propre séance ET s'entraîne
  // aussi avec la mère U13M, les deux coexistent la même semaine. Le repli
  // devient donc inconditionnel (toujours cumuler les entraînements de la
  // mère à ceux, propres ou non, de la déclinaison), plus seulement un
  // filet de sécurité pour "zéro séance propre". Résolution par NOM
  // (looseFamilyKey, lib/teams.ts -- même règle que getSiblingTeamIds/
  // getTrombinoscopeTeamId), jamais un nom d'équipe codé en dur : une
  // future équipe mère/déclinaisons suivant le même principe en bénéficie
  // automatiquement.
  const effectiveWeekEvents = (() => {
    if (!weekEvents || !effectiveTeamId) return [];
    const ownEvents = weekEvents.filter((e) => e.teamId === effectiveTeamId);
    if (!activeTeam?.teamName) return ownEvents;
    const base = looseFamilyKey(activeTeam.teamName);
    const motherTeamId = weekEvents.find(
      (e) =>
        e.teamId &&
        e.teamId !== effectiveTeamId &&
        e.teamName &&
        splitTeamName(e.teamName).rank === 0 &&
        looseFamilyKey(e.teamName) === base
    )?.teamId;
    if (!motherTeamId) return ownEvents;
    const motherTrainings = weekEvents.filter(
      (e) => e.teamId === motherTeamId && e.eventType === "TRAINING"
    );
    return [...ownEvents, ...motherTrainings];
  })();
  const effectiveBasePhotoUrl = activeTeam ? activeTeam.photoUrl : summary.photoUrl;
  // Photo envoyée pendant cette visite, par équipe -- remplace l'ancien
  // état unique (photoUrl) devenu insuffisant dès qu'on peut changer
  // d'équipe affichée sans recharger la page : sans cette clé par équipe,
  // la photo tout juste envoyée pour l'équipe A "collait" aussi à l'équipe
  // B après un changement de pastille.
  const [uploadedPhotoByTeam, setUploadedPhotoByTeam] = useState<Record<string, string>>({});
  const photoTargetTeamId = effectiveTeamId;
  const photoTargetBaseUrl = effectiveBasePhotoUrl;
  const photoUrl = photoTargetTeamId ? (uploadedPhotoByTeam[photoTargetTeamId] ?? photoTargetBaseUrl) : null;
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const stats =
    filter === "official"
      ? effectiveOfficialStats
      : filter === "friendly"
        ? effectiveFriendlyStats
        : {
            played: effectiveOfficialStats.played + effectiveFriendlyStats.played,
            points: effectiveOfficialStats.points + effectiveFriendlyStats.points,
            won: effectiveOfficialStats.won + effectiveFriendlyStats.won,
          };

  async function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !photoTargetTeamId) return;
    setUploading(true);
    setUploadError(null);
    const result = await uploadTeamPhoto(photoTargetTeamId, file);
    setUploading(false);
    if ("error" in result) {
      setUploadError(result.error);
      return;
    }
    setUploadedPhotoByTeam((prev) => ({ ...prev, [photoTargetTeamId]: result.url }));
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
  // Retour de Cindy du 20/09 ("je n'ai pas les prochains événements des
  // U13M ni des U13M-1") : chaque entrée de summary.byTeam porte déjà SES
  // PROPRES prochains événements (son propre jour le plus proche à elle,
  // voir space-dashboard.ts) -- jamais un filtre après coup sur la liste
  // partagée summary.nextEvents, qui ne couvre que le jour de l'équipe
  // globalement la plus proche et aurait laissé les autres équipes vides
  // dès que leur prochain événement tombait un autre jour.
  const nextEventsSource = activeTeam ? activeTeam.nextEvents : summary.nextEvents;
  const nextEventsForCards: WeekStripEvent[] = nextEventsSource.map((e) => ({
    id: e.id,
    title: e.title,
    eventType: e.eventType,
    startTime: e.startTime,
    endTime: e.endTime,
    impactTime: e.impactTime,
    notes: e.notes,
    cancelledAt: e.cancelledAt,
    cancelledReason: e.cancelledReason,
    isPaid: e.isPaid,
    paymentLink: e.paymentLink,
    location: e.location,
    salle: e.salle,
    awayVenueAddress: e.awayVenueAddress,
    isHome: e.isHome,
    teamName: e.teamName,
    teamId: e.teamId,
    source: e.source,
    rsvpPlayers: e.rsvpPlayers,
    rsvpCounts: e.rsvpCounts,
    presentPlayers: e.presentPlayers,
    absentPlayers: e.absentPlayers,
    pendingPlayers: e.pendingPlayers,
    roles: [],
    tasks: {},
    carpool: [],
    showCarpool: false,
    needs: e.needs,
    openToClubHelpers: e.openToClubHelpers,
    matchOfficials: e.matchOfficials,
    matchOfficialsEnabled: e.matchOfficialsEnabled,
    readOnlyExternal: e.readOnlyExternal,
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

  // Retour de Cindy du 12/11 ("désolidariser les entraînements et matchs
  // de la semaine de Saison 2026-2027") : deux cadres distincts -- la
  // saison (statistiques, classement, présence) d'un côté, la semaine
  // (entraînements/matchs, ou le prochain jour côté Bureau) de l'autre. Le
  // sélecteur d'équipe, en tête du premier cadre, pilote toujours les deux.
  const hasWeekContent = weekEvents ? effectiveWeekEvents.length > 0 : nextEventsForCards.length > 0;

  return (
    <>
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      {/* Retour de Cindy du 14/09 ("nos photos de groupe sont en format
          portrait... têtes coupées, le badge de saison cache une partie
          des visages") : le badge "Saison" sort complètement de la photo
          -- même habillage que le signet "MES ENFANTS" (family-view.tsx),
          au-dessus des pastilles de filtre plutôt que superposé. */}
      <span className="inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full bg-ubac-yellow/15 px-3 py-1 text-xs font-semibold uppercase leading-none text-ubac-yellow-dark">
        Saison {summary.seasonLabel}
      </span>

      {/* Retour de Cindy du 20/09 ("mes deux enfants sont mélangés...
          données séparées pour chaque équipe") : même sélecteur par
          pastilles que "Mes Équipes"/"Résultats" (team-selector-pills.tsx)
          -- se cache déjà tout seul s'il n'y a qu'une équipe/qu'un enfant
          (voir son garde-fou interne, teams.length <= 1). Jamais de
          pastille "Toutes" fusionnée (retour explicite de Cindy) : une
          seule équipe affichée à la fois, la première par défaut. */}
      {hasMultipleTeams && (
        <TeamSelectorPills
          teams={summary.byTeam.map((t) => ({ id: t.teamId, name: t.teamName, category: t.category }))}
          activeId={activeTeam?.teamId}
          onSelect={setSelectedTeamId}
        />
      )}

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
          empilé sur mobile uniquement (photo pleine largeur en haut, ratio
          paysage raisonnable, grille KPI 2x2 dessous). aspect-[4/3] --
          "raisonnable" plutôt qu'un bandeau très large et écrasé (16/9
          sur toute la largeur du composant, essayé puis retiré) : moins
          de recadrage sur une photo de groupe déjà large.
          Retour de Cindy du 09/11 ("sur PC elle s'affiche en beaucoup trop
          grosse", puis "trop gros aussi sur tablette", puis "deux KPI à
          droite de l'image plutôt, et deux autres qui passent en bas si
          pas de place") : photo à largeur FIXE (sm:w-56) dès sm: (640px),
          jamais une proportion de la largeur disponible qui la faisait
          grandir sans limite sur grand écran. Les KPI, eux, passent d'une
          grille à colonnes fixes (2 ou 4) à une grille "auto-fit" --
          chaque pastille réclame au moins 110px, autant de colonnes que
          l'espace restant (une fois la photo retirée) peut en accueillir,
          le reste passe à la ligne tout seul. Plus besoin de choisir un
          palier fixe "4 par ligne à partir de telle largeur" : sur
          tablette (peu de place à côté de la photo), 2 pastilles tiennent
          par ligne ; sur grand écran, les 4 tiennent sur une seule ligne,
          sans rien coder de plus pour ce cas précis. */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {showPhoto && (
        <div className="relative mx-auto aspect-[4/3] w-full max-w-sm shrink-0 overflow-hidden rounded-2xl border border-zinc-100 bg-navy shadow-sm sm:mx-0 sm:w-56 sm:max-w-none">
          {photoTargetTeamId && photoUrl ? (
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
          {photoTargetTeamId && photoUrl && (
            <Image
              src="/logo.png"
              alt=""
              aria-hidden
              width={28}
              height={28}
              className="absolute bottom-2 right-2 h-7 w-7 object-contain opacity-60"
            />
          )}
          {/* Retour de Cindy du 30/10 ("logo photo symbole en haut à
              droite") : déplacé de bottom-2 left-2 vers top-2 right-2,
              pour les 3 espaces (Bureau/Coach/Famille). */}
          {canManagePhoto && photoTargetTeamId && !photoRestrictedTeamIds.includes(photoTargetTeamId) && (
            <>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                title="Changer la photo de l'équipe"
                className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-navy/70 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-navy-dark disabled:opacity-60"
              >
                <Camera className="h-4 w-4" />
              </button>
              <input ref={inputRef} type="file" accept="image/*" onChange={onPhotoChange} className="hidden" />
            </>
          )}
        </div>
        )}

        <div className="grid grid-cols-2 gap-2.5 sm:flex-1 sm:grid-cols-[repeat(auto-fit,minmax(110px,1fr))]">
          {/* Retour de Cindy du 12/11 ("à la place du nombre de joueurs, une
              stat, par exemple 50 % de matchs gagnés") : côté Bureau (sans
              photo), le taux de victoire remplace "Joueurs", qui doublait
              "Membres actifs" juste au-dessus. Suit le filtre Officiels/
              Amicaux/Tous comme les trois autres pastilles. */}
          {showPhoto ? (
            <KpiTile icon={Users} iconClass="text-navy" iconBgClass="bg-navy/10" value={effectivePlayerCount} label="Joueurs" />
          ) : (
            <KpiTile
              icon={Percent}
              iconClass="text-navy"
              iconBgClass="bg-navy/10"
              value={stats.played > 0 ? (stats.won / stats.played) * 100 : 0}
              kind="percent"
              label="Matchs gagnés"
            />
          )}
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

      {/* Retour de Cindy du 12/11 ("taux de présence aux entraînements...
          repère les équipes qui décrochent") : Bureau seulement (fourni
          uniquement pour le club entier, voir lib/space-dashboard.ts).
          Bloc à part plutôt qu'une 5e pastille : le filtre Officiels/
          Amicaux/Tous ci-dessus ne s'applique pas aux entraînements. */}
      {!showPhoto && summary.trainingAttendance && (
        // Retour de Cindy du 12/11 ("bof en responsive texte") : le chiffre
        // et son libellé d'un côté, les deux équipes en pastilles de
        // l'autre (sous le chiffre sur téléphone) -- plus de phrases qui se
        // coupent. Deux cases côte à côte : étiquette en petit au-dessus,
        // équipe + taux dessous (le taux ne se sépare jamais du "·").
        <div className="flex flex-col gap-3 rounded-2xl border border-zinc-100 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-court-green/10">
              <Dumbbell className="h-4 w-4 text-court-green" />
            </span>
            <div>
              {/* Retour de Cindy du 12/11 ("pas beau sur petit écran") :
                  libellé court au-dessus, "de présence" à côté du chiffre --
                  plus de phrase qui se coupe sur trois lignes. */}
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-700">Entraînements du mois</p>
              <p className="text-xl font-bold leading-tight text-zinc-900">
                <AnimatedNumber value={summary.trainingAttendance.rate} kind="percent" />
                <span className="ml-1 text-sm font-medium text-zinc-500">de présence</span>
              </p>
            </div>
          </div>
          {/* Nom d'équipe toujours sur une seule ligne (retour de Cindy du
              12/11) : les deux cases passent l'une sous l'autre sur un très
              petit écran plutôt que de couper "Loisirs Mixtes". */}
          {(summary.trainingAttendance.highest || summary.trainingAttendance.lowest) && (
            <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 sm:min-w-[18rem]">
              {summary.trainingAttendance.highest && (
                <div className="rounded-lg bg-status-success/10 px-2.5 py-1.5">
                  <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-status-success">
                    <TrendingUp className="h-3 w-3 shrink-0" />
                    Plus présente
                  </p>
                  <p className="whitespace-nowrap text-[11px] font-semibold text-zinc-900">
                    {summary.trainingAttendance.highest.teamName}{" "}
                    <span className="whitespace-nowrap">· {Math.round(summary.trainingAttendance.highest.rate)} %</span>
                  </p>
                </div>
              )}
              {summary.trainingAttendance.lowest && (
                <div className="rounded-lg bg-status-urgent/10 px-2.5 py-1.5">
                  <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-status-urgent-dark">
                    <TrendingDown className="h-3 w-3 shrink-0" />
                    Moins présente
                  </p>
                  <p className="whitespace-nowrap text-[11px] font-semibold text-zinc-900">
                    {summary.trainingAttendance.lowest.teamName}{" "}
                    <span className="whitespace-nowrap">· {Math.round(summary.trainingAttendance.lowest.rate)} %</span>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Retour de Cindy du 01/10 ("le classement apparaisse dans le
          tableau de bord aussi") : même composant que Matchs & Résultats
          (ffbb-ranking-table.tsx), lu depuis summary.byTeam -- déjà
          synchronisé chaque lundi, aucun appel FFBB ici. Ne rend rien pour
          le Bureau (effectiveRanking toujours []) ni pour une équipe mère
          sans lien FFBB. */}
      <FfbbRankingTable entries={effectiveRanking} phase={effectiveRankingPhase} />

    </div>

    {/* Coach/Famille/Enfant : WeekTrainingMatchCards pose lui-même un
        cadre par section (entraînements / matchs, 12/11). Bureau : un cadre
        pour le prochain jour d'événements. */}
    {hasWeekContent && weekEvents && <WeekTrainingMatchCards events={effectiveWeekEvents} />}
    {hasWeekContent && !weekEvents && (
      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      {(
        nextEventsForCards.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-900">
              {nextDayLabel}
              {nextEventsForCards.length > 1 ? ` · ${nextEventsForCards.length} événements` : ""}
            </p>
            <div className="flex flex-col gap-2">
              {nextEventsForCards.map((event) => (
                <DayEventCard key={event.id} event={event} />
              ))}
            </div>
          </div>
        )
      )}
      </div>
    )}
    </>
  );
}

function KpiTile({
  icon: Icon,
  iconClass,
  iconBgClass,
  value,
  kind = "integer",
  label,
}: {
  icon: typeof Users;
  iconClass: string;
  iconBgClass: string;
  value: number;
  kind?: "integer" | "percent";
  label: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-zinc-100 bg-white px-2 py-2.5 text-center shadow-sm">
      <span className={`flex h-7 w-7 items-center justify-center rounded-full sm:h-8 sm:w-8 ${iconBgClass}`}>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${iconClass}`} />
      </span>
      <p className="text-base font-bold text-zinc-900 sm:text-lg">
        <AnimatedNumber value={value} kind={kind} />
      </p>
      <p className="text-[10px] font-medium leading-tight text-zinc-500 sm:text-[11px]">{label}</p>
    </div>
  );
}
