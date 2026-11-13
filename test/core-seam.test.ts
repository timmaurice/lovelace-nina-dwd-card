// The card's seams to the outside, on what was recorded from them.
//
// The other tests run on entities and URLs they make up themselves. These run
// on core's own source files (test/fixtures/core, recorded verbatim from
// home-assistant/core) and on the DWD's maps (test/fixtures/dwd-maps.json):
// the entities are built from what core says it publishes, and the map URLs
// are checked against the maps that exist. scripts/canary.mjs holds the live
// sources against the same recordings every week.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/nina-dwd-card';
import { NinaDwdCard } from '../src/nina-dwd-card';
import { MAP_DATA } from '../src/map-data';
import { HomeAssistant } from '../src/types';
import {
  CARD_READS,
  Contract,
  extractContract,
  imageSize,
  lost,
  mapOptions,
  mapUrl,
  missingForCard,
  ratioMoved,
  recordedCoreFiles,
  recordedMaps,
  slug,
} from '../scripts/seam.mjs';

vi.spyOn(console, 'info').mockImplementation(() => undefined);

const hoursFromNow = (hours: number): string => new Date(Date.now() + hours * 3_600_000).toISOString();
const unique = (values: string[]): string[] => [...new Set(values)].sort();
const source = readFileSync('src/nina-dwd-card.ts', 'utf8');

describe('core contract', () => {
  const files = recordedCoreFiles();
  const contract = extractContract(files);

  it('should read what the integrations publish out of the recorded sources', () => {
    expect(contract).toEqual({
      nina: {
        slotAttributes: ['id'],
        details: [
          'affected_areas',
          'description',
          'expires',
          'headline',
          'id',
          'recommended_actions',
          'sender',
          'sent',
          'severity',
          'start',
          'web',
        ],
        services: ['get_details'],
        slotName: 'Warning {slot_id}',
      },
      dwd: {
        sensors: ['advance_warning_level', 'current_warning_level'],
        sensorNames: { current_warning_level: 'Current warning level', advance_warning_level: 'Advance warning level' },
        attributes: ['last_update', 'region_id', 'region_name', 'warning_count'],
        warningAttributes: [
          'color',
          'description',
          'end',
          'headline',
          'instruction',
          'level',
          'name',
          'parameters',
          'start',
          'type',
        ],
      },
    });
  });

  it('should offer everything the card reads', () => {
    expect(missingForCard(contract)).toEqual([]);
  });

  it('should list exactly what the card reads, so the list cannot go stale', () => {
    const fromDetails = [...source.matchAll(/\bfield\('(\w+)'\)|\bdetails\?\.(\w+)/g)].map((m) => m[1] ?? m[2]);
    expect(unique(fromDetails)).toEqual(CARD_READS.nina.details);

    const fromDwd = [...source.matchAll(/`warning_\$\{i\}_(\w+)`/g)].map((m) => m[1]);
    expect(unique(fromDwd)).toEqual(CARD_READS.dwd.warningAttributes);

    expect(source).toContain(`'nina',\n        'get_details'`);
    expect(source).toContain(`endsWith('${CARD_READS.dwd.sensorSuffixes.current}')`);
    expect(source).toContain(`endsWith('${CARD_READS.dwd.sensorSuffixes.advance}')`);
  });

  describe('when core changes', () => {
    const changed = (path: string, from: string, to: string): Contract => {
      expect(files[path]).toContain(from);
      return extractContract({ ...files, [path]: files[path].replace(from, to) });
    };

    it('should notice a renamed DWD attribute', () => {
      const renamed = changed('dwd_weather_warnings/sensor.py', 'warning_{i}_level', 'warning_{i}_severity');

      expect(lost(contract, renamed)).toEqual(['contract.dwd.warningAttributes: level gone']);
      expect(missingForCard(renamed)).toEqual([
        'dwd warning attributes: the card reads level, core no longer has them',
      ]);
    });

    it('should notice a field nina.get_details no longer answers', () => {
      const dropped = changed(
        'nina/binary_sensor.py',
        'SERVICE_DATA_RECOMMENDED_ACTIONS: data',
        'SERVICE_DATA_SENDER: data',
      );

      expect(missingForCard(dropped)).toEqual([
        'nina.get_details: the card reads recommended_actions, core no longer has them',
      ]);
    });

    it('should notice a DWD sensor that is named differently', () => {
      const strings = JSON.parse(files['dwd_weather_warnings/strings.json']);
      strings.entity.sensor.current_warning_level.name = 'Warning level';
      const renamed = extractContract({ ...files, 'dwd_weather_warnings/strings.json': JSON.stringify(strings) });

      expect(missingForCard(renamed)).toHaveLength(1);
      expect(missingForCard(renamed)[0]).toContain('_warning_level');
    });

    it('should not mind what is new', () => {
      const added = changed(
        'nina/binary_sensor.py',
        'SERVICE_DATA_WEB: data',
        'SERVICE_DATA_WEB: data,\n            SERVICE_DATA_ID: data.id,\n            SERVICE_DATA_SENT: data',
      );

      expect(lost(contract, added)).toEqual([]);
    });

    it('should refuse a file that no longer reads like itself', () => {
      expect(() => extractContract({ ...files, 'nina/binary_sensor.py': 'class Nina: ...' })).toThrow(
        'def extra_state_attributes',
      );
    });
  });
});

