/** Business-time calculations. All instants are UTC; schedules are local to the calendar. */
export type Interval = { start: number; end: number }; // minutes since local midnight
export type Calendar = {
  timeZone: string;
  weekly: Partial<Record<number, Interval[]>>; // Sunday = 0
  exceptions: Record<string, Interval[]>; // YYYY-MM-DD; [] closes the day
};
export type Pause = { start: string; end: string | null };

const minute = 60_000;
const maxMinutes = 5 * 366 * 24 * 60;

function formatter(calendar: Calendar) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: calendar.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

export function validateCalendar(calendar: Calendar) {
  formatter(calendar); // Reject unknown IANA time zones.
  const validateIntervals = (intervals: Interval[]) => {
    let previous = 0;
    for (const interval of intervals) {
      if (
        !Number.isInteger(interval.start) ||
        !Number.isInteger(interval.end) ||
        interval.start < previous ||
        interval.start < 0 ||
        interval.end > 1440 ||
        interval.start >= interval.end
      )
        throw new Error('Invalid or overlapping calendar intervals');
      previous = interval.end;
    }
  };
  for (const [day, intervals] of Object.entries(calendar.weekly)) {
    if (!/^[0-6]$/.test(day) || !Array.isArray(intervals)) throw new Error('Invalid weekday');
    validateIntervals(intervals);
  }
  for (const [date, intervals] of Object.entries(calendar.exceptions)) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
    )
      throw new Error('Invalid exception date');
    validateIntervals(intervals);
  }
}

function isWorking(at: number, calendar: Calendar, fmt: Intl.DateTimeFormat) {
  const parts = Object.fromEntries(fmt.formatToParts(at).map(({ type, value }) => [type, value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  const intervals = calendar.exceptions[date] ?? calendar.weekly[day] ?? [];
  const time = Number(parts.hour) * 60 + Number(parts.minute);
  return intervals.some(({ start, end }) => time >= start && time < end);
}

function instant(value: string) {
  const result = Date.parse(value);
  if (!Number.isFinite(result) || !/(Z|[+-]\d\d:\d\d)$/i.test(value))
    throw new Error('Expected an ISO instant with an offset');
  return result;
}

function pauseRanges(pauses: Pause[]) {
  const ranges = pauses.map((p) => ({
    start: instant(p.start),
    end: p.end ? instant(p.end) : Infinity,
  }));
  ranges.sort((a, b) => a.start - b.start);
  for (let i = 0; i < ranges.length; i++) {
    if (ranges[i].end <= ranges[i].start || (i && ranges[i].start < ranges[i - 1].end))
      throw new Error('Invalid or overlapping pause intervals');
  }
  return ranges;
}

/** Returns consumed milliseconds, excluding time outside the calendar and pauses. */
export function businessElapsed(
  calendar: Calendar,
  start: string,
  end: string,
  pauses: Pause[] = [],
) {
  validateCalendar(calendar);
  const from = instant(start),
    until = instant(end),
    ranges = pauseRanges(pauses);
  if (until < from || until - from > maxMinutes * minute) throw new Error('Invalid time range');
  const fmt = formatter(calendar);
  let result = 0;
  for (let cursor = from; cursor < until;) {
    const next = Math.min(until, Math.floor(cursor / minute + 1) * minute);
    if (isWorking(cursor, calendar, fmt)) {
      let active = next - cursor;
      for (const pause of ranges)
        active -= Math.max(0, Math.min(next, pause.end) - Math.max(cursor, pause.start));
      result += active;
    }
    cursor = next;
  }
  return result;
}

/** Project a deadline using recorded pauses. Future, unrecorded pauses are not assumed. */
export function businessDeadline(
  calendar: Calendar,
  start: string,
  durationMs: number,
  pauses: Pause[] = [],
): string | null {
  validateCalendar(calendar);
  if (!Number.isSafeInteger(durationMs) || durationMs < 0) throw new Error('Invalid duration');
  const fmt = formatter(calendar),
    ranges = pauseRanges(pauses);
  let cursor = instant(start),
    remaining = durationMs;
  const limit = cursor + maxMinutes * minute;
  while (remaining > 0 && cursor < limit) {
    const pause = ranges.find((p) => p.start <= cursor && p.end > cursor);
    if (pause?.end === Infinity) return null;
    if (pause) {
      cursor = Math.min(limit, pause.end);
      continue;
    }
    const upcomingPause = ranges.find((p) => p.start > cursor);
    const next = Math.min(
      limit,
      Math.floor(cursor / minute + 1) * minute,
      upcomingPause?.start ?? Infinity,
    );
    if (isWorking(cursor, calendar, fmt)) {
      const available = next - cursor;
      if (remaining <= available) return new Date(cursor + remaining).toISOString();
      remaining -= available;
    }
    cursor = next;
  }
  if (remaining) throw new Error('No deadline within the five-year calculation limit');
  return new Date(cursor).toISOString();
}

export type SlaSnapshot = {
  calendar: Calendar;
  targetMs: number;
  pauses: Pause[];
  startedAt: string;
  completedAt: string | null;
};

/** A snapshot embeds the calendar and target in force when the SLA was attached. */
export function evaluateSla(snapshot: SlaSnapshot, asOf: string) {
  const observed = instant(asOf),
    started = instant(snapshot.startedAt);
  if (observed < started) throw new Error('Observation precedes SLA start');
  const completed = snapshot.completedAt ? instant(snapshot.completedAt) : null;
  if (completed !== null && (completed < started || completed > observed))
    throw new Error('Invalid completion time');
  if (!Number.isSafeInteger(snapshot.targetMs) || snapshot.targetMs <= 0)
    throw new Error('Invalid target');
  const elapsedMs = businessElapsed(
    snapshot.calendar,
    snapshot.startedAt,
    new Date(completed ?? observed).toISOString(),
    snapshot.pauses,
  );
  const remainingMs = Math.max(0, snapshot.targetMs - elapsedMs);
  const paused =
    completed === null &&
    snapshot.pauses.some(
      (p) => instant(p.start) <= observed && (!p.end || instant(p.end) > observed),
    );
  const knownPauses = snapshot.pauses
    .filter((p) => instant(p.start) <= (completed ?? observed))
    .map((p) => ({
      start: p.start,
      end: p.end && instant(p.end) <= (completed ?? observed) ? p.end : null,
    }));
  return {
    elapsedMs,
    remainingMs,
    deadline: businessDeadline(
      snapshot.calendar,
      snapshot.startedAt,
      snapshot.targetMs,
      knownPauses,
    ),
    paused,
    status:
      completed !== null
        ? elapsedMs <= snapshot.targetMs
          ? 'fulfilled'
          : 'breached'
        : elapsedMs > snapshot.targetMs
          ? 'breached'
          : 'running',
  } as const;
}
