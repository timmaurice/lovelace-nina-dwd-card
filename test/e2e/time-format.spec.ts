import { test, expect } from './fixtures/hass';
import { callWebsocket, removeState, setState, useDashboard } from './helpers/homeassistant';

const PREFIX = 'binary_sensor.e2e_time_format_warning';
const ENTITY = `${PREFIX}_1`;

/**
 * The 12h/24h choice in the Home Assistant profile is stored as '12' or '24',
 * the values of the frontend's TimeFormat enum, not its member names 'am_pm'
 * and 'twenty_four'. The card compared against the names, and the unit test
 * used the same wrong strings, so it passed while the setting never applied
 * (#77). Only a real frontend hands the card the values HA actually stores.
 */
const STORM = {
  headline: 'Amtliche WARNUNG vor STURMBOEEN',
  description: 'Es treten Sturmböen um 70 km/h auf.',
  sender: 'Deutscher Wetterdienst',
  severity: 'Moderate',
  id: 'mow.de.e2e.timeformat.0001',
};

/**
 * Tomorrow at the given local time. Past noon, so a 12-hour and a 24-hour
 * clock read differently, and in the future, so the warning has not expired.
 */
const tomorrowAt = (hours: number, minutes: number) => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
};

const TWELVE_HOUR = /3:05\s?PM\s*-\s*9:05\s?PM/;
const TWENTY_FOUR_HOUR = /15:05\s*-\s*21:05/;

const CASES = [
  { language: 'en', timeFormat: '24', expected: TWENTY_FOUR_HOUR },
  { language: 'en', timeFormat: '12', expected: TWELVE_HOUR },
  { language: 'en', timeFormat: 'language', expected: TWELVE_HOUR },
  { language: 'de', timeFormat: '12', expected: TWELVE_HOUR },
  { language: 'de', timeFormat: '24', expected: TWENTY_FOUR_HOUR },
  { language: 'de', timeFormat: 'language', expected: TWENTY_FOUR_HOUR },
];

/** The profile settings live in the user's frontend data under `language`. */
const setProfile = (language: string, timeFormat: string) =>
  callWebsocket({
    type: 'frontend/set_user_data',
    key: 'language',
    value: {
      language,
      number_format: 'language',
      time_format: timeFormat,
      date_format: 'language',
      time_zone: 'local',
      first_weekday: 'language',
    },
  });

let urlPath: string;
// The suite signs in as the same user someone clicks around with by hand, so
// their profile settings are put back afterwards.
let savedProfile: unknown;

test.beforeAll(async () => {
  savedProfile = (await callWebsocket<{ value: unknown }>({ type: 'frontend/get_user_data', key: 'language' })).value;

  await setState(ENTITY, 'on', {
    friendly_name: 'E2E Time (E2E District - Testland) Warning 1',
    ...STORM,
    start: tomorrowAt(15, 5),
    expires: tomorrowAt(21, 5),
    sent: tomorrowAt(15, 5),
  });

  urlPath = await useDashboard('time-format', {
    views: [{ title: 'Warnings', cards: [{ type: 'custom:nina-dwd-card', nina_entity_prefix: PREFIX }] }],
  });
});

test.afterAll(async () => {
  await removeState(ENTITY);
  await callWebsocket({ type: 'frontend/set_user_data', key: 'language', value: savedProfile ?? null });
});

// Serial: every test rewrites the one profile they all share.
test.describe.serial('The time format from the Home Assistant profile', () => {
  for (const { language, timeFormat, expected } of CASES) {
    test(`${language} with time format ${timeFormat}`, async ({ page, consoleErrors }) => {
      await setProfile(language, timeFormat);
      await page.goto(`/${urlPath}/0`);

      const card = page.locator('nina-dwd-card');
      await expect(card.locator('.headline')).toHaveCount(1, { timeout: 60_000 });
      // Without this, the 'language' cases would also pass on a frontend that
      // never picked up the profile at all.
      await expect
        .poll(() =>
          page.evaluate(() => {
            const root = document.querySelector('home-assistant') as { hass?: { locale?: { time_format?: string } } };
            return root?.hass?.locale?.time_format;
          }),
        )
        .toBe(timeFormat);
      await expect(card.locator('ha-card')).toContainText(expected);
      expect(consoleErrors).toEqual([]);
    });
  }
});
