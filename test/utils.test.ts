import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatTime, getWarningEndTime, isWarningExpired } from '../src/utils';
import type { DwdWarning, HomeAssistant, NinaWarning } from '../src/types';

const hass = (language = 'de', time_format = '24'): HomeAssistant =>
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

    expect(formatTime(warning, hass('en', '24'))).toContain('15:05');
    expect(formatTime(warning, hass('en', '12'))).toMatch(/3:05\s?PM/);
    expect(formatTime(warning, hass('de', '12'))).toMatch(/3:05\s?PM/);
    expect(formatTime(warning, hass('de', '24'))).toContain('15:05');
  });

  it('follows the language convention when the profile says language or system', () => {
    const start = at(2026, 9, 10, 15, 5);
    const warning = ninaWarning({ start: start.toISOString(), expires: undefined as unknown as string });

    for (const timeFormat of ['language', 'system']) {
      expect(formatTime(warning, hass('en', timeFormat))).toMatch(/3:05\s?PM/);
      expect(formatTime(warning, hass('de', timeFormat))).toContain('15:05');
    }
  });

  it('reports an unknown time instead of throwing when no start is given', () => {
    const warning = ninaWarning({ start: '', sent: undefined, expires: undefined as unknown as string });
    expect(formatTime(warning, hass())).toBe('Zeit unbekannt');
  });
});

describe('formatTime time zone', () => {
  const serverHass = (time_zone: string, serverZone: string): HomeAssistant =>
    ({
      language: 'en',
      locale: { language: 'en', number_format: 'comma_decimal', time_format: '24', time_zone },
      config: { time_zone: serverZone },
    }) as unknown as HomeAssistant;

  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // A zone whose offset to the browser zone is never zero, whatever the host runs in.
  const farZone = browserZone === 'Pacific/Kiritimati' ? 'Pacific/Pago_Pago' : 'Pacific/Kiritimati';

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats times in the server zone when the profile asks for it', () => {
    const warning = ninaWarning({ start: '2026-03-10T12:00:00Z', expires: undefined as unknown as string });
    vi.useFakeTimers({ now: new Date('2026-03-10T12:00:00Z') });

    expect(formatTime(warning, serverHass('server', 'Europe/Berlin'))).toContain('13:00');
    expect(formatTime(warning, serverHass('server', 'America/New_York'))).toContain('08:00');
  });

  it('keeps the browser zone for time_zone "local" and when unset', () => {
    const warning = ninaWarning({ start: '2026-03-10T12:00:00Z', expires: undefined as unknown as string });
    vi.useFakeTimers({ now: new Date('2026-03-10T12:00:00Z') });
    const expected = new Intl.DateTimeFormat('en', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).format(new Date('2026-03-10T12:00:00Z'));

    expect(formatTime(warning, serverHass('local', 'Asia/Tokyo'))).toContain(expected);
    expect(formatTime(warning, hass('en'))).toContain(expected);
  });

  it('falls back to the browser zone for a missing or invalid server zone', () => {
    const warning = ninaWarning({ start: '2026-03-10T12:00:00Z', expires: undefined as unknown as string });
    vi.useFakeTimers({ now: new Date('2026-03-10T12:00:00Z') });
    const reference = formatTime(warning, hass('en'));

    expect(formatTime(warning, serverHass('server', 'Not/AZone'))).toBe(reference);
    expect(formatTime(warning, serverHass('server', ''))).toBe(reference);
  });

  it('decides today and tomorrow by the server zone day boundary', () => {
    // 23:30 UTC on 10 March: still the 10th in London, already the 11th in Berlin.
    vi.useFakeTimers({ now: new Date('2026-03-10T23:30:00Z') });
    const warning = ninaWarning({ start: '2026-03-11T08:00:00Z', expires: undefined as unknown as string });

    // Berlin: now is 11 March 00:30, the warning is 11 March 09:00 -> today.
    expect(formatTime(warning, serverHass('server', 'Europe/Berlin'))).toMatch(/^Today/);
    // Kiritimati (UTC+14): now is 11 March 13:30, the warning 11 March 22:00 -> today.
    expect(formatTime(warning, serverHass('server', 'Pacific/Kiritimati'))).toMatch(/^Today/);
    // London (UTC+0): now is 10 March 23:30, the warning 11 March 08:00 -> tomorrow.
    expect(formatTime(warning, serverHass('server', 'Europe/London'))).toMatch(/^Tomorrow/);
    // Pago Pago (UTC-11): now is 10 March 12:30, the warning 10 March 21:00 -> today.
    expect(formatTime(warning, serverHass('server', 'Pacific/Pago_Pago'))).toMatch(/^Today/);
  });

  it('shows a different day label than the browser zone when the zones disagree', () => {
    // Same instant, two zones 14h-25h apart: the labels must follow the server zone
    // regardless of what zone this test runs in.
    vi.useFakeTimers({ now: new Date('2026-03-10T10:00:00Z') });
    const warning = ninaWarning({ start: '2026-03-10T10:00:00Z', expires: undefined as unknown as string });

    // Both "now" and the start use the same zone, so the label is always today.
    expect(formatTime(warning, serverHass('server', farZone))).toMatch(/^Today/);
    // A start 24h later is exactly one day on in any zone.
    const next = ninaWarning({ start: '2026-03-11T10:00:00Z', expires: undefined as unknown as string });
    expect(formatTime(next, serverHass('server', farZone))).toMatch(/^Tomorrow/);
  });
});
