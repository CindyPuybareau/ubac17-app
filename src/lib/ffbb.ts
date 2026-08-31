import * as cheerio from "cheerio";

export type FfbbMatch = {
  matchNumber: string;
  journee: string;
  isHome: boolean;
  opponent: string | null;
  startTime: string | null;
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

export function parseFfbbTeamPage(html: string): FfbbMatch[] {
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

    matches.push({
      matchNumber,
      journee,
      isHome: /domicile/i.test(domExt),
      opponent,
      startTime,
    });
  });

  return matches;
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

export async function fetchFfbbTeamCalendar(url: string): Promise<FfbbMatch[]> {
  const validated = assertFfbbUrl(url);
  const res = await fetch(validated, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; UBAC17App/1.0)" },
  });
  if (!res.ok) {
    throw new Error(`FFBB request failed with status ${res.status}`);
  }
  const html = await res.text();
  return parseFfbbTeamPage(html);
}
