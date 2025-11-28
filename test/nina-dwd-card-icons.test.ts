import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/nina-dwd-card';
import { NinaDwdCard } from '../src/nina-dwd-card';
import { HomeAssistant, NinaDwdCardConfig } from '../src/types';

// Mock console.info
vi.spyOn(console, 'info').mockImplementation(() => undefined);

const createMockHass = (): HomeAssistant =>
  ({
    localize: (key: string, placeholders?: Record<string, string>) => {
      if (key === 'card.source' && placeholders?.sender) {
        return `Source: ${placeholders.sender}`;
      }
      if (key === 'card.no_warnings') {
        return 'No Warnings';
      }
      return key; // Return key for other unhandled cases
    },
    language: 'en',
    locale: { language: 'en', number_format: 'comma_decimal', time_format: '24' },
    states: {},
    entities: {},
    devices: {},
    callWS: vi.fn(),
    config: {
      latitude: 52.52,
      longitude: 13.4,
      elevation: 34,
      unit_system: {
        length: 'km',
        mass: 'kg',
        temperature: '°C',
        volume: 'L',
      },
      location_name: 'Home',
      time_zone: 'Europe/Berlin',
      components: [],
      version: '2024.1.0',
      whitelist_external_dirs: [],
    },
  }) as unknown as HomeAssistant;

describe('NinaDwdCard Icons', () => {
  let element: NinaDwdCard;
  let hass: HomeAssistant;
  let config: NinaDwdCardConfig;

  beforeEach(() => {
    hass = createMockHass();

    config = {
      type: 'custom:nina-dwd-card',
      dwd_device: 'mock-dwd-device',
    };

    element = document.createElement('nina-dwd-card') as NinaDwdCard;
    document.body.appendChild(element);
  });

  afterEach(() => {
    document.body.removeChild(element);
    vi.clearAllMocks();
  });

  it('should render correct icon for DWD warning with event code', async () => {
    hass.entities['sensor.berlin_current_warning_level'] = {
      entity_id: 'sensor.berlin_current_warning_level',
      device_id: 'mock-dwd-device',
    };
    hass.states['sensor.berlin_current_warning_level'] = {
      state: '1',
      attributes: {
        warning_count: 1,
        warning_1_headline: 'Thunderstorm',
        warning_1_description: 'Heavy thunderstorm.',
        warning_1_level: 2,
        warning_1_start: new Date().toISOString(),
        warning_1_type: 31, // Thunderstorm event code
      },
    };
    element.hass = hass;
    element.setConfig(config);
    await element.updateComplete;
    const warning = element.shadowRoot?.querySelector('.warning');
    expect(warning).not.toBeNull();
    const icon = warning?.querySelector('ha-icon');
    expect(icon?.getAttribute('icon')).toBe('mdi:weather-lightning');
  });

  it('should fallback to default icon if event code is missing', async () => {
    hass.entities['sensor.berlin_current_warning_level'] = {
      entity_id: 'sensor.berlin_current_warning_level',
      device_id: 'mock-dwd-device',
    };
    hass.states['sensor.berlin_current_warning_level'] = {
      state: '1',
      attributes: {
        warning_count: 1,
        warning_1_headline: 'Unknown Warning',
        warning_1_description: 'Something happened.',
        warning_1_level: 2,
        warning_1_start: new Date().toISOString(),
        // No event code
      },
    };
    element.hass = hass;
    element.setConfig(config);
    await element.updateComplete;
    const warning = element.shadowRoot?.querySelector('.warning');
    expect(warning).not.toBeNull();
    const icon = warning?.querySelector('ha-icon');
    expect(icon?.getAttribute('icon')).toBe('mdi:alert-circle-outline');
  });

  it('should fallback to default icon if event code is not mapped', async () => {
    hass.entities['sensor.berlin_current_warning_level'] = {
      entity_id: 'sensor.berlin_current_warning_level',
      device_id: 'mock-dwd-device',
    };
    hass.states['sensor.berlin_current_warning_level'] = {
      state: '1',
      attributes: {
        warning_count: 1,
        warning_1_headline: 'Rare Warning',
        warning_1_description: 'Rare event.',
        warning_1_level: 2,
        warning_1_start: new Date().toISOString(),
        warning_1_type: 999, // Unmapped event code
      },
    };
    element.hass = hass;
    element.setConfig(config);
    await element.updateComplete;
    const warning = element.shadowRoot?.querySelector('.warning');
    expect(warning).not.toBeNull();
    const icon = warning?.querySelector('ha-icon');
    expect(icon?.getAttribute('icon')).toBe('mdi:alert-circle-outline');
  });
});
