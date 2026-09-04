import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkedQuery, type Semaphore } from "@/lib/batch";
import { formatPersonName } from "@/lib/names";
import type { RoleIconName } from "./role-icon";

// "Besoins d'organisation" d'un événement (buvette, table de marque,
// arbitrage...) — voir 20261012000000_club_event_targeting_and_volunteer_needs
// et 20261016000000_simplify_volunteer_needs_no_catalog. Liste FIXE plutôt
// qu'un catalogue éditable en base (retour de Cindy du 2026-08-19,
// inspiration SportEasy : "trop lourd, des doublons d'infos") — un rôle
// hors liste se choisit via "Autre" (customLabel en texte libre). Système
// volontairement séparé de event-tasks.ts (JERSEYS/SNACKS, maillots/goûter
// géré par le coach côté match) : un besoin ici peut demander PLUSIEURS
// bénévoles, event_tasks est verrouillé à un seul par (event_id, task_type).
export type StandardVolunteerRole = {
  code: string;
  label: string;
  icon: RoleIconName;
};

export const STANDARD_VOLUNTEER_ROLES: StandardVolunteerRole[] = [
  { code: "BUVETTE", label: "Buvette", icon: "Coffee" },
  { code: "TABLE_MARQUE", label: "Table de marque", icon: "Timer" },
  { code: "ARBITRAGE", label: "Arbitrage", icon: "Flag" },
  { code: "INSTALLATION", label: "Installation / Rangement", icon: "KeyRound" },
  { code: "LAVAGE_MAILLOTS", label: "Lavage maillots", icon: "Shirt" },
];

// Un besoin hors liste standard : le code reste stable ("AUTRE"), le
// libellé réel vit dans VolunteerNeed.customLabel.
export const CUSTOM_ROLE_CODE = "AUTRE";

export function volunteerRoleLabel(roleCode: string, customLabel: string | null): string {
  if (roleCode === CUSTOM_ROLE_CODE) return customLabel || "Autre";
  return STANDARD_VOLUNTEER_ROLES.find((r) => r.code === roleCode)?.label ?? roleCode;
}

export function volunteerRoleIcon(roleCode: string): RoleIconName {
  return STANDARD_VOLUNTEER_ROLES.find((r) => r.code === roleCode)?.icon ?? "Users";
}

export type VolunteerSignupSource = "VOLUNTEER" | "ADMIN";

// playerId/benevoleId : exactement l'un des deux est renseigné, jamais les
// deux (retour de Cindy du 2026-08-25, "besoin en bénévoles hors club") —
// voir la contrainte event_volunteer_signups_signer_check en base.
export type VolunteerSignup = {
  id: string;
  playerId: string | null;
  benevoleId: string | null;
  // Nom affiché, joueur ou bénévole selon lequel des deux ids ci-dessus
  // est renseigné — gardé "playerName" (pas renommé) pour ne pas casser
  // tous les usages existants (volunteer-needs-panel.tsx...), c'était déjà
  // le seul nom affiché dans ce composant avant l'ajout des bénévoles.
  playerName: string;
  source: VolunteerSignupSource;
};

export type VolunteerNeed = {
  id: string;
  eventId: string;
  roleCode: string;
  // Libellé libre quand roleCode === CUSTOM_ROLE_CODE, null sinon.
  customLabel: string | null;
  requiredCount: number;
  signups: VolunteerSignup[];
};

