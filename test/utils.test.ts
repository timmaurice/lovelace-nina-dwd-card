import { describe, expect, it } from 'vitest';
import { formatTime, getWarningEndTime, isWarningExpired } from '../src/utils';
import type { DwdWarning, HomeAssistant, NinaWarning } from '../src/types';

const hass = (language = 'de', time_format = 'twenty_four'): HomeAssistant =>
  ({
    language,
    locale: { language, number_format: 'comma_decimal', time_format },
  }) as unknown as HomeAssistant;

const ninaWarning = (overrides: Partial<NinaWarning> = {}): NinaWarning =>
  ({
    headline: 'Amtliche WARNUNG vor STURM',
    description: 'Es treten Sturmböen auf.',
    sender: 'Deutscher Wetterdienst',
    entity_id: 'binary_sensor.nina_warnung_1',
    severity: 'Severe',
    start: new Date().toISOString(),
    expires: new Date(Date.now() + 3_600_000).toISOString(),
    ...overrides,
  }) as NinaWarning;

const dwdWarning = (overrides: Partial<DwdWarning> = {}): DwdWarning =>
  ({
    headline: 'Amtliche WARNUNG vor FROST',
    entity_id: 'sensor.berlin_current_warning_level',
    level: 2,
    start: new Date().toISOString(),
    end: new Date(Date.now() + 3_600_000).toISOString(),
    ...overrides,
  }) as DwdWarning;

const at = (year: number, month: number, day: number, hour = 12, minute = 0): Date =>
  new Date(year, month - 1, day, hour, minute);

describe('getWarningEndTime', () => {
  it('reads `expires` from a NINA warning and `end` from a DWD warning', () => {
    const expires = '2026-09-11T10:00:00.000Z';
    const end = '2026-09-12T10:00:00.000Z';

    expect(getWarningEndTime(ninaWarning({ expires }))).toBe(new Date(expires).getTime());
    expect(getWarningEndTime(dwdWarning({ end }))).toBe(new Date(end).getTime());
  });

  it('reports no end time for a missing, empty or unparsable value', () => {
    expect(getWarningEndTime(ninaWarning({ expires: undefined as unknown as string }))).toBeUndefined();
    expect(getWarningEndTime(ninaWarning({ expires: '   ' }))).toBeUndefined();
    expect(getWarningEndTime(ninaWarning({ expires: 'not a date' }))).toBeUndefined();
  });
});

describe('isWarningExpired', () => {
  const now = Date.parse('2026-09-10T19:35:00.000Z');

  it('counts a warning that ended in the past as expired', () => {
    expect(isWarningExpired(ninaWarning({ expires: '2026-09-10T17:35:00.000Z' }), now)).toBe(true);
    expect(isWarningExpired(dwdWarning({ end: '2026-09-10T17:35:00.000Z' }), now)).toBe(true);
  });

  it('keeps a running warning and one without a known end time', () => {
    expect(isWarningExpired(ninaWarning({ expires: '2026-09-10T21:35:00.000Z' }), now)).toBe(false);
    expect(isWarningExpired(ninaWarning({ expires: undefined as unknown as string }), now)).toBe(false);
    expect(isWarningExpired(ninaWarning({ expires: 'not a date' }), now)).toBe(false);
  });
});

describe('formatTime', () => {
  it('names today, yesterday and tomorrow instead of a weekday', () => {
    const start = new Date();
    start.setHours(10, 32, 0, 0);

    expect(
      formatTime(ninaWarning({ start: start.toISOString(), expires: undefined as unknown as string }), hass()),
    ).toContain('Heute');
  });

  it('uses the bare weekday inside the current week', () => {
    const threeDaysOn = new Date(Date.now() + 3 * 24 * 3_600_000);
    threeDaysOn.setHours(10, 32, 0, 0);

    const formatted = formatTime(
      ninaWarning({ start: threeDaysOn.toISOString(), expires: undefined as unknown as string }),
      hass(),
    );

    // A weekday and a time only - no day and month.
    expect(formatted).toMatch(/^[^,]+, \d{1,2}:\d{2}$/);
  });

  it('adds the date once the weekday name is ambiguous', () => {
    // Weekday names repeat every seven days, so five days ahead carries the
    // same name as two days ago.
    const fiveDaysOn = new Date(Date.now() + 5 * 24 * 3_600_000);
    fiveDaysOn.setHours(10, 32, 0, 0);

    const formatted = formatTime(
      ninaWarning({ start: fiveDaysOn.toISOString(), expires: undefined as unknown as string }),
      hass(),
    );

    expect(formatted).not.toMatch(/^[^,]+, \d{1,2}:\d{2}$/);
    expect(formatted).toContain(String(fiveDaysOn.getDate()));
  });

  it('adds the date for a warning older than a week', () => {
    // The finding: a warning sent in March showed as "Mi, 10:32" and read as if
    // it had happened this week.
    const longAgo = new Date(Date.now() - 60 * 24 * 3_600_000);
    longAgo.setHours(10, 32, 0, 0);

    const formatted = formatTime(
      ninaWarning({ start: longAgo.toISOString(), expires: undefined as unknown as string }),
      hass(),
    );

    // Weekday, day and month, then the time: "Mi., 12.7., 10:32".
    expect(formatted).not.toMatch(/^[^,]+, \d{1,2}:\d{2}$/);
    expect(formatted).toContain(String(longAgo.getDate()));
    expect(formatted).toContain(String(longAgo.getMonth() + 1));
  });

  it('adds the year when the date is in another year', () => {
    const start = at(new Date().getFullYear() - 2, 3, 4, 10, 32);

    const formatted = formatTime(
      ninaWarning({ start: start.toISOString(), expires: undefined as unknown as string }),
      hass(),
    );

    expect(formatted).toContain(String(new Date().getFullYear() - 2));
  });

  it('honours the 12h/24h preference of the Home Assistant profile', () => {
    const start = at(2026, 9, 10, 15, 5);
    const warning = ninaWarning({ start: start.toISOString(), expires: undefined as unknown as string });

    expect(formatTime(warning, hass('en', 'twenty_four'))).toContain('15:05');
    expect(formatTime(warning, hass('en', 'am_pm')).toLowerCase()).toContain('3:05');
  });

  it('reports an unknown time instead of throwing when no start is given', () => {
    const warning = ninaWarning({ start: '', sent: undefined, expires: undefined as unknown as string });
    expect(formatTime(warning, hass())).toBe('Zeit unbekannt');
  });
});
