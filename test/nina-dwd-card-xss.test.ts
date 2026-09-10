import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/nina-dwd-card';
import { NinaDwdCard } from '../src/nina-dwd-card';
import { HomeAssistant, NinaDwdCardConfig } from '../src/types';

vi.spyOn(console, 'info').mockImplementation(() => undefined);

const createMockHass = (): HomeAssistant =>
  ({
    localize: (key: string) => key,
    language: 'en',
    locale: { language: 'en', number_format: 'comma_decimal', time_format: '24' },
    states: {},
    entities: {},
    devices: {},
    callWS: vi.fn(),
    config: { time_zone: 'Europe/Berlin' },
  }) as unknown as HomeAssistant;

describe('NinaDwdCard XSS hardening', () => {
  let element: NinaDwdCard;
  let hass: HomeAssistant;
  let config: NinaDwdCardConfig;

  beforeEach(() => {
    hass = createMockHass();
    config = {
      type: 'custom:nina-dwd-card',
      nina_entity_prefix: 'binary_sensor.nina_warnung',
    };
    element = document.createElement('nina-dwd-card') as NinaDwdCard;
    document.body.appendChild(element);
  });

  it('does not render event handlers or javascript: links from warning text', async () => {
    hass.states['binary_sensor.nina_warnung_1'] = {
      state: 'on',
      attributes: {
        headline: 'XSS Test',
        description:
          'Take care <img src=x onerror="window.__xss = 1"> <a href="javascript:alert(1)">link</a><script>window.__xss = 1;</script>',
        instruction: 'Stay inside <img src=y onerror="window.__xssInstruction = 1">',
        sender: 'Test Sender',
        severity: 'Minor',
        start: new Date().toISOString(),
      },
    };
    element.hass = hass;
    element.setConfig(config);
    await element.updateComplete;

    const description = element.shadowRoot?.querySelector('.description');
    const instruction = element.shadowRoot?.querySelector('.instruction');

    expect(description?.innerHTML).not.toContain('onerror');
    expect(description?.innerHTML).not.toContain('javascript:');
    expect(description?.innerHTML).not.toContain('<script');
    const image = description?.querySelector('img');
    expect(image?.getAttribute('onerror')).toBeNull();
    expect(image ? [...image.attributes].map((a) => a.name) : []).toEqual(['src']);
    expect(description?.querySelector('a')?.getAttribute('href')).toBeNull();
    expect(description?.textContent).toContain('Take care');

    expect(instruction?.innerHTML).not.toContain('onerror');
    expect(instruction?.textContent).toContain('Stay inside');
  });

  it('keeps harmless formatting in warning text', async () => {
    hass.states['binary_sensor.nina_warnung_1'] = {
      state: 'on',
      attributes: {
        headline: 'Formatted Warning',
        description: 'Line one<br />Line <strong>two</strong>',
        sender: 'Test Sender',
        severity: 'Minor',
        start: new Date().toISOString(),
      },
    };
    element.hass = hass;
    element.setConfig(config);
    await element.updateComplete;

    const description = element.shadowRoot?.querySelector('.description');
    expect(description?.querySelector('strong')?.textContent).toBe('two');
    expect(description?.querySelector('br')).not.toBeNull();
  });
});
