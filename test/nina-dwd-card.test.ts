import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/nina-dwd-card';
import type { NinaDwdCard } from '../src/nina-dwd-card';
import { HomeAssistant, NinaDwdCardConfig, HaCard } from '../src/types';

// Mock console.info
vi.spyOn(console, 'info').mockImplementation(() => undefined);

const createMockHass = (): HomeAssistant =>
  ({
    localize: (key: string, placeholders?: Record<string, string>) => {
      if (key === 'card.source' && placeholders?.sender) {
        return `Source: ${placeholders.sender}`;
      }
      return key;
    },
    language: 'en',
    locale: { language: 'en', number_format: 'comma_decimal', time_format: '24' },
    states: {},
    entities: {},
    devices: {},
    callWS: vi.fn(),
  }) as unknown as HomeAssistant;

describe('NinaDwdCard', () => {
  let element: NinaDwdCard;
  let hass: HomeAssistant;
  let config: NinaDwdCardConfig;

  beforeEach(() => {
    hass = createMockHass();

    config = {
      type: 'custom:nina-dwd-card',
      nina_entity_prefix: 'binary_sensor.nina_warnung',
      dwd_device: 'mock-dwd-device',
    };

    element = document.createElement('nina-dwd-card') as NinaDwdCard;
    document.body.appendChild(element);
  });

  afterEach(() => {
    document.body.removeChild(element);
    vi.clearAllMocks();
  });

  describe('Initialization and Configuration', () => {
    it('should create the component instance', () => {
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.tagName.toLowerCase()).toBe('nina-dwd-card');
    });

    it('should throw an error if no entities are provided', () => {
      expect(() => element.setConfig({ type: 'custom:nina-dwd-card' })).toThrow(
        'You need to define at least one NINA or DWD entity.',
      );
    });
  });

  describe('Rendering', () => {
    it('should render a title if provided', async () => {
      config.title = 'Current Warnings';
      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;
      const card = element.shadowRoot?.querySelector<HaCard>('ha-card');
      expect(card?.header).toBe('Current Warnings');
    });

    it('should render "No Warnings" when no entities are on', async () => {
      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;
      const noWarnings = element.shadowRoot?.querySelector('.no-warnings');
      expect(noWarnings).not.toBeNull();
      expect(noWarnings?.textContent).toBe('No Warnings');
    });

    it('should not render anything when hide_when_no_warnings is true and there are no warnings', async () => {
      config.hide_when_no_warnings = true;
      // The default config has no active warnings
      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;
      // The card itself should be empty
      expect(element.shadowRoot?.querySelector('ha-card')).toBeNull();
    });

    it('should render with reduced opacity in edit mode when it would otherwise be hidden', async () => {
      config.hide_when_no_warnings = true;
      element.editMode = true; // Set edit mode directly

      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;

      const card = element.shadowRoot?.querySelector<HaCard>('ha-card');
      expect(card).not.toBeNull();
      expect(card?.style.opacity).toBe('0.5');
    });

    it('should render a NINA warning', async () => {
      hass.states['binary_sensor.nina_warnung_1'] = {
        state: 'on',
        attributes: {
          headline: 'NINA Test Warning',
          description: 'This is a test.',
          sender: 'Test Sender',
          severity: 'Minor',
          start: new Date().toISOString(),
        },
      };
      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;
      const warning = element.shadowRoot?.querySelector('.warning');
      expect(warning).not.toBeNull();
      expect(warning?.querySelector('.headline')?.textContent?.trim()).toBe('NINA Test Warning');
      expect(warning?.querySelector('.sender')?.textContent?.trim()).toBe('Source: Test Sender');
    });

    it('should render a DWD warning', async () => {
      hass.entities['sensor.berlin_current_warning_level'] = {
        entity_id: 'sensor.berlin_current_warning_level',
        device_id: 'mock-dwd-device',
      };
      hass.states['sensor.berlin_current_warning_level'] = {
        state: '1',
        attributes: {
          warning_count: 1,
          warning_1_headline: 'DWD Test Warning',
          warning_1_description: 'This is a DWD test.',
          warning_1_level: 2,
          warning_1_start: new Date().toISOString(),
        },
      };
      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;
      const warning = element.shadowRoot?.querySelector('.warning');
      expect(warning).not.toBeNull();
      expect(warning?.querySelector('.headline')?.textContent?.trim()).toBe('DWD Test Warning');
      expect(warning?.querySelector('.sender')?.textContent?.trim()).toBe('Source: Deutscher Wetterdienst');
    });

    it('should render the DWD map when configured', async () => {
      config.dwd_map_land = 'hes';
      // A DWD warning must be active for the map to be rendered.
      hass.entities['sensor.berlin_current_warning_level'] = {
        entity_id: 'sensor.berlin_current_warning_level',
        device_id: 'mock-dwd-device',
      };
      hass.states['sensor.berlin_current_warning_level'] = {
        state: '1',
        attributes: {
          warning_1_headline: 'DWD Map Test Warning',
          warning_1_start: new Date().toISOString(),
        },
      };
      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;

      const mapImage = element.shadowRoot?.querySelector<HTMLImageElement>('.map-image');
      expect(mapImage).not.toBeNull();
      expect(mapImage?.src).toContain('warnungen_gemeinde_map_hes.png');
    });

    it('should render instruction accordion when available', async () => {
      hass.states['binary_sensor.nina_warnung_1'] = {
        state: 'on',
        attributes: {
          headline: 'NINA Test Warning',
          description: 'This is a test.',
          sender: 'Test Sender',
          severity: 'Minor',
          start: new Date().toISOString(),
          instruction: 'Stay inside.',
        },
      };
      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;

      const expansionPanel = element.shadowRoot?.querySelector('ha-expansion-panel');
      expect(expansionPanel).not.toBeNull();
      expect(expansionPanel?.textContent).toContain('Stay inside.');
    });
  });

  describe('Filtering and Deduplication', () => {
    it('should filter NINA warnings from DWD if a DWD device is active', async () => {
      // NINA warning from DWD
      hass.states['binary_sensor.nina_warnung_1'] = {
        state: 'on',
        attributes: {
          headline: 'NINA-DWD Test Warning',
          sender: 'Deutscher Wetterdienst',
          start: new Date().toISOString(),
        },
      };
      // An active DWD warning
      hass.entities['sensor.berlin_current_warning_level'] = {
        entity_id: 'sensor.berlin_current_warning_level',
        device_id: 'mock-dwd-device',
      };
      hass.states['sensor.berlin_current_warning_level'] = {
        state: '1',
        attributes: { warning_1_headline: 'DWD Test Warning', warning_1_start: new Date().toISOString() },
      };

      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;

      const warnings = element.shadowRoot?.querySelectorAll('.warning');
      expect(warnings?.length).toBe(1);
      expect(warnings?.[0].querySelector('.headline')?.textContent).toContain('DWD Test Warning');
    });

    it('should deduplicate identical warnings, prioritizing NINA', async () => {
      const startTime = new Date().toISOString();
      // NINA warning
      hass.states['binary_sensor.nina_warnung_1'] = {
        state: 'on',
        attributes: { headline: 'STURMBÖEN', sender: 'Civil Protection', start: startTime },
      };
      // DWD warning (duplicate)
      hass.entities['sensor.berlin_current_warning_level'] = { device_id: 'mock-dwd-device' };
      hass.states['sensor.berlin_current_warning_level'] = {
        state: '1',
        attributes: { warning_1_headline: 'STURMBÖEN', warning_1_start: startTime },
      };

      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;

      const warnings = element.shadowRoot?.querySelectorAll('.warning');
      expect(warnings?.length).toBe(1);
      expect(warnings?.[0].querySelector('.sender')?.textContent).toContain('Civil Protection');
    });
  });

  describe('Sorting', () => {
    it('should sort warnings by severity', async () => {
      // Minor NINA warning
      hass.states['binary_sensor.nina_warnung_1'] = {
        state: 'on',
        attributes: { headline: 'Minor Warning', severity: 'Minor', start: new Date().toISOString() },
      };
      // Severe DWD warning
      hass.entities['sensor.berlin_current_warning_level'] = {
        entity_id: 'sensor.berlin_current_warning_level',
        device_id: 'mock-dwd-device',
      };
      hass.states['sensor.berlin_current_warning_level'] = {
        state: '1',
        attributes: {
          warning_1_headline: 'Severe Warning',
          warning_1_level: 3,
          warning_1_start: new Date().toISOString(),
        },
      };
      // Extreme NINA warning
      hass.states['binary_sensor.nina_warnung_2'] = {
        state: 'on',
        attributes: { headline: 'Extreme Warning', severity: 'Extreme', start: new Date().toISOString() },
      };

      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;

      const headlines = element.shadowRoot?.querySelectorAll('.headline');
      expect(headlines?.[0].textContent?.trim()).toBe('Extreme Warning');
      expect(headlines?.[1].textContent?.trim()).toBe('Severe Warning');
      expect(headlines?.[2].textContent?.trim()).toBe('Minor Warning');
    });
  });
});
