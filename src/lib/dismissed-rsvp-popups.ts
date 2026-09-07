// Suivi "vu/répondu une fois" pour la popup de relance RSVP (retour de
// Cindy du 07/09 : "une fois le popup en fait suffira... sinon ils auront
// des popup tous le temps"). Même mécanique que celebrated-matches.ts
// (tableau de clés en JSON, plafonné, tolérant aux erreurs) — un seul
// module de référence pour ce genre de "ne plus jamais réafficher X".
const STORAGE_KEY = "ubac_dismissed_rsvp_popups";
const MAX_ENTRIES = 200;

function readKeys(): string[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed)
    ? parsed.filter((k): k is string => typeof k === "string")
    : [];
}

// event_id + id personne : une même personne doit revoir la popup si un
// NOUVEL événement arrive, mais jamais se refaire proposer celui qu'elle
// vient de fermer ou pour lequel elle a déjà répondu.
export function rsvpPopupKey(eventId: string, personId: string): string {
  return `${eventId}:${personId}`;
}

export function hasDismissedRsvpPopup(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return readKeys().includes(key);
  } catch {
    // En cas d'erreur de lecture, on préfère montrer la popup plutôt que
    // risquer de bloquer silencieusement une vraie relance.
    return false;
  }
}

export function markRsvpPopupDismissed(key: string): void {
  if (typeof window === "undefined") return;
  try {
    const keys = readKeys();
    if (!keys.includes(key)) {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([...keys, key].slice(-MAX_ENTRIES))
      );
    }
  } catch {
    // best-effort
  }
}
