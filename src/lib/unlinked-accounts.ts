// Écran Bureau "Comptes à rattacher" (audit des connexions du 12/11,
// demande de Cindy : "quand un membre ne s'est jamais connecté, je suis
// dans l'obligation de rattacher sa boîte mail, c'est fastidieux").
//
// Constat de l'audit : sur 31 comptes reliés à rien, 30 avaient été créés
// avec une adresse qui ne figure sur AUCUNE fiche (adresse perso au lieu de
// celle de la licence) -- le rattachement automatique par email
// (handle_new_user) ne peut rien pour eux. Ce module les liste et propose,
// pour chacun, les fiches les plus probables.
//
// Calcul 100 % en mémoire, à partir des tables que l'onglet Bureau charge
// DÉJÀ (players, profiles, parent_player, team_coaches,
// club_administrators) : aucune requête supplémentaire (CLAUDE.md §6).
//
// Jamais de rattachement automatique ici : ce ne sont que des
// SUGGESTIONS, le Bureau confirme d'un clic (même règle que
// parent-link-manager.tsx -- deux incidents déjà vécus avec des
// heuristiques appliquées sans confirmation).

import { normalizeNameForMatching } from "./names";
import { normalizePhone } from "./phone";

export type UnlinkedSuggestion = {
  playerId: string;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  // "self" : la fiche de la personne elle-même (même prénom + nom).
  // "parent" : la personne est probablement parent de cet enfant.
  kind: "self" | "parent";
  reason: string;
};

export type UnlinkedAccount = {
  profileId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  lastLoginAt: string | null;
  suggestions: UnlinkedSuggestion[];
  // Même personne qu'une fiche DÉJÀ reliée à un autre compte : ce compte
  // est un doublon (2e adresse e-mail), pas un parent -- cas réels vus au
  // 12/11. On l'affiche pour information, sans rien proposer de relier.
  // childFiche : la fiche est celle d'un mineur -- doublon OU parent ayant
  // saisi le nom de son enfant, le Bureau tranche.
  duplicateOf: { playerName: string; email: string | null; childFiche: boolean } | null;
};

type PlayerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  profile_id: string | null;
  birth_date: string | null;
  archived_at: string | null;
  registration_phone: string | null;
  mother_phone: string | null;
  father_phone: string | null;
  other_phones: string | null;
};

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  last_login_at: string | null;
};

const MAX_SUGGESTIONS = 4;

// Même seuil que la règle automatique côté base (migration du 12/11) :
// une fiche de moins de 18 ans n'est jamais "le compte lui-même" si le
// prénom diffère -- c'est alors un parent.
export function isMinor(birthDate: string | null, today = new Date()): boolean {
  if (!birthDate) return false;
  const [y, m, d] = birthDate.split("-").map(Number);
  if (!y || !m || !d) return false;
  const adultFrom = new Date(y + 18, m - 1, d);
  return adultFrom > today;
}

function nameWords(value: string | null): string[] {
  return normalizeNameForMatching(value)
    .split(/[\s-]+/)
    .filter((w) => w.length >= 3);
}

function playerPhones(p: PlayerRow): Set<string> {
  const raw = [p.registration_phone, p.mother_phone, p.father_phone, ...(p.other_phones ?? "").split(/[,;/]/)];
  return new Set(raw.map(normalizePhone).filter((x): x is string => Boolean(x)));
}

