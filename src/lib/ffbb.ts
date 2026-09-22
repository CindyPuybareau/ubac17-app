import * as cheerio from "cheerio";

export type FfbbMatch = {
  matchNumber: string;
  journee: string;
  isHome: boolean;
  opponent: string | null;
  startTime: string | null;
  // Retour de Cindy du 21/09 ("les résultats ne s'affichent pas en
  // automatique dans les cartes") : la synchro n'importait jusqu'ici que
  // le calendrier (adversaire/date), jamais le score une fois le match
  // joué -- à saisir à la main via "Ajouter le score". La FFBB publie
  // pourtant déjà le score dans le même bloc JSON que la date (voir
  // parseScoresByMatchNumber plus bas) : null tant que le match n'est pas
  // joué, ou que son score n'a pas encore été saisi côté FFBB.
  ownScore: number | null;
  opponentScore: number | null;
};

// Retour de Cindy du 21/09 : la carte "Classement" du calendrier
// (Résultats/Matchs officiels) était un texte statique en dur, jamais
// branché à une vraie donnée. La page FFBB d'une équipe embarque un
// widget "Classement officiel de l'équipe" -- l'équipe elle-même et les
// quelques équipes autour d'elle dans sa poule (jamais la poule entière :
// pas trouvé de source exploitable côté serveur pour ça, et retour de
// Cindy explicite -- "je ne veux que l'équipe concernée, les autres
// poules ne m'intéressent pas").
export type FfbbRankingEntry = {
  position: string;
  label: string;
  points: string;
  previousRanking: number | null;
  isOwnTeam: boolean;
  logo: string | null;
};

const FRENCH_MONTHS: Record<string, number> = {
  "janv": 0, "févr": 1, "mars": 2, "avr": 3, "mai": 4, "juin": 5,
  "juil": 6, "août": 7, "sept": 8, "oct": 9, "nov": 10, "déc": 11,
};

// L'heure FFBB est une heure locale de Paris (CET l'hiver = UTC+1, CEST
// l'été = UTC+2) — décalage variable selon la période de l'année. Aucune
// librairie de fuseaux horaires dans ce projet : on interroge directement
// Intl (natif, toujours à jour sur les règles DST) pour connaître l'écart
// Paris/UTC au moment visé, plutôt que de le coder en dur.
function parisOffsetMinutes(utcInstant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(utcInstant).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (asIfUtc - utcInstant.getTime()) / 60000;
}

// Convertit une heure murale de Paris (année/mois/jour/heure/minute, tous
// tels qu'affichés sur le site FFBB) en instant UTC réel.
function parisWallTimeToUtc(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number
): Date {
  // Première approximation en traitant l'heure murale comme de l'UTC, pour
  // avoir un instant proche duquel lire le bon décalage saisonnier.
  const guess = new Date(Date.UTC(year, monthIndex, day, hour, minute));
  const offsetMin = parisOffsetMinutes(guess);
  return new Date(guess.getTime() - offsetMin * 60000);
}

