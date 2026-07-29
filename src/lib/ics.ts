export type IcsEvent = {
  uid: string;
  summary: string | null;
  location: string | null;
  start: string;
  end: string | null;
};

function unfold(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function parseIcsDate(value: string): string {
  const m = value.match(
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/
  );
  if (!m) return new Date(value).toISOString();
  const [, y, mo, d, h = "00", mi = "00", s = "00", z] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${z ? "Z" : ""}`;
  return new Date(iso).toISOString();
}

export function parseIcs(raw: string): IcsEvent[] {
  const text = unfold(raw);
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const events: IcsEvent[] = [];
  let current: Record<string, string> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current && current.DTSTART) {
        events.push({
          uid: current.UID ?? `${current.DTSTART}-${current.SUMMARY ?? ""}`,
          summary: current.SUMMARY ?? null,
          location: current.LOCATION ?? null,
          start: parseIcsDate(current.DTSTART),
          end: current.DTEND ? parseIcsDate(current.DTEND) : null,
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const rawKey = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const key = rawKey.split(";")[0].toUpperCase();
    current[key] = value.replace(/\\,/g, ",").replace(/\\n/gi, " ");
  }

  return events;
}
