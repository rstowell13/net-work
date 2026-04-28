/**
 * ISO 8601 week math, user-timezone aware.
 *
 * Weeks start Monday. Week 1 of an ISO year is the one containing the
 * year's first Thursday. The plan demo runs in user's local tz; we compute
 * year/week as a plain pair the DB unique-index can rely on.
 */

export interface IsoWeek {
  isoYear: number;
  isoWeek: number;
}

/**
 * Convert a Date to {isoYear, isoWeek} in the given IANA timezone.
 * If tz omitted, uses the runtime default.
 */
export function isoWeekOf(d: Date, tz?: string): IsoWeek {
  // Pull Y/M/D in the target tz so DST/midnight rollover doesn't drift the
  // week by one. Intl is the only sane way without pulling a tz lib.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.format(d).split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const day = Number(parts[2]);
  // ISO: shift to nearest Thursday in the same week, year of that Thursday
  // = ISO year. Use UTC arithmetic (day-only) — no tz subtleties left here.
  const utc = new Date(Date.UTC(y, m - 1, day));
  const dow = utc.getUTCDay() || 7; // Mon=1..Sun=7
  utc.setUTCDate(utc.getUTCDate() + 4 - dow);
  const isoYear = utc.getUTCFullYear();
  const jan1 = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(
    ((utc.getTime() - jan1.getTime()) / 86400_000 + 1) / 7,
  );
  return { isoYear, isoWeek };
}

/** Inclusive Monday/Sunday boundaries (UTC) for a given iso week pair. */
export function isoWeekBoundsUTC(w: IsoWeek): { start: Date; end: Date } {
  // Jan 4 is always in week 1.
  const jan4 = new Date(Date.UTC(w.isoYear, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - (jan4Dow - 1));
  const start = new Date(week1Mon);
  start.setUTCDate(start.getUTCDate() + (w.isoWeek - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

export function formatRangeShort(w: IsoWeek): string {
  const { start, end } = isoWeekBoundsUTC(w);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}, ${w.isoYear}`;
}
