import { describe, expect, it } from 'vitest';
import { businessDeadline, businessElapsed, evaluateSla, type Calendar } from './sla.js';

const bogota: Calendar = {
  timeZone: 'America/Bogota',
  weekly: Object.fromEntries([1, 2, 3, 4, 5].map((day) => [day, [{ start: 540, end: 1020 }]])),
  exceptions: { '2026-01-05': [] },
};

describe('business SLA time', () => {
  it('crosses a weekend and a holiday in the calendar time zone', () => {
    const start = '2026-01-02T21:00:00.000Z'; // Friday 16:00
    const deadline = businessDeadline(bogota, start, 2 * 60 * 60 * 1000);
    expect(deadline).toBe('2026-01-06T15:00:00.000Z'); // Tuesday 10:00
    expect(businessElapsed(bogota, start, deadline!)).toBe(2 * 60 * 60 * 1000);
  });

  it('subtracts only the working portion of pauses, including an open pause', () => {
    expect(
      businessElapsed(bogota, '2026-01-02T20:30:00Z', '2026-01-06T16:00:00Z', [
        { start: '2026-01-02T21:30:00Z', end: '2026-01-06T14:30:00Z' },
        { start: '2026-01-06T15:00:00Z', end: null },
      ]),
    ).toBe(90 * 60 * 1000);
  });

  it('honors changes in daylight saving time instead of assuming a fixed offset', () => {
    const ny: Calendar = {
      timeZone: 'America/New_York',
      weekly: { 0: [{ start: 60, end: 240 }] },
      exceptions: {},
    };
    const start = '2026-03-08T06:00:00Z'; // 01:00, spring-forward day
    expect(businessElapsed(ny, start, '2026-03-08T08:00:00Z')).toBe(2 * 60 * 60 * 1000);
    expect(businessDeadline(ny, start, 2 * 60 * 60 * 1000)).toBe('2026-03-08T08:00:00.000Z');
  });

  it('counts both occurrences of a repeated hour on the autumn transition', () => {
    const ny: Calendar = {
      timeZone: 'America/New_York',
      weekly: { 0: [{ start: 60, end: 120 }] },
      exceptions: {},
    };
    expect(businessElapsed(ny, '2026-11-01T05:00:00Z', '2026-11-01T07:00:00Z')).toBe(
      2 * 60 * 60 * 1000,
    );
  });

  it('projects deadlines across recorded pauses and reports an open pause', () => {
    const start = '2026-01-02T20:00:00Z';
    const pause = { start: '2026-01-02T20:30:00Z', end: '2026-01-02T21:00:00Z' };
    expect(businessDeadline(bogota, start, 60 * 60 * 1000, [pause])).toBe(
      '2026-01-02T21:30:00.000Z',
    );
    const snapshot = {
      calendar: bogota,
      targetMs: 60 * 60 * 1000,
      startedAt: start,
      completedAt: null,
      pauses: [{ ...pause, end: null }],
    };
    expect(evaluateSla(snapshot, '2026-01-02T21:00:00Z')).toMatchObject({
      elapsedMs: 30 * 60 * 1000,
      remainingMs: 30 * 60 * 1000,
      deadline: null,
      paused: true,
      status: 'running',
    });
    expect(
      evaluateSla(
        { ...snapshot, pauses: [pause], completedAt: '2026-01-02T22:00:00Z' },
        '2026-01-02T22:00:00Z',
      ).status,
    ).toBe('breached');
  });

  it('rejects invalid calendars, time ranges and overlapping pauses', () => {
    expect(() =>
      businessElapsed(
        { ...bogota, timeZone: 'Invalid/Zone' },
        '2026-01-01T00:00:00Z',
        '2026-01-02T00:00:00Z',
      ),
    ).toThrow();
    expect(() =>
      businessElapsed(
        { ...bogota, weekly: { 1: [{ start: 600, end: 500 }] } },
        '2026-01-01T00:00:00Z',
        '2026-01-02T00:00:00Z',
      ),
    ).toThrow();
    expect(() =>
      businessElapsed(bogota, '2026-01-02T20:00:00Z', '2026-01-02T22:00:00Z', [
        { start: '2026-01-02T20:00:00Z', end: '2026-01-02T21:00:00Z' },
        { start: '2026-01-02T20:30:00Z', end: null },
      ]),
    ).toThrow();
  });
});
