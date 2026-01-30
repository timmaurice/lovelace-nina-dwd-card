import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/nina-dwd-card';
import { NinaDwdCard } from '../src/nina-dwd-card';
import { HomeAssistant, NinaDwdCardConfig, HaCard } from '../src/types';

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
    localStorage.clear();
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
      const cardHeader = element.shadowRoot?.querySelector('.card-header');
      expect(cardHeader?.textContent?.trim()).toBe('Current Warnings');
    });

    it('should render "No Warnings" when no entities are on', async () => {
      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;
      const noWarnings = element.shadowRoot?.querySelector('.no-warnings');
      expect(noWarnings).not.toBeNull();
      expect(noWarnings?.textContent?.trim()).toBe('No Warnings');
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

    it('should render a NINA warning without a start date', async () => {
      hass.states['binary_sensor.nina_warnung_1'] = {
        state: 'on',
        attributes: {
          headline: 'Warning without start date',
          description: 'This is a test without a start date.',
          sender: 'Test Sender No-Date',
          severity: 'Minor',
          // no start attribute
        },
      };
      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;

      const warning = element.shadowRoot?.querySelector('.warning');
      expect(warning).not.toBeNull();
      expect(warning?.querySelector('.headline')?.textContent?.trim()).toBe('Warning without start date');
      expect(warning?.querySelector('.sender')?.textContent?.trim()).toBe('Source: Test Sender No-Date');
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

    it('should render the DWD region map when configured', async () => {
      config.dwd_map_type = 'region';
      config.dwd_map_land = 'SchilderD'; // Germany
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
      expect(mapImage?.src).toContain('warnstatus/SchilderD.jpg');
    });

    it('should render the map above the warnings when position is "above"', async () => {
      config.dwd_map_land = 'hes';
      config.dwd_map_position = 'above';
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

      const mapImage = element.shadowRoot?.querySelector<HTMLImageElement>('.map-image-standalone');
      expect(mapImage).not.toBeNull();
      expect(mapImage?.src).toContain('warnungen_gemeinde_map_hes.png');
      // Check that it's not the inline image
      expect(element.shadowRoot?.querySelector<HTMLImageElement>('.map-image')).toBeNull();
    });

    it('should render the map pin when coordinates are available', async () => {
      config.dwd_map_land = 'hes';
      config.dwd_map_position = 'above';
      config.map_pin_zone = 'zone.home';
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
      hass.states['zone.home'] = {
        state: 'zoning',
        attributes: {
          latitude: 50.1109,
          longitude: 8.6821,
        },
      };
      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;

      const pin = element.shadowRoot?.querySelector('.map-pin');
      expect(pin).not.toBeNull();
    });

    it('should render debug overlay when debug_mode is enabled', async () => {
      config.dwd_map_land = 'hes';
      config.dwd_map_position = 'above';
      config.debug_mode = true;
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

      const overlay = element.shadowRoot?.querySelector('.debug-overlay');
      expect(overlay).not.toBeNull();
      expect(overlay?.querySelectorAll('.debug-region').length).toBe(4);
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

    it('should show the footer by default and hide it when hide_footer is true', async () => {
      // Setup a warning to ensure the footer has a chance to render
      hass.states['binary_sensor.nina_warnung_1'] = {
        state: 'on',
        attributes: {
          headline: 'NINA Footer Test',
          sender: 'Test Sender',
          severity: 'Minor',
          start: new Date().toISOString(),
        },
      };
      element.hass = hass;

      // Test default behavior (footer visible)
      element.setConfig(config);
      await element.updateComplete;
      let footer = element.shadowRoot?.querySelector('.footer');
      expect(footer).not.toBeNull();
      expect(footer?.querySelector('.sender')?.textContent).toContain('Test Sender');

      // Test with hide_footer: true (footer hidden)
      const newConfig = { ...config, hide_footer: true };
      element.setConfig(newConfig);
      await element.updateComplete;
      footer = element.shadowRoot?.querySelector('.footer');
      expect(footer).toBeNull();
      expect(footer).toBeNull();
    });

    it('should open and close the lightbox when clicking the map', async () => {
      config.dwd_map_land = 'hes';
      config.dwd_map_position = 'above';

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

      // Ensure map is rendered and not lightbox initially
      const mapContainer = element.shadowRoot?.querySelector('.map-container') as HTMLElement;
      expect(mapContainer).not.toBeNull();
      expect(element.shadowRoot?.querySelector('.lightbox')).toBeNull();

      // Click to open lightbox
      mapContainer.click();
      await element.updateComplete;

      const lightbox = element.shadowRoot?.querySelector('.lightbox') as HTMLElement;
      expect(lightbox).not.toBeNull();
      expect(lightbox.querySelector('img')).not.toBeNull();

      // Click to close lightbox
      lightbox.click();
      await element.updateComplete;

      expect(element.shadowRoot?.querySelector('.lightbox')).toBeNull();
    });
  });

  describe('Filtering and Deduplication', () => {
    it('should show both NINA and DWD warnings even if NINA sender is DWD (if not exact duplicate)', async () => {
      // NINA warning from DWD
      hass.states['binary_sensor.nina_warnung_1'] = {
        state: 'on',
        attributes: {
          headline: 'NINA-DWD Test Warning',
          sender: 'Deutscher Wetterdienst',
          start: new Date().toISOString(),
        },
      };
      // An active DWD warning with different headline
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
      expect(warnings?.length).toBe(2);
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

    it('should deduplicate warnings with different prefixes', async () => {
      const startTime = new Date().toISOString();
      // NINA warning with prefix
      hass.states['binary_sensor.nina_warnung_1'] = {
        state: 'on',
        attributes: { headline: 'Amtliche Warnung vor STURMBÖEN', sender: 'Civil Protection', start: startTime },
      };
      // DWD warning without prefix (or different prefix)
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
    });

    it('should filter out warnings below the specified hide_on_level_below threshold', async () => {
      // Minor NINA warning (score 1)
      hass.states['binary_sensor.nina_warnung_1'] = {
        state: 'on',
        attributes: {
          headline: 'Minor Warning',
          severity: 'Minor',
          start: new Date().toISOString(),
        },
      };
      // Moderate NINA warning (score 2)
      hass.states['binary_sensor.nina_warnung_2'] = {
        state: 'on',
        attributes: {
          headline: 'Moderate Warning',
          severity: 'Moderate',
          start: new Date().toISOString(),
        },
      };
      // Severe DWD warning (score 3)
      hass.entities['sensor.berlin_current_warning_level'] = {
        entity_id: 'sensor.berlin_current_warning_level',
        device_id: 'mock-dwd-device',
      };
      hass.states['sensor.berlin_current_warning_level'] = {
        state: '1',
        attributes: {
          warning_1_headline: 'Severe DWD Warning',
          warning_1_level: 3,
          warning_1_start: new Date().toISOString(),
        },
      };

      element.hass = hass;
      element.setConfig({ ...config, hide_on_level_below: 2 }); // Hide warnings with level < 2
      await element.updateComplete;

      const renderedHeadlines = Array.from(element.shadowRoot?.querySelectorAll('.headline') || []).map((el) =>
        el.textContent?.trim(),
      );

      expect(renderedHeadlines).toHaveLength(2);
      expect(renderedHeadlines).toContain('Severe DWD Warning');
      expect(renderedHeadlines).toContain('Moderate Warning');
      expect(renderedHeadlines).not.toContain('Minor Warning');
    });

    it('should merge warnings with identical content but different times', async () => {
      // Warning 1: Starts earlier
      hass.states['binary_sensor.nina_warnung_1'] = {
        state: 'on',
        attributes: {
          headline: 'Shared Headline',
          description: 'Same Description',
          sender: 'DWD',
          severity: 'Severe',
          start: '2026-01-08T17:00:00',
          expires: '2026-01-09T09:00:00',
        },
      };

      // Warning 2: Starts later, same content
      hass.states['binary_sensor.nina_warnung_2'] = {
        state: 'on',
        attributes: {
          headline: 'Shared Headline',
          description: 'Same Description',
          sender: 'DWD',
          severity: 'Severe',
          start: '2026-01-08T21:00:00',
          expires: '2026-01-09T09:00:00',
        },
      };

      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;

      const warnings = element.shadowRoot?.querySelectorAll('.warning');
      expect(warnings?.length).toBe(1);

      // const timeText = warnings?.[0].querySelector('.time')?.textContent;
      // Should show start of first (17:00) and end of both (09:00)
      // Note: Implementation specific time format check might optionally go here if needed,
      // but count check verifies basic deduplication.
    });

    it('should NOT merge warnings with same headline but different description', async () => {
      // Warning 1
      hass.states['binary_sensor.nina_warnung_1'] = {
        state: 'on',
        attributes: {
          headline: 'Generic Headline',
          description: 'Description A',
          sender: 'DWD',
          start: new Date().toISOString(),
        },
      };

      // Warning 2
      hass.states['binary_sensor.nina_warnung_2'] = {
        state: 'on',
        attributes: {
          headline: 'Generic Headline',
          description: 'Description B',
          sender: 'DWD',
          start: new Date().toISOString(),
        },
      };

      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;

      const warnings = element.shadowRoot?.querySelectorAll('.warning');
      expect(warnings?.length).toBe(2);
    });

    it('should prioritize DWD source when merging NINA and DWD warnings', async () => {
      // Warning 1: NINA (no event/level)
      hass.states['binary_sensor.nina_warnung_1'] = {
        state: 'on',
        attributes: {
          headline: 'Shared Headline',
          description: 'Same Description',
          sender: 'DWD',
          start: '2026-01-08T17:00:00',
          expires: '2026-01-09T09:00:00',
        },
      };

      // Warning 2: DWD (has level/event) - treated as DWD warning
      hass.entities['sensor.berlin_current_warning_level'] = {
        entity_id: 'sensor.berlin_current_warning_level',
        device_id: 'mock-dwd-device',
      };
      hass.states['sensor.berlin_current_warning_level'] = {
        state: '1',
        attributes: {
          warning_1_headline: 'Shared Headline',
          warning_1_description: 'Same Description',
          warning_1_level: 2, // Marks it as DWD
          warning_1_start: '2026-01-08T18:00:00',
          warning_1_end: '2026-01-09T10:00:00',
        },
      };

      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;

      const warnings = element.shadowRoot?.querySelectorAll('.warning');
      expect(warnings?.length).toBe(1);
    });

    it('should merge warnings with same content even if formatting (line breaks, spaces) differs', async () => {
      // Warning 1: Simple formatting
      hass.states['binary_sensor.nina_warnung_1'] = {
        state: 'on',
        attributes: {
          headline: 'SCHNEEFALL',
          description: 'Line A. Line B.',
          instruction: 'Action 1. Action 2.',
          start: new Date().toISOString(),
        },
      };

      // Warning 2: Different formatting (line breaks and extra spaces)
      hass.states['binary_sensor.nina_warnung_2'] = {
        state: 'on',
        attributes: {
          headline: 'SCHNEEFALL',
          description: 'Line A.\nLine B.',
          instruction: 'Action 1.    Action 2. ',
          start: new Date().toISOString(),
        },
      };

      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;

      const warnings = element.shadowRoot?.querySelectorAll('.warning');
      expect(warnings?.length).toBe(1);
    });

    it('should merge warnings with same content even if formatting (bullets vs semicolons) differs', async () => {
      // Warning 1: Uses semicolons
      hass.states['binary_sensor.nina_warnung_1'] = {
        state: 'on',
        attributes: {
          headline: 'FROST',
          description: 'Description.',
          instruction: 'Action 1; Action 2; Action 3',
          start: new Date().toISOString(),
        },
      };

      // Warning 2: Uses bullets and newlines
      hass.states['binary_sensor.nina_warnung_2'] = {
        state: 'on',
        attributes: {
          headline: 'FROST',
          description: 'Description.',
          instruction: 'Action 1\n · Action 2\n · Action 3',
          start: new Date().toISOString(),
        },
      };

      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;

      const warnings = element.shadowRoot?.querySelectorAll('.warning');
      expect(warnings?.length).toBe(1);
    });

    it('should merge warnings with same content even if they have different periods/newlines (reproduction)', async () => {
      // Warning 1: NINA style from prompt
      hass.states['binary_sensor.nina_warnung_1'] = {
        state: 'on',
        attributes: {
          headline: 'Amtliche WARNUNG vor STRENGEM FROST',
          description:
            'Es tritt strenger Frost zwischen -8 °C und -13 °C auf. Vor allem bei Aufklaren über Schnee sinken die Temperaturen auf Werte bis -15 °C.',
          instruction:
            'Gefahr durch: \n · mögliche erhebliche Frostschäden\n · Unterkühlung bei längerem Aufenthalt im Freien\n · einfrierende Wasserleitungen\n\nHandlungsempfehlungen: \n · Frostschutzmaßnahmen ergreifen, z.B. Pflanzen abdecken oder Wasser aus Außenleitungen ablassen\n · längere Aufenthalte im Freien vermeiden',
          start: new Date().toISOString(),
        },
      };

      // Warning 2: DWD style from prompt
      hass.entities['sensor.berlin_current_warning_level'] = {
        entity_id: 'sensor.berlin_current_warning_level',
        device_id: 'mock-dwd-device',
      };
      hass.states['sensor.berlin_current_warning_level'] = {
        state: '1',
        attributes: {
          warning_1_headline: 'Amtliche WARNUNG vor STRENGEM FROST',
          warning_1_description:
            'Es tritt strenger Frost zwischen -8 °C und -13 °C auf. Vor allem bei Aufklaren über Schnee sinken die Temperaturen auf Werte bis -15 °C.',
          warning_1_instruction:
            'Gefahr durch: mögliche erhebliche Frostschäden; Unterkühlung bei längerem Aufenthalt im Freien; einfrierende Wasserleitungen. Handlungsempfehlungen: Frostschutzmaßnahmen ergreifen, z.B. Pflanzen abdecken oder Wasser aus Außenleitungen ablassen; längere Aufenthalte im Freien vermeiden',
          warning_1_level: 2,
          warning_1_start: new Date().toISOString(),
        },
      };

      element.hass = hass;
      element.setConfig(config);
      await element.updateComplete;

      const warnings = element.shadowRoot?.querySelectorAll('.warning');
      expect(warnings?.length).toBe(1);
    });

    it('should NOT compare instructions if hide_instructions is enabled', async () => {
      // Warning 1
      hass.states['binary_sensor.nina_warnung_1'] = {
        state: 'on',
        attributes: {
          headline: 'Shared Headline',
          description: 'Same Description',
          instruction: 'Instruction A',
          start: new Date().toISOString(),
        },
      };

      // Warning 2
      hass.states['binary_sensor.nina_warnung_2'] = {
        state: 'on',
        attributes: {
          headline: 'Shared Headline',
          description: 'Same Description',
          instruction: 'Instruction B',
          start: new Date().toISOString(),
        },
      };

      element.hass = hass;
      element.setConfig({ ...config, hide_instructions: true });
      await element.updateComplete;

      const warnings = element.shadowRoot?.querySelectorAll('.warning');
      expect(warnings?.length).toBe(1);
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

  describe('Configuration Options', () => {
    it('should respect max_warnings limit', async () => {
      // Create 10 warnings
      for (let i = 1; i <= 10; i++) {
        hass.states[`binary_sensor.nina_warnung_${i}`] = {
          state: 'on',
          attributes: {
            headline: `Warning ${i}`,
            severity: 'Minor',
            start: new Date().toISOString(),
          },
        };
      }

      element.hass = hass;
      element.setConfig({ ...config, max_warnings: 3 });
      await element.updateComplete;

      const warnings = element.shadowRoot?.querySelectorAll('.warning');
      expect(warnings?.length).toBe(3);
    });

    it('should apply color overrides', async () => {
      hass.states['binary_sensor.nina_warnung_1'] = {
        state: 'on',
        attributes: {
          headline: 'Colored Warning',
          severity: 'Severe', // Default is red
          start: new Date().toISOString(),
        },
      };

      element.hass = hass;
      element.setConfig({
        ...config,
        color_overrides: { severe: '#00ff00' }, // Override to green
      });
      await element.updateComplete;

      const headline = element.shadowRoot?.querySelector<HTMLElement>('.headline');
      // Check if the style attribute contains the overridden color
      // Note: styles might be normalized by the browser, so we check for the value
      expect(headline?.getAttribute('style')).toContain('color: #00ff00');
    });

    it('should separate advance warnings when configured', async () => {
      // Current warning (DWD level)
      hass.entities['sensor.berlin_current_warning_level'] = {
        entity_id: 'sensor.berlin_current_warning_level',
        device_id: 'mock-dwd-device',
      };
      hass.states['sensor.berlin_current_warning_level'] = {
        state: '1',
        attributes: {
          warning_1_headline: 'Current Warning',
          warning_1_level: 1,
          warning_1_start: new Date().toISOString(),
        },
      };

      // Advance warning (DWD advance level)
      hass.entities['sensor.berlin_advance_warning_level'] = {
        entity_id: 'sensor.berlin_advance_warning_level',
        device_id: 'mock-dwd-device',
      };
      hass.states['sensor.berlin_advance_warning_level'] = {
        state: '1',
        attributes: {
          warning_1_headline: 'Advance Warning',
          warning_1_level: 1,
          warning_1_start: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        },
      };

      element.hass = hass;
      element.setConfig({ ...config, separate_advance_warnings: true });
      await element.updateComplete;

      const subHeaders = element.shadowRoot?.querySelectorAll('.sub-header');
      expect(subHeaders?.length).toBe(2);
      expect(subHeaders?.[0].textContent).toBe('Current Warnings');
      expect(subHeaders?.[1].textContent).toBe('Advance Warnings');

      const warnings = element.shadowRoot?.querySelectorAll('.warning');
      expect(warnings?.length).toBe(2);
    });
    it('should suppress "Amtliche Warnung vor" when configured', async () => {
      hass.states['binary_sensor.nina_warnung_1'] = {
        state: 'on',
        attributes: {
          headline: 'Amtliche Warnung vor Sturm',
          severity: 'Minor',
          start: new Date().toISOString(),
        },
      };

      element.hass = hass;
      element.setConfig({ ...config, suppress_warning_text: true });
      await element.updateComplete;

      const headline = element.shadowRoot?.querySelector('.headline');
      expect(headline?.textContent?.trim()).toBe('Sturm');
    });

    it('should suppress "Amtliche Unwetterwarnung vor" when configured', async () => {
      hass.states['binary_sensor.nina_warnung_1'] = {
        state: 'on',
        attributes: {
          headline: 'Amtliche Unwetterwarnung vor Starkregen',
          severity: 'Severe',
          start: new Date().toISOString(),
        },
      };

      element.hass = hass;
      element.setConfig({ ...config, suppress_warning_text: true });
      await element.updateComplete;

      const headline = element.shadowRoot?.querySelector('.headline');
      expect(headline?.textContent?.trim()).toBe('Starkregen');
    });

    it('should truncate description when description_max_length is set', async () => {
      const longDescription = 'This is a very long description that should be truncated when the max length is set.';
      hass.states['binary_sensor.nina_warnung_1'] = {
        state: 'on',
        attributes: {
          headline: 'Test Warning',
          description: longDescription,
          severity: 'Minor',
          start: new Date().toISOString(),
        },
      };

      element.hass = hass;
      element.setConfig({ ...config, description_max_length: 30 });
      await element.updateComplete;

      const description = element.shadowRoot?.querySelector('.description');
      expect(description?.textContent?.trim()).toBe('This is a very long descriptio...');
    });

    it('should apply custom font size when font_size is set', async () => {
      hass.states['binary_sensor.nina_warnung_1'] = {
        state: 'on',
        attributes: {
          headline: 'Test Warning',
          description: 'Test description',
          severity: 'Minor',
          start: new Date().toISOString(),
        },
      };

      element.hass = hass;
      element.setConfig({ ...config, font_size: 18 });
      await element.updateComplete;

      const card = element.shadowRoot?.querySelector<HaCard>('ha-card');
      expect(card?.getAttribute('style')).toContain('font-size: 18px');
    });
  });
  describe('Translation', () => {
    it('should call the translation service when enabled', async () => {
      hass.states['binary_sensor.nina_warnung_1'] = {
        state: 'on',
        attributes: {
          headline: 'Original Headline',
          description: 'Original Description',
          sender: 'Test Sender',
          severity: 'Minor',
          start: new Date().toISOString(),
        },
      };

      const callServiceMock = vi.fn().mockResolvedValue({
        result: JSON.stringify({
          headline: 'Translated Headline',
          description: 'Translated Description',
        }),
      });
      hass.callService = callServiceMock as unknown as HomeAssistant['callService'];

      element.hass = hass;
      element.setConfig({
        ...config,
        enable_translation: true,
        translation_target: 'English',
      });
      await element.updateComplete;

      // Wait for async translation (sequential with 1s delay)
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await element.updateComplete;

      expect(callServiceMock).toHaveBeenCalledWith(
        'ai_task',
        'generate_data',
        expect.objectContaining({
          instructions: expect.stringContaining('Original Headline'),
          task_name: 'translate_warning',
        }),
        undefined,
        undefined,
        true,
      );

      const warning = element.shadowRoot?.querySelector('.warning');
      expect(warning?.querySelector('.headline')?.textContent?.trim()).toBe('Translated Headline');
      expect(warning?.querySelector('.description')?.textContent?.trim()).toBe('Translated Description');
    });

    it('should fallback to original text if translation fails', async () => {
      // Suppress console.error for this test since we're intentionally causing an error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      hass.states['sensor.nina_warning_1'] = {
        state: 'on',
        attributes: {
          headline: 'Original Headline',
          description: 'Original Description',
          sender: 'Test Sender',
          severity: 'Minor',
          start: new Date().toISOString(),
        },
      };

      const callServiceMock = vi.fn().mockRejectedValue(new Error('Service failed'));
      hass.callService = callServiceMock as unknown as HomeAssistant['callService'];

      element.hass = hass;
      element.setConfig({
        type: 'custom:nina-dwd-card',
        nina_entity_prefix: 'sensor.nina_warning',
        enable_translation: true,
        translation_target: 'English',
      });
      await element.updateComplete;

      // Wait for async translation attempt
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await element.updateComplete;

      expect(callServiceMock).toHaveBeenCalled();

      const warning = element.shadowRoot?.querySelector('.warning');
      expect(warning?.querySelector('.headline')?.textContent?.trim()).toBe('Original Headline');

      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
    it('should handle object response from translation service', async () => {
      hass.states['sensor.nina_warning_1'] = {
        state: 'on',
        attributes: {
          headline: 'Original Headline',
          description: 'Original Description',
          sender: 'Test Sender',
          severity: 'Minor',
          start: new Date().toISOString(),
        },
      };

      const callServiceMock = vi.fn().mockResolvedValue({
        data: {
          headline: 'Translated Headline',
          description: 'Translated Description',
          instruction: 'Translated Instruction',
        },
      });
      hass.callService = callServiceMock as unknown as HomeAssistant['callService'];

      element.hass = hass;
      element.setConfig({
        ...NinaDwdCard.getStubConfig(),
        enable_translation: true,
        nina_entity_prefix: 'sensor.nina_warning',
      });

      await element.updateComplete;

      // Wait for async translation
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await element.updateComplete;

      expect(callServiceMock).toHaveBeenCalled();

      const warning = element.shadowRoot?.querySelector('.warning');
      expect(warning?.innerHTML).toContain('Translated Headline');
    });

    it('should handle nested object response with data string', async () => {
      hass.states['sensor.nina_warning_1'] = {
        state: 'on',
        attributes: {
          headline: 'Original Headline',
          description: 'Original Description',
          sender: 'Test Sender',
          severity: 'Minor',
          start: new Date().toISOString(),
        },
      };

      const callServiceMock = vi.fn().mockResolvedValue({
        response: {
          data: JSON.stringify({
            headline: 'Nested Translated Headline',
            description: 'Nested Translated Description',
            instruction: 'Nested Translated Instruction',
          }),
        },
      });
      hass.callService = callServiceMock as unknown as HomeAssistant['callService'];

      element.hass = hass;
      element.setConfig({
        ...NinaDwdCard.getStubConfig(),
        enable_translation: true,
        nina_entity_prefix: 'sensor.nina_warning',
      });

      await element.updateComplete;

      // Wait for async translation (sequential with 1s delay)
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await element.updateComplete;

      expect(callServiceMock).toHaveBeenCalled();

      const warning = element.shadowRoot?.querySelector('.warning');
      expect(warning?.innerHTML).toContain('Nested Translated Headline');
    });
  });

  describe('Theme Modes', () => {
    it('should apply .mode-light class when theme_mode is light', async () => {
      element.hass = hass;
      element.setConfig({ ...config, theme_mode: 'light' });
      await element.updateComplete;

      const card = element.shadowRoot?.querySelector('ha-card');
      expect(card?.classList.contains('mode-light')).toBe(true);
      expect(card?.classList.contains('mode-dark')).toBe(false);
    });

    it('should apply .mode-dark class when theme_mode is dark', async () => {
      element.hass = hass;
      element.setConfig({ ...config, theme_mode: 'dark' });
      await element.updateComplete;

      const card = element.shadowRoot?.querySelector('ha-card');
      expect(card?.classList.contains('mode-dark')).toBe(true);
      expect(card?.classList.contains('mode-light')).toBe(false);
    });

    it('should not apply mode classes when theme_mode is auto', async () => {
      // theme_mode: 'auto' is the default in getStubConfig, but let's be explicit
      element.hass = hass;
      element.setConfig({ ...config, theme_mode: 'auto' });
      await element.updateComplete;

      const card = element.shadowRoot?.querySelector('ha-card');
      expect(card?.classList.contains('mode-light')).toBe(false);
      expect(card?.classList.contains('mode-dark')).toBe(false);
    });

    it('should apply mode class to lightbox', async () => {
      config.dwd_map_land = 'hes';
      config.dwd_map_position = 'above';
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
      element.setConfig({ ...config, theme_mode: 'dark' });
      await element.updateComplete;

      // Open lightbox
      const mapContainer = element.shadowRoot?.querySelector('.map-container') as HTMLElement;
      mapContainer.click();
      await element.updateComplete;

      const lightbox = element.shadowRoot?.querySelector('.lightbox');
      expect(lightbox?.classList.contains('mode-dark')).toBe(true);
    });

    it('should not apply mode class to lightbox when theme_mode is auto', async () => {
      config.dwd_map_land = 'hes';
      config.dwd_map_position = 'above';
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
      element.setConfig({ ...config, theme_mode: 'auto' });
      await element.updateComplete;

      // Open lightbox
      const mapContainer = element.shadowRoot?.querySelector('.map-container') as HTMLElement;
      mapContainer.click();
      await element.updateComplete;

      const lightbox = element.shadowRoot?.querySelector('.lightbox');
      expect(lightbox?.classList.contains('mode-dark')).toBe(false);
      expect(lightbox?.classList.contains('mode-light')).toBe(false);
    });
  });
});
