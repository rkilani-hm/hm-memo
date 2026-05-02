// =====================================================================
// Working-hours computation
// =====================================================================
//
// Given two timestamps, returns the elapsed time in hours that fall
// within the configured working schedule. Used by KPI reports to show
// approval response time net of weekends and after-hours.
//
// Default schedule (matches the Al Hamra / Kuwait default workweek):
//   - Workdays: Sunday through Thursday
//   - Working hours: 08:00 to 17:00 (9 hours, no lunch carve-out)
//   - No holiday calendar yet (a future enhancement could subtract
//     dates from a public_holidays table; this helper accepts an
//     optional excludeDates set so holiday support can be wired up
//     without changing the report code).
//
// Computation strategy
// --------------------
// Walk the timestamp range one calendar day at a time. For each day:
//   1. If it's not a workday → contributes 0.
//   2. If it's an excluded date (holiday) → contributes 0.
//   3. Otherwise, intersect [day-window, day-window-end] with the
//      [start, end] range and add the overlap in hours.
//
// This is straightforward and fast even for ranges spanning months.
// =====================================================================

export interface WorkingHoursConfig {
  /** Days that count as workdays. JS getDay() values: 0=Sun, 1=Mon, ..., 6=Sat. Default: Sun-Thu (0,1,2,3,4). */
  workdays: number[];
  /** Hour of day work starts (0-23). Default: 8. */
  startHour: number;
  /** Hour of day work ends (0-23, exclusive). Default: 17 (i.e. work runs 08:00 - 17:00). */
  endHour: number;
  /** Optional set of YYYY-MM-DD dates to exclude (holidays). Use the date in the local timezone. */
  excludeDates?: Set<string>;
}

export const DEFAULT_WORKING_HOURS: WorkingHoursConfig = {
  workdays: [0, 1, 2, 3, 4], // Sun-Thu
  startHour: 8,
  endHour: 17,
};

/** Format a Date as YYYY-MM-DD using local time (matching how holidays would be entered). */
function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Returns the number of working hours between two timestamps.
 * If end < start, returns 0.
 */
export function workingHoursBetween(
  startIso: string | Date,
  endIso: string | Date,
  config: WorkingHoursConfig = DEFAULT_WORKING_HOURS,
): number {
  const start = startIso instanceof Date ? startIso : new Date(startIso);
  const end = endIso instanceof Date ? endIso : new Date(endIso);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return 0;
  if (end <= start) return 0;

  const workdays = new Set(config.workdays);
  const startHourMs = config.startHour * 3_600_000;
  const endHourMs = config.endHour * 3_600_000;
  const dayLengthMs = endHourMs - startHourMs;

  let totalMs = 0;

  // Iterate calendar days from start's date through end's date.
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 0, 0, 0, 0);

  while (cursor.getTime() <= endDay.getTime()) {
    const dow = cursor.getDay();
    if (workdays.has(dow) && !(config.excludeDates?.has(localDateKey(cursor)))) {
      // Day's working window in absolute ms
      const dayStartMs = cursor.getTime() + startHourMs;
      const dayEndMs = cursor.getTime() + endHourMs;
      // Intersect with [start, end]
      const overlapStart = Math.max(dayStartMs, start.getTime());
      const overlapEnd = Math.min(dayEndMs, end.getTime());
      if (overlapEnd > overlapStart) {
        totalMs += overlapEnd - overlapStart;
      }
      // Sanity guard: never exceed the day's length on a single day
      // (defends against pathological clock-skew inputs).
      if (totalMs > 1e15) break;
    }
    // Advance one day
    cursor.setDate(cursor.getDate() + 1);
  }

  return totalMs / 3_600_000;
}

/**
 * Convenience formatter for working-hours values. Shows hours below a
 * working day, "working days" above. Treats one working day as
 * (endHour - startHour) hours.
 */
export function formatWorkingHours(h: number, config: WorkingHoursConfig = DEFAULT_WORKING_HOURS): string {
  if (!Number.isFinite(h) || h <= 0) return '—';
  const dayLen = config.endHour - config.startHour;
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < dayLen) return `${h.toFixed(1)}h`;
  const days = h / dayLen;
  return `${days.toFixed(1)}wd`; // wd = working days
}
