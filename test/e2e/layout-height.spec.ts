import { test, expect } from './fixtures/hass';
import { removeState, setState, useDashboard } from './helpers/homeassistant';

const PREFIX = 'binary_sensor.e2e_height_warning';
const ENTITIES = [1, 2, 3].map((n) => `${PREFIX}_${n}`);

let urlPath: string;

test.beforeAll(async () => {
  for (const [i, entity] of ENTITIES.entries()) {
    await setState(entity, 'on', {
      friendly_name: `E2E Height (E2E District - Testland) Warning ${i + 1}`,
      headline: `Amtliche WARNUNG vor STURM ${i + 1}`,
      description: 'Es treten Sturmböen mit Geschwindigkeiten um 70 km/h aus südwestlicher Richtung auf.',
      instruction: 'Achten Sie besonders auf herabstürzende Äste.',
      sender: 'Deutscher Wetterdienst',
      severity: 'Moderate',
      id: `mow.de.e2e.height.000${i + 1}`,
      start: new Date(Date.now() - 3_600_000).toISOString(),
      expires: new Date(Date.now() + 5 * 3_600_000).toISOString(),
    });
  }

  // Three warnings need far more than four rows.
  urlPath = await useDashboard('height', {
    views: [
      {
        title: 'Warnings',
        type: 'sections',
        sections: [
          {
            type: 'grid',
            cards: [
              {
                type: 'custom:nina-dwd-card',
                title: 'Fixed height',
                nina_entity_prefix: PREFIX,
                grid_options: { rows: 4 },
              },
              { type: 'markdown', content: 'below the card' },
            ],
          },
        ],
      },
    ],
  });
});

test.afterAll(async () => {
  for (const entity of ENTITIES) await removeState(entity);
});

test('a height from the Layout tab keeps the card in its cell and lets it scroll', async ({ page }) => {
  await page.goto(`/${urlPath}/0`);
  const card = page.locator('nina-dwd-card');
  await expect(card.locator('.headline')).toHaveCount(3, { timeout: 60_000 });

  const cardBox = (await card.locator('ha-card').boundingBox())!;
  const below = (await page.locator('hui-markdown-card ha-card').boundingBox())!;
  expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(below.y);

  const content = card.locator('.card-content');
  const { scrollHeight, clientHeight } = await content.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(scrollHeight).toBeGreaterThan(clientHeight);
  // The title stays put while the warnings scroll with the mouse wheel.
  await content.hover();
  await page.mouse.wheel(0, 2000);
  await expect.poll(() => content.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(card.locator('.card-header')).toBeInViewport();
  await expect(card.locator('.info-button').last()).toBeInViewport();
});
