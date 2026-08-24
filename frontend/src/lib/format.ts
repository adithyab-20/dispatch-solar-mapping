// Generic value formatters shared across the UI. These are pure presentation
// helpers with no knowledge of the site domain — they turn numbers, coordinate
// pairs, and ISO instants into the exact strings the artboards call for.

/** en-US grouped number with a fixed number of decimals, matching the artboards. */
export function fmt(value: number, decimals = 0): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** "33.43620, -112.12790", or null unless both coordinates are present. */
export function formatCoordinates(
  latitude: number | null,
  longitude: number | null,
): string | null {
  if (latitude === null || longitude === null) return null;
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * A stored ISO instant as a readable, unambiguous UTC stamp
 * ("23 Aug 2026, 19:04 UTC"). UTC keeps it deterministic regardless of where it
 * is read. Returns null when there is no timestamp.
 */
export function formatTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCDate()} ${SHORT_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`
  );
}
