import { test, expect } from './fixtures/hass';
import { removeState, setState, useDashboard } from './helpers/homeassistant';

const ENTITY = 'binary_sensor.e2e_seen_warning_1';

let urlPath: string;

test.beforeAll(async () => {
  await setState(ENTITY, 'on', {
    friendly_name: 'E2E Seen (E2E District - Testland) Warning 1',
    headline: 'Amtliche WARNUNG vor STURMBÖEN',
    description: 'Es treten Sturmböen um 70 km/h auf.',
    sender: 'Deutscher Wetterdienst',
    severity: 'Moderate',
    id: 'mow.de.e2e.seen.0001',
    start: new Date(Date.now() - 3_600_000).toISOString(),
    expires: new Date(Date.now() + 5 * 3_600_000).toISOString(),
  });
  urlPath = await useDashboard('seen', {
    views: [
      {
        title: 'Warnings',
        cards: [{ type: 'custom:nina-dwd-card', nina_entity_prefix: 'binary_sensor.e2e_seen_warning' }],
      },
    ],
  });
});

test.afterAll(async () => {
  await removeState(ENTITY);
});

test('a warning marked as seen stays one line after a reload and unfolds on a tap', async ({ page }) => {
  await page.goto(`/${urlPath}/0`);
  const card = page.locator('nina-dwd-card');
  await expect(card.locator('.description')).toContainText('70 km/h', { timeout: 60_000 });

  await card.locator('.seen-button').click();
  await expect(card.locator('.seen-line')).toContainText('STURMBÖEN');
  await expect(card.locator('.description')).toHaveCount(0);

  await page.reload();
  await expect(card.locator('.seen-line')).toBeVisible({ timeout: 60_000 });
  await expect(card.locator('.description')).toHaveCount(0);

  await card.locator('.seen-line').click();
  await expect(card.locator('.description')).toContainText('70 km/h');
});
