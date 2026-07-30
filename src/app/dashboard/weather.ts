// Club home: Sainte-Soulle (Charente-Maritime), near La Rochelle.
const CLUB_LATITUDE = 46.18851;
const CLUB_LONGITUDE = -1.01588;

export type WeatherCategory =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "storm";

export type DailyWeather = {
  date: string;
  category: WeatherCategory;
  tempMax: number;
  tempMin: number;
  precipitationProbability: number;
};

export type ClubWeather = {
  currentTemp: number;
  currentCategory: WeatherCategory;
  daily: DailyWeather[];
};

function categoryFromCode(code: number): WeatherCategory {
  if (code === 0) return "clear";
  if (code === 1 || code === 2) return "partly-cloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code === 95 || code === 96 || code === 99) return "storm";
  return "cloudy";
}

export async function fetchClubWeather(): Promise<ClubWeather | null> {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(CLUB_LATITUDE));
    url.searchParams.set("longitude", String(CLUB_LONGITUDE));
    url.searchParams.set("current", "temperature_2m,weather_code");
    url.searchParams.set(
      "daily",
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
    );
    url.searchParams.set("timezone", "Europe/Paris");
    url.searchParams.set("forecast_days", "16");

    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) return null;

    const data = await res.json();
    const dailyTimes: string[] = data?.daily?.time ?? [];
    const dailyCodes: number[] = data?.daily?.weather_code ?? [];
    const dailyMax: number[] = data?.daily?.temperature_2m_max ?? [];
    const dailyMin: number[] = data?.daily?.temperature_2m_min ?? [];
    const dailyPrecip: number[] = data?.daily?.precipitation_probability_max ?? [];

    const daily: DailyWeather[] = dailyTimes.map((date, i) => ({
      date,
      category: categoryFromCode(dailyCodes[i]),
      tempMax: Math.round(dailyMax[i]),
      tempMin: Math.round(dailyMin[i]),
      precipitationProbability: dailyPrecip[i] ?? 0,
    }));

    if (typeof data?.current?.temperature_2m !== "number") return null;

    return {
      currentTemp: Math.round(data.current.temperature_2m),
      currentCategory: categoryFromCode(data.current.weather_code),
      daily,
    };
  } catch {
    return null;
  }
}

// Open-Meteo's `daily.time` values are plain Europe/Paris calendar dates
// (per the `timezone` param passed to the API). To match them exactly we
// must derive the reference weekend from the Paris calendar day, not from
// whatever timezone the Node process happens to run in — mixing local-time
// arithmetic with `.toISOString()` shifts the result by a day whenever the
// server's ambient offset isn't UTC+0.
function parisYmd(iso: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

function parisWeekdayIndex(iso: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    weekday: "short",
  }).format(new Date(iso));
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

function utcMsToIsoDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

// Given any reference date (typically the next match's start_time), returns
// the [saturday, sunday] ISO dates of that same week — matches are almost
// always played on a weekend, so this is the window worth forecasting.
export function weekendIsoDatesFor(referenceIso: string): [string, string] {
  const { y, m, d } = parisYmd(referenceIso);
  const weekday = parisWeekdayIndex(referenceIso); // 0=Sun..6=Sat
  const mondayOffsetDays = weekday === 0 ? -6 : 1 - weekday;
  const dayMs = 24 * 60 * 60 * 1000;
  const mondayMs = Date.UTC(y, m - 1, d) + mondayOffsetDays * dayMs;
  return [utcMsToIsoDate(mondayMs + 5 * dayMs), utcMsToIsoDate(mondayMs + 6 * dayMs)];
}
