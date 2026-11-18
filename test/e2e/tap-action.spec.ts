import { test, expect } from './fixtures/hass';
import { removeState, setState, useDashboard } from './helpers/homeassistant';

const ENTITY = 'binary_sensor.e2e_tap_warning_1';

let urlPath: string;

test.beforeAll(async () => {
  await setState(ENTITY, 'on', {
    friendly_name: 'E2E Tap (E2E District - Testland) Warning 1',
    headline: 'Amtliche WARNUNG vor STURMBÖEN',
    description: 'Es treten Sturmböen um 70 km/h auf.',
    sender: 'Deutscher Wetterdienst',
    severity: 'Moderate',
    id: 'mow.de.e2e.tap.0001',
    start: new Date(Date.now() - 3_600_000).toISOString(),
    expires: new Date(Date.now() + 5 * 3_600_000).toISOString(),
  });

  // The pattern from issue #108: a Bubble Card popup opens on a hash.
  urlPath = await useDashboard('tap', {
    views: [
      {
        title: 'Warnings',
        cards: [
          {
            type: 'custom:nina-dwd-card',
            nina_entity_prefix: 'binary_sensor.e2e_tap_warning',
            tap_action: { action: 'navigate', navigation_path: '#warning-popup' },
          },
        ],
      },
    ],
  });
});

test.afterAll(async () => {
  await removeState(ENTITY);
});

test.describe('tap_action', () => {
  test('Home Assistant runs the action when the card is tapped', async ({ page, consoleErrors }) => {
    await page.goto(`/${urlPath}/0`);
    const card = page.locator('nina-dwd-card');
    await expect(card.locator('.headline')).toContainText('STURMBÖEN', { timeout: 60_000 });

    await card.locator('.headline').click();
    await expect(page).toHaveURL(new RegExp(`/${urlPath}/0#warning-popup$`));
    expect(consoleErrors).toEqual([]);
  });

  test('the info button still opens more-info instead', async ({ page }) => {
    await page.goto(`/${urlPath}/0`);
    const card = page.locator('nina-dwd-card');
    await expect(card.locator('.info-button')).toBeVisible({ timeout: 60_000 });

    await card.locator('.info-button').click();
    await expect(page.locator('ha-more-info-dialog')).toBeAttached();
    expect(page.url()).not.toContain('#warning-popup');
  });
});
