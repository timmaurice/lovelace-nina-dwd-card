import { test, expect } from './fixtures/hass';
import { removeState, setState, useDashboard } from './helpers/homeassistant';

const PREFIX = 'binary_sensor.e2e_headline_warning';
const ENTITIES = [`${PREFIX}_1`, `${PREFIX}_2`, `${PREFIX}_3`];

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

/**
 * A warning without a `headline` attribute is not hypothetical: NINA relays
 * sender-authored alerts, and some carry only a description. Reading that
 * missing value as a string used to throw inside render(), and Lit then left
 * the whole card blank - every other warning with it. Nothing but a browser
 * shows that: the element is still in the DOM, there is no failed assertion,
 * the card is simply empty.
 */
const WITH_HEADLINE = {
  headline: 'Amtliche WARNUNG vor SCHWEREM GEWITTER',
  description: 'Es treten Gewitter mit Sturmböen um 85 km/h auf.',
  sender: 'Deutscher Wetterdienst',
  severity: 'Severe',
  id: 'mow.de.e2e.headline.0001',
};

const NO_HEADLINE = {
  // No `headline` key at all - exactly how the entity arrives.
  description: 'Einrichtung von Schutzzonen zur Bekämpfung der Afrikanischen Schweinepest.',
  sender: 'DE-HE-KB-W195',
  severity: 'Minor',
  id: 'mow.de.e2e.headline.0002',
};

const THIRD = {
  headline: 'Amtliche WARNUNG vor HOCHWASSER',
  description: 'Die Pegel steigen weiter an.',
  sender: 'Landeshochwasserzentrum',
  severity: 'Moderate',
  id: 'mow.de.e2e.headline.0003',
};

let urlPath: string;

test.beforeAll(async () => {
  const common = { start: hoursFromNow(-2), expires: hoursFromNow(6), sent: hoursFromNow(-2) };
  await setState(ENTITIES[0], 'on', {
    friendly_name: 'E2E Headline (E2E District - Testland) Warning 1',
    ...WITH_HEADLINE,
    ...common,
  });
  await setState(ENTITIES[1], 'on', {
    friendly_name: 'E2E Headline (E2E District - Testland) Warning 2',
    ...NO_HEADLINE,
    ...common,
  });
  await setState(ENTITIES[2], 'on', {
    friendly_name: 'E2E Headline (E2E District - Testland) Warning 3',
    ...THIRD,
    ...common,
  });

  urlPath = await useDashboard('missing-headline', {
    views: [
      {
        title: 'Warnings',
        cards: [
          {
            type: 'custom:nina-dwd-card',
            title: 'E2E missing headline',
            nina_entity_prefix: PREFIX,
          },
        ],
      },
    ],
  });
});

test.afterAll(async () => {
  for (const entity of ENTITIES) await removeState(entity);
});

test.describe('A warning without a headline', () => {
  test('does not blank the card: every warning still renders', async ({ page, consoleErrors }) => {
    await page.goto(`/${urlPath}/0`);

    const card = page.locator('nina-dwd-card');
    await expect(card.locator('ha-card')).toBeVisible({ timeout: 60_000 });

    // The point of the test: the two well-formed warnings survive the malformed
    // one standing between them.
    await expect(card.locator('.headline')).toHaveCount(3);
    await expect(card.locator('.headline')).toContainText([/SCHWEREM GEWITTER/, /HOCHWASSER/, /Schweinepest/]);

    // The headline-less warning falls back to its description rather than
    // disappearing.
    await expect(card.locator('.headline').last()).toContainText('Schutzzonen');
    await expect(card.locator('.no-warnings')).toHaveCount(0);

    expect(consoleErrors).toEqual([]);
  });
});
