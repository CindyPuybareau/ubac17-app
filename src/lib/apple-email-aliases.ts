// Retour de Cindy du 12/11 (Julien RUSKE, vice-président) : une adresse
// Apple existe sous trois noms qui arrivent dans la MÊME boîte --
// prenom@icloud.com, prenom@me.com, prenom@mac.com. Un membre inscrit avec
// l'une mais qui tape l'autre à la connexion recevait "Email ou mot de
// passe incorrect", alors qu'il s'agit bien de lui. La page de connexion
// essaie donc les autres variantes quand l'adresse tapée ne correspond à
// aucun compte -- jamais une autre boîte que la sienne : ces trois domaines
// sont des alias d'un seul et même compte Apple.
const APPLE_DOMAINS = ["icloud.com", "me.com", "mac.com"];

export function appleEmailVariants(email: string): string[] {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 1) return [];
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (!APPLE_DOMAINS.includes(domain)) return [];
  return APPLE_DOMAINS.filter((d) => d !== domain).map((d) => `${local}@${d}`);
}
