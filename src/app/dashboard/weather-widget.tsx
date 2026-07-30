import {
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
} from "lucide-react";
import { fetchClubWeather, weekendIsoDatesFor, type WeatherCategory } from "./weather";

const CATEGORY_META: Record<
  WeatherCategory,
  { label: string; icon: typeof Sun; className: string }
> = {
  clear: { label: "Ciel dégagé", icon: Sun, className: "text-amber-500" },
  "partly-cloudy": { label: "Éclaircies", icon: CloudSun, className: "text-amber-400" },
  cloudy: { label: "Nuageux", icon: Cloud, className: "text-zinc-400" },
  fog: { label: "Brouillard", icon: CloudFog, className: "text-zinc-400" },
  drizzle: { label: "Bruine", icon: CloudDrizzle, className: "text-sky-500" },
  rain: { label: "Pluie", icon: CloudRain, className: "text-sky-600" },
  snow: { label: "Neige", icon: CloudSnow, className: "text-sky-300" },
  storm: { label: "Orage", icon: CloudLightning, className: "text-purple-500" },
};

function advice(category: WeatherCategory): string {
  switch (category) {
    case "clear":
    case "partly-cloudy":
      return "Super temps pour jouer !";
    case "rain":
    case "drizzle":
    case "storm":
      return "Pensez à un vêtement de pluie pour le trajet.";
    case "snow":
      return "Route possiblement glissante, partez tôt.";
    default:
      return "Vérifiez la météo avant de partir.";
  }
}

export default async function WeatherWidget({
  nextMatchIso,
}: {
  nextMatchIso?: string | null;
}) {
  const weather = await fetchClubWeather();
  if (!weather) return null;

  const current = CATEGORY_META[weather.currentCategory];
  const CurrentIcon = current.icon;

  const weekendDays = nextMatchIso
    ? weekendIsoDatesFor(nextMatchIso)
        .map((iso) => weather.daily.find((d) => d.date === iso))
        .filter((d): d is NonNullable<typeof d> => Boolean(d))
    : [];

  return (
    <div className="flex flex-col rounded-2xl border border-sky-100 bg-sky-50/60 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CurrentIcon className={`h-9 w-9 shrink-0 ${current.className}`} />
          <div>
            <p className="text-xl font-bold leading-tight text-zinc-900">
              {weather.currentTemp}°C
            </p>
            <p className="text-xs text-zinc-500">{current.label} · Sainte-Soulle</p>
          </div>
        </div>
        <p className="max-w-[45%] text-right text-xs font-medium leading-snug text-zinc-600">
          {advice(weather.currentCategory)}
        </p>
      </div>

      {weekendDays.length > 0 && (
        <div className="mt-3 flex gap-2 border-t border-sky-100 pt-3">
          {weekendDays.map((d) => {
            const meta = CATEGORY_META[d.category];
            const Icon = meta.icon;
            const label = new Date(`${d.date}T12:00:00`).toLocaleDateString("fr-FR", {
              weekday: "long",
            });
            return (
              <div
                key={d.date}
                className="flex flex-1 items-center gap-2 rounded-xl bg-white px-3 py-2"
              >
                <Icon className={`h-5 w-5 shrink-0 ${meta.className}`} />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold capitalize text-zinc-700">
                    {label}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {d.tempMin}° / {d.tempMax}°
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