export async function getVolunteerNeedsByEventId(
  supabase: SupabaseClient,
  eventIds: string[],
  dbLimit?: Semaphore
): Promise<Record<string, VolunteerNeed[]>> {
  const result: Record<string, VolunteerNeed[]> = {};
  if (eventIds.length === 0) return result;

  // Un .in("event_id", eventIds) direct posait problème dès que ce fetch
  // couvrait TOUS les événements affichés (calendrier entier, plusieurs
  // centaines d'entrées) : URL trop longue, "Bad Request" (bug remonté
  // par Cindy le 2026-08-20). Le contournement (fetch de toute la table,
  // filtré en mémoire) posé alors ne tient plus à cette échelle : retour
  // de Cindy du 02/09, Postgres a fini par annuler ce genre de scan
  // complet lui-même ailleurs dans l'appli ("statement timeout", vraie
  // "Internal Server Error") — puis un deuxième incident le même jour
  // causé par les tranches elles-mêmes, parties toutes en même temps, puis
  // un TROISIÈME (retour du 03/09) causé par des plafonds locaux qui
  // s'additionnaient entre blocs. dbLimit, quand fourni par l'appelant
  // (page.tsx), est le plafond unique partagé par toute la page.
  // Chaque tranche porte son propre tri par sort_order, donc l'ordre des
  // besoins d'un même événement (toujours dans la même tranche, puisqu'on
  // découpe sur les ids d'événement) reste correct une fois les tranches
  // mises bout à bout.
  const { data: needRows, errors } = await chunkedQuery(
    eventIds,
    150,
    (chunk) =>
      supabase
        .from("event_volunteer_needs")
        .select("id, event_id, role_code, custom_label, required_count, sort_order")
        .in("event_id", chunk)
        .order("sort_order", { ascending: true }),
    dbLimit ?? 4
  );
  errors.forEach((error) =>
    console.error(
      "[getVolunteerNeedsByEventId] select event_volunteer_needs failed (tranche):",
      error
    )
  );

  const needIds = needRows.map((row) => row.id as string);

  // Requête séparée plutôt qu'une jointure imbriquée à deux niveaux (mêmes
  // raisons que getCarpoolOffersByEventId dans event-tasks.ts : plus simple
  // à relire).
  const signupsByNeedId = new Map<string, VolunteerSignup[]>();
  if (needIds.length > 0) {
    const { data: signupRows } = await supabase
      .from("event_volunteer_signups")
      .select("id, need_id, player_id, benevole_id, source")
      .in("need_id", needIds);

    // Noms résolus via club_member_names plutôt qu'une jointure
    // players(...) directe : la fiche complète d'un autre membre n'est
    // pas accessible (vie privée), la jointure revenait vide et
    // affichait "Bénévole" à la place du vrai nom (retour de Cindy du
    // 2026-08-20). D'abord scopée "coéquipier", élargie à tout le club le
    // 2026-08-21 (retour de Cindy : "Bénévole" persistait pour un
    // bénévole hors de l'équipe de qui consulte — capture d'écran espace
    // Parent).
    const signupPlayerIds = [
      ...new Set(
        (signupRows ?? [])
          .map((row) => row.player_id as string | null)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const nameByPlayerId = new Map<string, string>();
    if (signupPlayerIds.length > 0) {
      const { data: nameRows } = await supabase
        .from("club_member_names")
        .select("id, first_name, last_name")
        .in("id", signupPlayerIds);
      (nameRows ?? []).forEach((row) => {
        nameByPlayerId.set(row.id as string, formatPersonName(row.first_name, row.last_name));
      });
    }

    // Même principe côté bénévoles (retour d'audit du 28/08, même bug déjà
    // corrigé côté joueurs le 21/08 via club_member_names) : la table
    // benevoles elle-même n'est lisible que par le Bureau (RLS) — pour un
    // Coach ou une Famille, une lecture directe renvoie 0 ligne (refus
    // silencieux) et le nom retombait sur "Bénévole". club_benevole_names
    // est une vue club-wide, prénom/nom seulement, lisible par tous les
    // comptes connectés.
    const signupBenevoleIds = [
      ...new Set(
        (signupRows ?? [])
          .map((row) => row.benevole_id as string | null)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const nameByBenevoleId = new Map<string, string>();
    if (signupBenevoleIds.length > 0) {
      const { data: benevoleRows } = await supabase
        .from("club_benevole_names")
        .select("id, first_name, last_name")
        .in("id", signupBenevoleIds);
      (benevoleRows ?? []).forEach((row) => {
        nameByBenevoleId.set(row.id as string, formatPersonName(row.first_name, row.last_name));
      });
    }

    (signupRows ?? []).forEach((row) => {
      const needId = row.need_id as string;
      const list = signupsByNeedId.get(needId) ?? [];
      const playerId = row.player_id as string | null;
      const benevoleId = row.benevole_id as string | null;
      list.push({
        id: row.id as string,
        playerId,
        benevoleId,
        playerName:
          (playerId ? nameByPlayerId.get(playerId) : null) ??
          (benevoleId ? nameByBenevoleId.get(benevoleId) : null) ??
          "Bénévole",
        source: (row.source as VolunteerSignupSource | null) ?? "VOLUNTEER",
      });
      signupsByNeedId.set(needId, list);
    });
  }

  needRows.forEach((row) => {
    const eventId = row.event_id as string;
    const list = (result[eventId] ??= []);
    list.push({
      id: row.id as string,
      eventId,
      roleCode: row.role_code as string,
      customLabel: (row.custom_label as string | null) ?? null,
      requiredCount: (row.required_count as number | null) ?? 1,
      signups: signupsByNeedId.get(row.id as string) ?? [],
    });
  });

  return result;
}
