import { createHmac, timingSafeEqual } from "crypto";

// Session bénévole, même principe que child-session.ts (voir ce fichier
// pour le contexte général) : un bénévole n'a ni compte Supabase Auth ni
// mot de passe à lui donner — juste un lien privé, propre à lui, généré
// par le Bureau depuis sa fiche. Contrairement à l'Espace Enfant (un lien
// familial partagé + un code à 4 chiffres, plusieurs enfants derrière un
// même lien), un bénévole est seul sur son lien : le jeton présent dans
// l'URL (benevoles.access_token, voir la migration) sert directement de
// preuve d'identité, sans étape de code supplémentaire — /benevole/view (la
// page qui lit ce cookie) ne fait que des lectures en dur, jamais
// d'insert/update/delete direct. Seule exception : /api/benevole-signup,
// qui vérifie ce même cookie pour n'autoriser qu'une seule action précise
// (s'inscrire/se désinscrire d'un besoin, sous SON PROPRE benevole_id).
//
// "benevole." en tête de la charge utile (absent côté enfant) : les deux
// cookies portent un nom différent (jamais de confusion possible côté
// navigateur), mais si jamais l'un des deux jetons finissait, par erreur
// de code, vérifié par l'autre module, ce préfixe le ferait échouer
// immédiatement plutôt que de résoudre un id dans le mauvais contexte.
export const BENEVOLE_SESSION_COOKIE = "ubac_benevole_session";
// Même durée que la session enfant (voir child-session.ts pour le détail
// du plafond de 400 jours imposé par les navigateurs) : un bénévole qui a
// ouvert son lien une fois ne doit pas avoir à le rouvrir sans cesse.
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 400;

function secret(): string {
  const s = process.env.BENEVOLE_SESSION_SECRET;
  if (!s) throw new Error("BENEVOLE_SESSION_SECRET absente de l'environnement.");
  return s;
}

export function signBenevoleSession(benevoleId: string): { token: string; maxAgeSeconds: number } {
  const exp = Date.now() + SESSION_DURATION_MS;
  const payload = `benevole.${benevoleId}.${exp}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("hex");
  return { token: `${payload}.${sig}`, maxAgeSeconds: Math.floor(SESSION_DURATION_MS / 1000) };
}

export function verifyBenevoleSession(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "benevole") return null;
  const [, benevoleId, expStr, sig] = parts;
  const payload = `benevole.${benevoleId}.${expStr}`;
  let expected: Buffer;
  let given: Buffer;
  try {
    expected = Buffer.from(createHmac("sha256", secret()).update(payload).digest("hex"), "hex");
    given = Buffer.from(sig, "hex");
  } catch {
    return null;
  }
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  return benevoleId;
}
