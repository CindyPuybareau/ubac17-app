// Comparaison volontairement simple (9 derniers chiffres significatifs,
// +33/0 de tête ignorés) : suffisant pour rapprocher "0611223344" et
// "+33611223344", pas la peine d'une lib de parsing téléphonique pour un
// signal qui reste de toute façon une SUGGESTION, jamais appliqué seul.
// Partagé par parent-link-manager.tsx (fiche membre) et
// unlinked-accounts.ts (écran "Comptes à rattacher").
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  const trimmed = digits.replace(/^\+?33/, "").replace(/^0/, "");
  return trimmed.length >= 6 ? trimmed : null;
}
