import { parseMatchTitle, opponentInitials } from "@/lib/match-display";

export default function OpponentDisplay({
  title,
  size = "md",
}: {
  title: string | null;
  size?: "sm" | "md";
}) {
  const { opponent, isHome } = parseMatchTitle(title);
  const avatarSize = size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs";
  const textSize = size === "sm" ? "text-sm" : "text-base";

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-navy font-bold text-white ${avatarSize}`}
      >
        {opponentInitials(opponent)}
      </span>
      <span className={`truncate font-semibold text-zinc-900 ${textSize}`}>
        {opponent}
      </span>
      {isHome !== null && (
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            isHome
              ? "bg-green-100 text-green-700"
              : "bg-ubac-blue/10 text-ubac-blue"
          }`}
        >
          {isHome ? "DOM" : "EXT"}
        </span>
      )}
    </div>
  );
}
