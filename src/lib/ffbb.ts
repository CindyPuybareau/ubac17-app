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

// FFBB shows a day + short month name with no year (e.g. "20 sept. 17h00").
// Infer the year from a basketball season spanning Aug (year N) -> Jul (year N+1).
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
  const now = new Date();
  const seasonStartYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const year = monthIndex >= 7 ? seasonStartYear : seasonStartYear + 1;

  const date = new Date(Date.UTC(year, monthIndex, Number(day), Number(hour), Number(minute)));
  return date.toISOString();
}

export function parseFfbbTeamPage(html: string): FfbbMatch[] {
  const $ = cheerio.load(html);
  const matches: FfbbMatch[] = [];

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

    matches.push({
      matchNumber,
      journee,
      isHome: /domicile/i.test(domExt),
      opponent,
      startTime: parseFrenchMatchDate(dateHeure),
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