export function computeUnlinkedAccounts({
  players,
  profiles,
  parentLinks,
  coachLinks,
  adminEmails,
  excludedPlayerIds,
}: {
  players: PlayerRow[];
  profiles: ProfileRow[];
  parentLinks: { parent_id: string; player_id: string }[];
  coachLinks: { coach_id: string }[];
  adminEmails: (string | null)[];
  // Fiches à ne jamais proposer (équipe démo uniquement).
  excludedPlayerIds: Set<string>;
}): UnlinkedAccount[] {
  const linkedProfileIds = new Set<string>();
  for (const p of players) if (p.profile_id) linkedProfileIds.add(p.profile_id);
  for (const l of parentLinks) linkedProfileIds.add(l.parent_id);
  for (const c of coachLinks) linkedProfileIds.add(c.coach_id);
  const admins = new Set(adminEmails.filter(Boolean).map((e) => e!.trim().toLowerCase()));

  // Fiches candidates : actives, hors démo, et pas déjà le compte de
  // quelqu'un (une fiche n'a qu'un seul compte "propre").
  const candidates = players.filter((p) => !p.archived_at && !excludedPlayerIds.has(p.id));
  const phonesByPlayerId = new Map(candidates.map((p) => [p.id, playerPhones(p)]));
  const emailByProfileId = new Map(profiles.map((p) => [p.id, p.email]));

  const result: UnlinkedAccount[] = [];
  for (const account of profiles) {
    if (linkedProfileIds.has(account.id)) continue;
    if (account.email && admins.has(account.email.trim().toLowerCase())) continue;

    const first = normalizeNameForMatching(account.first_name);
    const last = normalizeNameForMatching(account.last_name);
    const lastWords = nameWords(account.last_name);
    const phone = normalizePhone(account.phone);

    const suggestions: UnlinkedSuggestion[] = [];
    let duplicateOf: UnlinkedAccount["duplicateOf"] = null;
    for (const p of candidates) {
      const pFirst = normalizeNameForMatching(p.first_name);
      const pLast = normalizeNameForMatching(p.last_name);
      // Prénom/nom saisis à l'envers à l'inscription ("Dobek Noa" pour
      // Noa DOBEK) : même personne, cas réel vu au 12/11.
      const sameFull =
        Boolean(first) &&
        Boolean(last) &&
        ((pFirst === first && pLast === last) || (pFirst === last && pLast === first));
      if (sameFull && p.profile_id) {
        duplicateOf = {
          playerName: [p.first_name, p.last_name].filter(Boolean).join(" "),
          email: emailByProfileId.get(p.profile_id) ?? null,
          childFiche: isMinor(p.birth_date),
        };
        // Fiche d'enfant : ce compte peut aussi être un PARENT qui a tapé
        // le nom de son enfant à l'inscription (cas réel vu au 12/11 :
        // compte "Noa Dobek" créé avec l'adresse du père).
        if (isMinor(p.birth_date)) {
          suggestions.push({
            playerId: p.id,
            firstName: p.first_name,
            lastName: p.last_name,
            birthDate: p.birth_date,
            kind: "parent",
            reason: "A peut-être saisi le nom de son enfant à l'inscription",
          });
        }
        continue;
      }
      if (sameFull) {
        suggestions.push({
          playerId: p.id,
          firstName: p.first_name,
          lastName: p.last_name,
          birthDate: p.birth_date,
          kind: "self",
          reason: "Même prénom et même nom",
        });
        continue;
      }
      // Parent : uniquement vers une fiche d'enfant mineur, jamais vers un
      // adulte (un adulte a son propre compte, pas un "parent").
      if (!isMinor(p.birth_date)) continue;
      if (phone && phonesByPlayerId.get(p.id)?.has(phone)) {
        suggestions.push({
          playerId: p.id,
          firstName: p.first_name,
          lastName: p.last_name,
          birthDate: p.birth_date,
          kind: "parent",
          reason: "Même téléphone que sur la fiche",
        });
        continue;
      }
      const childWords = new Set(nameWords(p.last_name));
      if (lastWords.some((w) => childWords.has(w))) {
        suggestions.push({
          playerId: p.id,
          firstName: p.first_name,
          lastName: p.last_name,
          birthDate: p.birth_date,
          kind: "parent",
          reason: "Même nom de famille",
        });
      }
    }

    // Le compte correspond à une fiche de MINEUR (ado avec son propre
    // compte) : un mineur n'est le parent de personne -- les fiches au même
    // nom de famille sont ses frères et sœurs (cas réel vu au 12/11).
    // Doublon possible (voir duplicateOf) : seule la piste "parent de cet
    // enfant" est gardée, jamais les autres fiches au même nom de famille.
    const isMinorAccount = suggestions.some((s) => s.kind === "self" && isMinor(s.birthDate));
    const kept = duplicateOf
      ? suggestions.filter((s) => s.reason.startsWith("A peut-être"))
      : isMinorAccount
        ? suggestions.filter((s) => s.kind === "self")
        : suggestions;

    // Les indices les plus sûrs d'abord : même personne, puis téléphone,
    // puis nom de famille seul.
    const rank = (s: UnlinkedSuggestion) =>
      s.kind === "self" ? 0 : s.reason.startsWith("Même téléphone") ? 1 : 2;
    kept.sort((a, b) => rank(a) - rank(b));

    result.push({
      profileId: account.id,
      firstName: account.first_name,
      lastName: account.last_name,
      email: account.email,
      phone: account.phone,
      lastLoginAt: account.last_login_at,
      suggestions: kept.slice(0, MAX_SUGGESTIONS),
      duplicateOf,
    });
  }

  // Les comptes qui se sont connectés le plus récemment d'abord : ce sont
  // des personnes qui attendent en ce moment devant un espace vide.
  // Les doublons (rien à relier) passent en fin de liste.
  result.sort(
    (a, b) =>
      Number(Boolean(a.duplicateOf)) - Number(Boolean(b.duplicateOf)) ||
      (b.lastLoginAt ?? "").localeCompare(a.lastLoginAt ?? "")
  );
  return result;
}
