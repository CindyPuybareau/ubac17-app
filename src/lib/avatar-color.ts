// Couleur déterministe par personne, pour un avatar-initiale coloré sans
// vraie photo — même palette que child-team-tab.tsx (Espace Enfant,
// avatars des coéquipiers), extraite ici pour être réutilisée ailleurs
// (sélecteur d'enfant de l'espace Famille, family-view.tsx) sans dupliquer
// la même liste/fonction de hash à chaque nouvel endroit.
const AVATAR_COLORS = [
  "bg-ubac-blue",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-teal-500",
];

export function avatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
