// Canonical teams intentionally have name === category (see migration
// 20260812000000_teams_rename_canonical.sql) so every view shows the same
// wording — but that means naively concatenating "{name} · {category}"
// prints "U13F · U13F". Only join the two when they actually differ.
export function teamLabel(t: { name?: string | null; category?: string | null }): string {
  const name = t.name ?? null;
  const category = t.category ?? null;
  if (name && category && name !== category) return `${name} · ${category}`;
  return name ?? category ?? "Équipe";
}
