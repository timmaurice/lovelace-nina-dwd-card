import { test, expect } from './fixtures/hass';
import { resources, useDashboard } from './helpers/homeassistant';

const BUNDLE = 'nina-dwd-card.js';

test.describe('Lovelace resource registration', () => {
  test('has exactly one resource for the card bundle', async () => {
    // This repository ships no integration, so the resource is declared by hand
    // in test-env/config/configuration.yaml. Two of them load the bundle twice,
    // and the second customElements.define() throws.
    const ours = (await resources()).filter((resource) => resource.url.split('?')[0].endsWith(`/${BUNDLE}`));

    expect(ours).toHaveLength(1);
    expect(ours[0].url).toBe('/local/dist/nina-dwd-card.js');
  });

  test('serves the bundle and defines card and editor without a clash', async ({ page, consoleErrors }) => {
    const urlPath = await useDashboard('resources', { views: [{ title: 'Empty', cards: [] }] });

    await page.goto(`/${urlPath}/0`);
    await page.waitForFunction(() => customElements.get('nina-dwd-card') !== undefined, {
      timeout: 60_000,
    });

    // The editor is a separate element in the same bundle: asking the card for
    // its config element is what opening the editor does, and it is where a
    // duplicate define() would blow up.
    await page.evaluate(async () => {
      const constructor = customElements.get('nina-dwd-card') as unknown as {
        getConfigElement(): Promise<HTMLElement>;
      };
      await constructor.getConfigElement();
    });
    await expect.poll(() => page.evaluate(() => !!customElements.get('nina-dwd-card-editor'))).toBe(true);

    expect(consoleErrors.filter((text) => /has already been used/i.test(text))).toEqual([]);
  });
});
