// Suivi "déjà fêté" pour l'animation confettis (retour de Cindy du 26/08 :
// une seule fois par personne, pas à chaque fois qu'on revoit le résultat).
// Simple liste d'ids en localStorage — pas de table en base, un match fêté
// une fois sur un appareil n'a pas besoin de le rester pour toujours ni
// d'être synchronisé entre appareils, l'enjeu est purement festif.
const STORAGE_KEY = "ubac_celebrated_matches";
// Nombre max d'ids conservés : purement pour éviter que le tableau ne
// grossisse indéfiniment au fil des saisons, aucune signification autre.
const MAX_ENTRIES = 200;

export function hasCelebratedMatch(eventId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    return ids.includes(eventId);
  } catch {
    // Lecture impossible (storage plein, navigation privée stricte...) :
    // on considère "déjà fêté" par sécurité plutôt que de risquer de
    // rejouer l'animation en boucle à chaque rendu.
    return true;
  }
}

export function markMatchCelebrated(eventId: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    if (!ids.includes(eventId)) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids, eventId].slice(-MAX_ENTRIES)));
    }
  } catch {
    // Best-effort : une écriture ratée signifie juste que l'animation
    // pourrait rejouer une fois de plus, rien de grave.
  }
}
