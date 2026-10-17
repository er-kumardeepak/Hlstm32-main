/** Formatting helpers shared across pages. */

export function time(t: string | Date): string {
  const d = typeof t === "string" ? new Date(t) : t;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function dateTime(t: string | Date): string {
  const d = typeof t === "string" ? new Date(t) : t;
  return d.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function secondsAgo(t: string | Date | null): string {
  if (!t) return "never";
  const s = Math.max(0, Math.floor((Date.now() - new Date(t).getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s} seconds ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m > 1 ? "s" : ""} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
  return `${Math.floor(h / 24)} day(s) ago`;
}

/** Format watt values nicely: 712 -> 712 W, 1084 -> 1.08 kW */
export function watts(p: number | null | undefined): string {
  if (p === null || p === undefined) return "—";
  if (Math.abs(p) >= 1000) return `${(p / 1000).toFixed(2)} kW`;
  return `${p.toFixed(0)} W`;
}

export function num(n: number | null | undefined, unit: string, digits = 1): string {
  if (n === null || n === undefined) return "—";
  return `${n.toFixed(digits)} ${unit}`;
}