describe('the card on what core publishes', () => {
  const contract = extractContract(recordedCoreFiles());
  let element: NinaDwdCard;
  let hass: HomeAssistant;

  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      await element.updateComplete;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  const text = (selector: string) => element.shadowRoot?.querySelector(selector)?.textContent?.trim();

  beforeEach(() => {
    hass = {
      localize: (key: string, placeholders?: Record<string, string>) =>
        key === 'card.source' && placeholders?.sender ? `Source: ${placeholders.sender}` : key,
      language: 'en',
      locale: { language: 'en', number_format: 'comma_decimal', time_format: '24' },
      states: {},
      entities: {},
      devices: {},
      config: { latitude: 52.52, longitude: 13.4, time_zone: 'Europe/Berlin', components: [] },
    } as unknown as HomeAssistant;
    element = document.createElement('nina-dwd-card') as NinaDwdCard;
    document.body.appendChild(element);
  });

  afterEach(() => {
    document.body.removeChild(element);
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should render a NINA warning from a slot with the published attributes and the action answer', async () => {
    const slot = 'binary_sensor.kaarst_warning_1';
    // The slot as the contract says: its published attributes (plus the
    // friendly name Home Assistant adds), named after the slot's name template.
    const attributes: Record<string, unknown> = Object.fromEntries(
      contract.nina.slotAttributes.map((k) => [k, 'mow.DE-1']),
    );
    attributes.friendly_name = `Kaarst ${contract.nina.slotName!.replace('{slot_id}', '1')}`;
    hass.states[slot] = { state: 'on', attributes, last_updated: '2026-11-13T10:00:00+00:00' };
    hass.entities[slot] = { platform: 'nina' };

    // The action's answer carries exactly the published detail fields.
    const sample: Record<string, string> = {
      headline: 'Amtliche WARNUNG vor STURMBÖEN',
      description: 'Es treten Sturmböen auf.',
      sender: 'Deutscher Wetterdienst',
      severity: 'Severe',
      recommended_actions: 'Fenster schließen.',
      affected_areas: 'Kaarst',
      web: 'https://example.invalid',
      id: 'mow.DE-1',
      sent: hoursFromNow(-2),
      start: hoursFromNow(-1),
      expires: hoursFromNow(5),
    };
    expect(Object.keys(sample).sort()).toEqual(contract.nina.details);
    hass.services = { nina: { [contract.nina.services[0]]: {} } };
    hass.callService = vi.fn().mockResolvedValue({ context: { id: 'c' }, response: { [slot]: sample } }) as never;

    element.setConfig({ type: 'custom:nina-dwd-card', nina_entity_prefix: 'binary_sensor.kaarst_warning' });
    element.hass = hass;
    await settle();

    expect(hass.callService).toHaveBeenCalledWith(
      'nina',
      contract.nina.services[0],
      {},
      { entity_id: [slot] },
      false,
      true,
    );
    expect(text('.headline')).toBe('Amtliche WARNUNG vor STURMBÖEN');
    expect(text('.description')).toBe('Es treten Sturmböen auf.');
    expect(text('.instruction')).toBe('Fenster schließen.');
    expect(text('.sender')).toBe('Source: Deutscher Wetterdienst');
    expect(element.shadowRoot?.querySelector('.bund-link')?.getAttribute('href')).toContain('mow.DE-1');
  });

  it('should render a DWD warning from a sensor named and filled as the integration does', async () => {
    const [current, advance] = ['current_warning_level', 'advance_warning_level'].map(
      (key) => `sensor.berlin_${slug(contract.dwd.sensorNames[key]!)}`,
    );
    const sample: Record<string, unknown> = {
      name: 'Amtliche WARNUNG vor FROST',
      type: 22,
      level: 2,
      headline: 'Amtliche WARNUNG vor FROST',
      description: 'Es tritt Frost auf.',
      instruction: 'Pflanzen schützen.',
      start: hoursFromNow(-1),
      end: hoursFromNow(5),
      parameters: {},
      color: '#ffc800',
    };
    expect(Object.keys(sample).sort()).toEqual(contract.dwd.warningAttributes);
    const attributes: Record<string, unknown> = {
      region_name: 'Berlin',
      region_id: '811000000',
      last_update: hoursFromNow(0),
      warning_count: 1,
    };
    expect(Object.keys(attributes).sort()).toEqual(contract.dwd.attributes);
    for (const [key, value] of Object.entries(sample)) attributes[`warning_1_${key}`] = value;

    hass.entities[current] = { entity_id: current, device_id: 'dwd-device' };
    hass.states[current] = { state: '2', attributes };
    hass.entities[advance] = { entity_id: advance, device_id: 'dwd-device' };
    hass.states[advance] = { state: '0', attributes: { ...attributes, warning_count: 0 } };

    element.setConfig({ type: 'custom:nina-dwd-card', dwd_device: 'dwd-device' });
    element.hass = hass;
    await settle();

    expect(element.shadowRoot?.querySelectorAll('.warning')).toHaveLength(1);
    expect(text('.headline')).toBe('Amtliche WARNUNG vor FROST');
    expect(text('.description')).toBe('Es tritt Frost auf.');
    expect(text('.instruction')).toBe('Pflanzen schützen.');
    expect(text('.sender')).toBe('Source: Deutscher Wetterdienst');
  });
});