// FFBB shows a day + short month name with no year (e.g. "20 sept. 17h00").
// Infer the year from a basketball season spanning Aug (year N) -> Jul (year N+1).
//
// N'est plus la source principale (voir dateRencontreByMatchNumber
// ci-dessous) : gardée en repli si jamais le bloc JSON interne de FFBB
// disparaît un jour, mais son heure affichée s'est révélée fausse (voir
// commentaire sur parseDateRencontreMap) — seuls jour/mois/année en sont
// encore fiables dans ce fallback.
function parseFrenchMatchDate(text: string): string | null {
  const m = text.match(/(\d{1,2})\s+([a-zéû]+)\.?\s+(\d{1,2})h(\d{2})/i);
  if (!m) return null;
  const [, day, monthRaw, hour, minute] = m;
  const monthIndex = FRENCH_MONTHS[monthRaw.toLowerCase()];
  if (monthIndex === undefined) return null;

  // Les deux bornes doivent utiliser exactement le même mois de coupure
  // (août, comme documenté ci-dessus) : un léger désaccord entre celle
  // utilisée pour "maintenant" et celle utilisée pour le mois du match
  // datait un match de juillet consulté en juillet un an trop tard.
  // Lu en Europe/Paris (audit du 31/08), pas dans le fuseau du serveur
  // (UTC sur Vercel) — même correctif que src/lib/season.ts, seuil de
  // coupure différent (août ici, propre à ce repli FFBB) donc pas
  // réutilisable tel quel depuis season.ts.
  const nowParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const nowMonth = Number(nowParts.find((p) => p.type === "month")?.value) - 1;
  const nowYear = Number(nowParts.find((p) => p.type === "year")?.value);
  const seasonStartYear = nowMonth >= 7 ? nowYear : nowYear - 1;
  const year = monthIndex >= 7 ? seasonStartYear : seasonStartYear + 1;

  const date = parisWallTimeToUtc(year, monthIndex, Number(day), Number(hour), Number(minute));
  return date.toISOString();
}

// Retour de Cindy du 2026-08-22 (match #2009, "20 sept.") : l'heure lue sur
// le texte affiché de la page FFBB ("17h00") ne correspondait pas à
// l'heure réelle du match ("15h00", confirmé par Cindy en direct sur le
// site FFBB). Vérifié en récupérant la page : FFBB embarque dans son HTML
// un bloc de données JSON (utilisé pour l'hydratation React) contenant le
// vrai horaire de chaque match — {"date_rencontre":"2026-09-20T15:00:00",
// "joue":false,"numero":"2009"} — et CE texte-là affiché ("17h00") est
// systématiquement 2h en avance sur cette donnée (vérifié sur deux matchs
// différents, dont un du soir) : un bug d'affichage côté FFBB, pas chez
// nous. On lit donc directement ce JSON plutôt que le texte visible,
// beaucoup plus fiable en plus d'éviter le mois abrégé français à parser.
function parseDateRencontreMap(html: string): Map<string, string> {
  // Ce bloc apparaît parfois échappé (\") selon l'endroit de la page où
  // Next.js l'a sérialisé pour l'hydratation — normalisé une fois ici
  // plutôt que de dupliquer le regex pour les deux formes.
  const normalized = html.replace(/\\"/g, '"');
  const re = /"date_rencontre":"([^"]+)","joue":(?:true|false),"numero":"(\d+)"/g;
  const map = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    map.set(m[2], m[1]);
  }
  return map;
}

