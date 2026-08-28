// Suivi "déjà fêté" pour l'animation confettis (retour de Cindy du 26/08 :
// une seule fois par personne, pas à chaque fois qu'on revoit le résultat).
// Simple liste de clés en localStorage — pas de table en base, un match
// fêté une fois sur un appareil n'a pas besoin de le rester pour toujours
// ni d'être synchronisé entre appareils, l'enjeu est purement festif.
//
// Clé = eventId + score (retour d'audit du 28/08), pas eventId seul : une
// victoire saisie par erreur puis corrigée en défaite puis re-corrigée en
// victoire (ou un score domicile/extérieur inversé à la saisie) restait
// "déjà fêtée" pour toujours dès la première fois, même une fois le bon
// résultat rétabli. Un score qui change — correction ou non — mérite sa
// propre vérification plutôt que d'hériter du verdict d'un ancien score.
const STORAGE_KEY = "ubac_celebrated_matches";
// Nombre max de clés conservées : purement pour éviter que le tableau ne
// grossisse indéfiniment au fil des saisons, aucune signification autre.
const MAX_ENTRIES = 200;

// Séparée de hasCelebratedMatch/markMatchCelebrated (retour d'audit du
// 28/08) : une valeur corrompue (pas un tableau JSON) faisait lever
// `ids.includes`, rattrapé par le catch englobant qui répondait "déjà
// fêté" pour de bon — plus aucun confetti sur cet appareil, jamais. Une
// valeur illisible est maintenant traitée comme une liste vide (un
// éventuel rejeu de l'animation est sans conséquence), pas comme une
// panne définitive.
function readKeys(): string[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
}

export function hasCelebratedMatch(resultKey: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return readKeys().includes(resultKey);
  } catch {
    // Accès au storage lui-même impossible (navigation privée stricte,
    // storage désactivé...) : on considère "déjà fêté" par sécurité
    // plutôt que de risquer de rejouer l'animation en boucle.
    return true;
  }
}

export function markMatchCelebrated(resultKey: string): void {
  if (typeof window === "undefined") return;
  try {
    const keys = readKeys();
    if (!keys.includes(resultKey)) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys, resultKey].slice(-MAX_ENTRIES)));
    }
  } catch {
    // Best-effort : une écriture ratée signifie juste que l'animation
    // pourrait rejouer une fois de plus, rien de grave.
  }
}
