import { createHmac, timingSafeEqual } from "crypto";

// Session enfant volontairement séparée d'auth.users/Supabase Auth : un
// enfant n'a ni email ni téléphone, donc aucune session Supabase classique
// à lui donner. À la place, un cookie signé (HMAC, jamais un JWT Supabase)
// qui ne porte qu'un player_id et une expiration. /enfant/view (la page qui
// le lit) ne fait que des lectures en dur, jamais d'insert/update/delete.
// Seule exception, volontaire et confirmée par Cindy le 2026-08-22 :
// /api/child-avatar, qui vérifie ce même cookie pour n'autoriser qu'une
// seule écriture précise (players.avatar_url, sur SON PROPRE player_id) —
// jamais un accès direct à Supabase depuis le navigateur.
export const CHILD_SESSION_COOKIE = "ubac_child_session";
// Retour de Cindy du 2026-08-24 : "la session enfant ne doit pas être
// déconnectée sous 30 jours, elle doit rester active toujours une fois
// connectée" — appareil familial/personnel partagé, pas de mot de passe à
// retaper sans cesse. 400 jours plutôt qu'une durée "infinie" : c'est le
// plafond que Chrome et Safari imposent eux-mêmes sur Max-Age depuis 2023
// (un cookie posé avec une durée plus longue est silencieusement ramené à
// 400 jours par le navigateur) — c'est donc, en pratique, le maximum
// réellement "toujours" qu'on puisse offrir avec un cookie.
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 400;

function secret(): string {
  const s = process.env.CHILD_SESSION_SECRET;
  if (!s) throw new Error("CHILD_SESSION_SECRET absent de l'environnement.");
  return s;
}

export function signChildSession(playerId: string): { token: string; maxAgeSeconds: number } {
  const exp = Date.now() + SESSION_DURATION_MS;
  const payload = `${playerId}.${exp}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("hex");
  return { token: `${payload}.${sig}`, maxAgeSeconds: Math.floor(SESSION_DURATION_MS / 1000) };
}

export function verifyChildSession(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [playerId, expStr, sig] = parts;
  const payload = `${playerId}.${expStr}`;
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
  return playerId;
}
