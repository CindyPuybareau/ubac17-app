import { Award, Lock, Sparkles } from "lucide-react";
import { formatFirstName } from "@/lib/names";
import type { ChildBadge } from "./child-dashboard";

// Chaque badge est calculé côté serveur à partir de vraies données de
// présence (page.tsx) — rien n'est mis en scène ou aléatoire, un badge
// verrouillé montre une vraie progression vers un vrai seuil.
export default function ChildBadgesTab({
  firstName,
  category,
  badges,
}: {
  firstName: string | null;
  category: string | null;
  badges: ChildBadge[];
}) {
  const unlockedCount = badges.filter((b) => b.unlocked).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-gradient-to-br from-ubac-yellow to-ubac-yellow-dark p-5 text-navy shadow-sm">
        <p className="text-lg font-bold">{formatFirstName(firstName) || "Champion"}</p>
        <p className="text-sm font-medium opacity-80">{category ?? "UBAC"}</p>
        <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="h-4 w-4 shrink-0" />
          {unlockedCount} badge{unlockedCount > 1 ? "s" : ""} débloqué{unlockedCount > 1 ? "s" : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {badges.map((b) => (
          <div
            key={b.key}
            className={`flex flex-col gap-2 rounded-2xl border p-4 shadow-sm ${
              b.unlocked ? "border-ubac-yellow bg-white" : "border-zinc-100 bg-zinc-50"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  b.unlocked ? "bg-ubac-yellow text-navy" : "bg-zinc-200 text-zinc-400"
                }`}
              >
                {b.unlocked ? <Award className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
              </span>
              <p className={`font-semibold ${b.unlocked ? "text-zinc-900" : "text-zinc-500"}`}>{b.label}</p>
            </div>
            <p className="text-xs text-zinc-500">{b.description}</p>
            {!b.unlocked && b.target != null && (
              <div className="mt-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
                  <div
                    className="h-full rounded-full bg-ubac-yellow-dark transition-all"
                    style={{
                      width: `${Math.min(100, Math.round(((b.progress ?? 0) / b.target) * 100))}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">
                  {b.progress ?? 0}
                  {b.isPercent ? "%" : ""} / {b.target}
                  {b.isPercent ? "%" : ""}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