// Même bloc JSON que dateRencontreByMatchNumber (voir son commentaire),
// avec en plus resultatEquipe1/resultatEquipe2 ("null" tant que le match
// n'est pas joué) et l'identifiant FFBB de chaque équipe -- indispensable
// pour savoir LAQUELLE des deux est la nôtre (resultatEquipe1 n'est pas
// toujours "nous", ça dépend de qui la FFBB liste en premier pour ce
// match précis, pas de domicile/extérieur). [\s\S]*? (pas [^{}]*?) entre
// les deux id : le contenu entre les deux est un objet imbriqué à
// plusieurs niveaux (idOrganisme, logo...), qu'un simple "tout sauf
// accolade" ne saurait pas traverser -- validé en direct sur la page
// FFBB réelle (5 matchs, joués et à venir, tous correctement extraits)
// avant d'être posé ici.
function parseScoresByMatchNumber(
  html: string,
  ownTeamFfbbId: string
): Map<string, { ownScore: number; opponentScore: number }> {
  const normalized = html.replace(/\\"/g, '"');
  const re =
    /"date_rencontre":"[^"]+","joue":(?:true|false),"numero":"(\d+)","numeroJournee":"[^"]*","resultatEquipe1":(null|"\d+"),"resultatEquipe2":(null|"\d+")[\s\S]*?"idEngagementEquipe1":\{"id":"(\d+)"[\s\S]*?"idEngagementEquipe2":\{"id":"(\d+)"/g;
  const map = new Map<string, { ownScore: number; opponentScore: number }>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    const [, matchNumber, r1Raw, r2Raw, id1, id2] = m;
    if (r1Raw === "null" || r2Raw === "null") continue;
    const score1 = Number(r1Raw.replace(/"/g, ""));
    const score2 = Number(r2Raw.replace(/"/g, ""));
    if (id1 === ownTeamFfbbId) {
      map.set(matchNumber, { ownScore: score1, opponentScore: score2 });
    } else if (id2 === ownTeamFfbbId) {
      map.set(matchNumber, { ownScore: score2, opponentScore: score1 });
    }
  }
  return map;
}

// Dernier segment numérique de teams.ffbb_url (.../equipes/200000005377830)
// -- l'identifiant FFBB de l'ÉQUIPE elle-même (pas du club), indispensable
// à parseScoresByMatchNumber pour distinguer notre score du score adverse.
function extractOwnTeamFfbbId(url: URL): string | null {
  const segments = url.pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  return last && /^\d+$/.test(last) ? last : null;
}

// "2026-09-20T15:00:00" (naïf, sans fuseau) — c'est l'heure murale de
// Paris telle qu'affichée aux joueurs après hydratation côté FFBB, donc la
// même conversion que le texte scrappé (parisWallTimeToUtc).
function parseDateRencontre(value: string): string | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, year, month, day, hour, minute] = m;
  const date = parisWallTimeToUtc(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute)
  );
  return date.toISOString();
}

// Pas exportée (nettoyage du 31/08) : utilisée uniquement par
// fetchFfbbTeamCalendar ci-dessous, jamais ailleurs dans le repo.
function parseFfbbTeamPage(
  html: string,
  scoresByMatchNumber: Map<string, { ownScore: number; opponentScore: number }>
): FfbbMatch[] {
  const $ = cheerio.load(html);
  const matches: FfbbMatch[] = [];
  const dateRencontreByMatchNumber = parseDateRencontreMap(html);

  $("div").each((_, el) => {
    const text = $(el).text().trim();
    if (!/^#\d+$/.test(text)) return;

    const matchNumber = text.slice(1);
    const journee = $(el).next().text().trim();
    const dateHeure = $(el).next().next().text().trim();
    const domExt = $(el).next().next().next().text().trim();

    const infoBlock = $(el).parent().parent();
    const oppBlock = infoBlock.next();
    const opponent = oppBlock.find("a[title]").first().attr("title") ?? null;

    const dateRencontre = dateRencontreByMatchNumber.get(matchNumber);
    const startTime = dateRencontre
      ? (parseDateRencontre(dateRencontre) ?? parseFrenchMatchDate(dateHeure))
      : parseFrenchMatchDate(dateHeure);

    const score = scoresByMatchNumber.get(matchNumber);
    matches.push({
      matchNumber,
      journee,
      isHome: /domicile/i.test(domExt),
      opponent,
      startTime,
      ownScore: score?.ownScore ?? null,
      opponentScore: score?.opponentScore ?? null,
    });
  });

  return matches;
}

// Même bloc d'hydratation React que parseDateRencontreMap (guillemets
// échappés en "\"" par endroits selon où Next.js l'a sérialisé) : un
// tableau JSON "rankings" complet, imbriqué (objets "url"/"logo" par
// ligne) -- une regex à plat ne suffit pas ici, contrairement à
// dateRencontreByMatchNumber, d'où ce petit scanner à parenthésage qui
// respecte les guillemets pour trouver la fin exacte du tableau avant de
// le confier à JSON.parse.
function parseFfbbRankings(html: string): FfbbRankingEntry[] {
  const normalized = html.replace(/\\"/g, '"');
  const marker = '"rankings":[';
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex === -1) return [];

  const arrayStart = markerIndex + marker.length - 1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let arrayEnd = -1;
  for (let i = arrayStart; i < normalized.length; i++) {
    const ch = normalized[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        arrayEnd = i;
        break;
      }
    }
  }
  if (arrayEnd === -1) return [];

  try {
    const raw = JSON.parse(normalized.slice(arrayStart, arrayEnd + 1)) as {
      position: string;
      label: string;
      points: string;
      previousRanking: number | null;
      selected: boolean;
      logo: string | null;
    }[];
    return raw.map((r) => ({
      position: r.position,
      label: r.label,
      points: r.points,
      previousRanking: r.previousRanking ?? null,
      isOwnTeam: Boolean(r.selected),
      logo: r.logo ?? null,
    }));
  } catch {
    return [];
  }
}

// teams.ffbb_url est un champ texte libre que n'importe quel coach peut
// modifier depuis les réglages de son équipe (policy "coach update own
// teams") — sans ce contrôle, la route qui appelle cette fonction ferait
// une requête serveur vers N'IMPORTE QUELLE URL qu'un coach y colle (SSRF :
// service interne, métadonnées cloud, etc.), le tout depuis l'infra
// Vercel du projet. Seule la FFBB a une raison légitime d'être derrière ce
// champ.
const FFBB_ALLOWED_HOSTS = ["ffbb.com", "www.ffbb.com", "competitions.ffbb.com"];

function assertFfbbUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("URL FFBB invalide.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("URL FFBB invalide : https requis.");
  }
  const host = parsed.hostname.toLowerCase();
  const allowed = FFBB_ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  if (!allowed) {
    throw new Error("URL FFBB invalide : domaine non autorisé.");
  }
  return parsed;
}

// Retour de Cindy du 15/09 ("ça tourne dans le vide") : ce fetch n'avait
// aucune limite de temps -- si le site FFBB ne répond pas (lenteur
// ponctuelle, blocage réseau...), la requête restait bloquée
// indéfiniment, donc la route (route.ts) ne renvoyait jamais rien, donc
// le bouton "Synchroniser" côté client tournait pour toujours (son propre
// try/catch/finally ne peut rien arranger : il n'a tout simplement jamais
// reçu de réponse, ni succès ni erreur). AbortController coupe la requête
// après 20s -- assez pour une page FFBB normale (vérifié : moins d'1s en
// temps normal), pas assez pour bloquer l'appelant en cas de souci côté
// FFBB. Rejette alors une vraie erreur, qui devient un 502 propre côté
// route.ts au lieu d'un silence total.
const FFBB_FETCH_TIMEOUT_MS = 20_000;

// Extrait pour être réutilisé par fetchFfbbTeamRanking (retour de Cindy du
// 21/09, carte "Classement") : même page FFBB, même garde-fous
// (validation d'URL, délai, message d'erreur) -- comportement de
// fetchFfbbTeamCalendar inchangé, juste sorti de la fonction pour ne pas
// dupliquer ces garde-fous une deuxième fois.
async function fetchFfbbHtml(url: string): Promise<string> {
  const validated = assertFfbbUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FFBB_FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(validated, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; UBAC17App/1.0)" },
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("FFBB request timed out");
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    throw new Error(`FFBB request failed with status ${res.status}`);
  }
  return res.text();
}

export async function fetchFfbbTeamCalendar(url: string): Promise<FfbbMatch[]> {
  const html = await fetchFfbbHtml(url);
  const ownTeamFfbbId = extractOwnTeamFfbbId(assertFfbbUrl(url));
  const scoresByMatchNumber = ownTeamFfbbId
    ? parseScoresByMatchNumber(html, ownTeamFfbbId)
    : new Map<string, { ownScore: number; opponentScore: number }>();
  return parseFfbbTeamPage(html, scoresByMatchNumber);
}

export async function fetchFfbbTeamRanking(url: string): Promise<FfbbRankingEntry[]> {
  const html = await fetchFfbbHtml(url);
  return parseFfbbRankings(html);
}
