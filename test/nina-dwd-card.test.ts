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
});
