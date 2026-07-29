export type ParsedMatchTitle = {
  opponent: string;
  isHome: boolean | null;
};

// Event titles created by the FFBB sync / planning import are prefixed with
// "vs " (home) or "@ " (away) ahead of the opponent name. Manually created
// events have no such prefix, so isHome stays unknown (no badge shown).
export function parseMatchTitle(title: string | null): ParsedMatchTitle {
  if (!title) return { opponent: "Match", isHome: null };
  if (title.startsWith("@ ")) {
    return { opponent: title.slice(2).trim(), isHome: false };
  }
  if (title.startsWith("vs ")) {
    return { opponent: title.slice(3).trim(), isHome: true };
  }
  return { opponent: title, isHome: null };
}

export function opponentInitials(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "?";
}
