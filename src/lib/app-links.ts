// Déplacé de lib/whatsapp.ts (retrait de "Groupes WhatsApp", 19/10) : cette
// fonction n'a jamais eu de rapport avec WhatsApp en elle-même — un lien
// "reviens ici en un clic" vers l'appli, utilisé par member-detail-modal.tsx
// pour copier un lien vers une fiche membre. Il ne porte qu'un id, jamais de
// donnée personnelle, et la destination reste protégée par la connexion +
// RLS normales, donc le coller n'importe où (WhatsApp ou ailleurs) est sûr.
export function buildAppDeepLink(section: string, params: Record<string, string>): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const query = new URLSearchParams({ section, ...params });
  return `${origin}/dashboard?${query.toString()}`;
}
