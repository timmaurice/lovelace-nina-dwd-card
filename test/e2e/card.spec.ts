import { test, expect } from './fixtures/hass';
import { removeState, setState, useDashboard } from './helpers/homeassistant';

const PREFIX = 'binary_sensor.e2e_card_warning';
const ENTITIES = [`${PREFIX}_1`, `${PREFIX}_2`, `${PREFIX}_3`];

/**
 * The attribute names below are the ones the NINA integration really puts on a
 * warning binary sensor - the same set `test-env/config/configuration.yaml`
 * mocks from live payloads. Inventing keys here would produce a card that
 * renders nothing while the test still looked plausible.
 */
const STORM = {
  headline: 'Amtliche WARNUNG vor SCHWEREM GEWITTER',
  description: 'Es treten Gewitter mit Sturmb&ouml;en um 85 km/h auf.',
  sender: 'Deutscher Wetterdienst',
  severity: 'Severe',
  instruction: 'Bringen Sie Gegenstände im Freien in Sicherheit.',
  id: 'mow.de.e2e.card.0001',
};

const FLOOD = {
  headline: 'Amtliche WARNUNG vor HOCHWASSER',
  description: 'Die Pegel steigen weiter an.',
  sender: 'Landeshochwasserzentrum',
  severity: 'Moderate',
  instruction: 'Meiden Sie Uferbereiche.',
  id: 'mow.de.e2e.card.0002',
};

/**
 * A warning the integration still reports as `on` although it ended two hours
 * ago - NINA polls every five minutes, so this is the normal state of things
 * for a while after a warning ends.
 */
const EXPIRED = {
  headline: 'Amtliche WARNUNG vor GLAETTE',
  description: 'Es tritt gebietsweise Glätte auf.',
  sender: 'Deutscher Wetterdienst',
  severity: 'Minor',
  id: 'mow.de.e2e.card.0003',
};

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

let urlPath: string;

test.beforeAll(async () => {
  await setState(ENTITIES[0], 'on', {
    friendly_name: 'E2E Town (E2E District - Testland) Warning 1',
    ...STORM,
    start: hoursFromNow(-1),
    expires: hoursFromNow(5),
    sent: hoursFromNow(-1),
  });
  await setState(ENTITIES[1], 'on', {
    friendly_name: 'E2E Town (E2E District - Testland) Warning 2',
    ...FLOOD,
    start: hoursFromNow(-2),
    expires: hoursFromNow(8),
    sent: hoursFromNow(-2),
  });

  await setState(ENTITIES[2], 'on', {
    friendly_name: 'E2E Town (E2E District - Testland) Warning 3',
    ...EXPIRED,
    start: hoursFromNow(-8),
    expires: hoursFromNow(-2),
    sent: hoursFromNow(-8),
  });

  urlPath = await useDashboard('card', {
    views: [
      {
        title: 'Warnings',
        cards: [
          {
            type: 'custom:nina-dwd-card',
            title: 'E2E warnings',
            nina_entity_prefix: PREFIX,
          },
        ],
      },
      { title: 'Elsewhere', cards: [{ type: 'markdown', content: 'nothing here' }] },
    ],
  });
});

test.afterAll(async () => {
  for (const entity of ENTITIES) await removeState(entity);
});

test.describe('The card on a real dashboard', () => {
  test('renders the warnings the NINA sensors report', async ({ page, consoleErrors }) => {
    await page.goto(`/${urlPath}/0`);

    // Assert on what the card paints, not on the custom element itself: the
    // host has no box of its own, so Playwright rightly calls it hidden.
    const card = page.locator('nina-dwd-card');
    await expect(card.locator('ha-card')).toBeVisible({ timeout: 60_000 });
    await expect(card.locator('.headline')).toHaveCount(2);
    await expect(card.locator('.headline').first()).toContainText('SCHWEREM GEWITTER');
    await expect(card.locator('.headline').nth(1)).toContainText('HOCHWASSER');
    // The description is HTML from the source feed and is sanitised, not escaped.
    await expect(card.locator('.description').first()).toContainText('Sturmböen um 85 km/h');
    await expect(card.locator('.no-warnings')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('leaves out a warning that has already ended', async ({ page }) => {
    await page.goto(`/${urlPath}/0`);

    const card = page.locator('nina-dwd-card');
    await expect(card.locator('.headline')).toHaveCount(2, { timeout: 60_000 });
    // The sensor is still `on`, the warning ended two hours ago.
    await expect(card.locator('.headline', { hasText: 'GLAETTE' })).toHaveCount(0);
  });

  test('comes back after leaving the view and returning', async ({ page }) => {
    // Views are torn out of the DOM on a switch. A card that does not notice it
    // is visible again comes back empty, and no unit test sees that.
    await page.goto(`/${urlPath}/0`);
    const headlines = page.locator('nina-dwd-card').locator('.headline');
    await expect(headlines).toHaveCount(2, { timeout: 60_000 });

    await page.getByRole('tab', { name: 'Elsewhere' }).click();
    await expect(page.locator('nina-dwd-card')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Warnings' }).click();
    await expect(headlines).toHaveCount(2, { timeout: 30_000 });
    await expect(headlines.first()).toContainText('SCHWEREM GEWITTER');
  });
});