describe('DWD maps', () => {
  const options = mapOptions();
  const maps = recordedMaps();

  it('should have a recording for every map the editor offers, and for no other', () => {
    expect(Object.keys(maps.state).sort()).toEqual([...options.state].sort());
    expect(Object.keys(maps.region).sort()).toEqual([...options.region].sort());
  });

  it('should have overlay bounds for every state map', () => {
    expect(Object.keys(MAP_DATA).sort()).toEqual([...options.state].sort());
  });

  it.each([
    ['state', options.state, undefined],
    ['region', options.region, 'region'],
  ] as const)('should load the %s maps from the URLs the DWD serves them at', async (kind, keys, type) => {
    const element = document.createElement('nina-dwd-card') as NinaDwdCard;
    document.body.appendChild(element);
    try {
      for (const key of keys) {
        element.setConfig({ type: 'custom:nina-dwd-card', dwd_map_land: key, dwd_map_type: type });
        const url = (element as unknown as { _getMapUrl(): string })._getMapUrl();
        expect(url.split('?')[0]).toBe(mapUrl(kind, key));
        expect(maps[kind][key].type).toBe(kind === 'region' ? 'image/jpeg' : 'image/png');
      }
    } finally {
      document.body.removeChild(element);
    }
  });

  it('should tell a map that changed its proportions from one that was only rescaled', () => {
    const was = { type: 'image/png', width: 500, height: 625 };

    expect(ratioMoved(was, { ...was, width: 1000, height: 1250 })).toBe(false);
    expect(ratioMoved(was, { ...was, width: 500, height: 600 })).toBe(true);
  });

  it('should read the size of a PNG and a JPEG', () => {
    const png = Buffer.alloc(33);
    png.writeUInt32BE(0x89504e47, 0);
    png.writeUInt32BE(500, 16);
    png.writeUInt32BE(625, 20);
    // SOI, APP0 (length 4), SOF0 with 768 high and 1366 wide.
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x03, 0x00, 0x05, 0x56, 0x01,
    ]);

    expect(imageSize(png)).toEqual({ width: 500, height: 625 });
    expect(imageSize(jpeg)).toEqual({ width: 1366, height: 768 });
    expect(imageSize(Buffer.from('<html>'))).toBeNull();
  });
});
