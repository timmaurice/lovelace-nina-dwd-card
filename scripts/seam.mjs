// What the canary, the fixture refresh and the seam tests share.
//
// The card has two seams to the outside, and neither is covered by the unit
// tests, which run on entities and URLs the tests make up themselves:
//
// 1. Home Assistant's `nina` and `dwd_weather_warnings` integrations. The card
//    reads their entities: the attributes of the warning slots, what
//    `nina.get_details` answers, the DWD sensors' `warning_<n>_*` attributes and
//    the entity ids that come out of their names. `extractContract` reads that
//    contract out of core's source files, which are recorded verbatim in
//    test/fixtures/core.
// 2. The DWD's warning maps, fetched by the browser from fixed URLs. The overlay
//    on them (src/map-data.ts) is tuned to the images' proportions, which are
//    recorded in test/fixtures/dwd-maps.json.
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { URL, pathToFileURL } from 'node:url';

// The repository root: everything runs from there (npm, the workflows, vitest).
export const ROOT = pathToFileURL(`${process.cwd()}/`);
export const CORE_FIXTURES = new URL('test/fixtures/core/', ROOT);
export const MAPS_FIXTURE = new URL('test/fixtures/dwd-maps.json', ROOT);

export const CORE_REF = 'dev';
export const CORE_BASE = `https://raw.githubusercontent.com/home-assistant/core/${CORE_REF}/homeassistant/components/`;

/** Core's source files the contract is read from, relative to `components/`. */
export const CORE_FILES = [
  'nina/binary_sensor.py',
  'nina/const.py',
  'nina/services.yaml',
  'nina/strings.json',
  'dwd_weather_warnings/const.py',
  'dwd_weather_warnings/sensor.py',
  'dwd_weather_warnings/strings.json',
];

/** `homeassistant.const.ATTR_ID`, the one core constant the NINA slot imports. */
const CORE_CONSTANTS = { ATTR_ID: 'id' };

/**
 * What the card reads, as `src/nina-dwd-card.ts` does. test/core-seam.test.ts
 * pins this list to the source, so it cannot go stale.
 */
export const CARD_READS = {
  nina: {
    slotAttributes: ['id'],
    details: ['description', 'expires', 'headline', 'id', 'recommended_actions', 'sender', 'sent', 'severity', 'start'],
    services: ['get_details'],
  },
  dwd: {
    warningAttributes: ['description', 'end', 'headline', 'instruction', 'level', 'start', 'type'],
    // Matched by the end of the entity id, `<device>_<name>`.
    sensorSuffixes: { current: '_current_warning_level', advance: '_advance_warning_level' },
  },
};

const unique = (values) => [...new Set(values)].sort();
const matches = (text, pattern) => [...text.matchAll(pattern)];
const section = (text, from, to) => {
  const start = text.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = to ? text.indexOf(to, start) : -1;
  return text.slice(start, end < 0 ? undefined : end);
};
const constants = (text, pattern) => Object.fromEntries(matches(text, pattern).map((m) => [m[1], m[2]]));

/** The slug Home Assistant makes of an entity's name, for the end of its entity id. */
export const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

/**
 * Reads the contract out of core's files (`{ 'nina/const.py': text, ... }`).
 * Throws when a file does not look like it used to, which the canary reports as
 * a change: the extraction is the first thing that breaks when core is rewritten.
 */
export function extractContract(files) {
  const need = (path) => {
    if (typeof files[path] !== 'string') throw new Error(`${path} is missing`);
    return files[path];
  };

  const ninaConst = constants(need('nina/const.py'), /^(SERVICE_DATA_\w+)\s*:\s*str\s*=\s*"([^"]*)"/gm);
  const ninaSensor = need('nina/binary_sensor.py');
  const stateBody = section(ninaSensor, 'def extra_state_attributes', 'def get_details');
  const detailsBody = section(ninaSensor, 'def get_details');
  const resolve = (table, name) => {
    const value = table[name];
    if (value === undefined) throw new Error(`${name} is not a constant core defines`);
    return value;
  };
  const ninaStrings = JSON.parse(need('nina/strings.json'));

  const dwdConst = constants(need('dwd_weather_warnings/const.py'), /^(\w+)\s*:\s*Final\s*=\s*"([^"]*)"/gm);
  const dwdSensor = need('dwd_weather_warnings/sensor.py');
  const dwdBody = section(dwdSensor, 'def extra_state_attributes', 'def available');
  const dwdStrings = JSON.parse(need('dwd_weather_warnings/strings.json'));
  const sensors = [dwdConst.CURRENT_WARNING_SENSOR, dwdConst.ADVANCE_WARNING_SENSOR];
  if (sensors.some((key) => !key)) throw new Error('the DWD sensor keys are not constants any more');

  return {
    nina: {
      slotAttributes: unique(matches(stateBody, /\b(ATTR_\w+):/g).map((m) => resolve(CORE_CONSTANTS, m[1]))),
      details: unique(matches(detailsBody, /\b(SERVICE_DATA_\w+):/g).map((m) => resolve(ninaConst, m[1]))),
      services: unique(matches(need('nina/services.yaml'), /^([a-z_]+):/gm).map((m) => m[1])),
      slotName: ninaStrings.entity?.binary_sensor?.warning?.name ?? null,
    },
    dwd: {
      sensors: unique(sensors),
      sensorNames: Object.fromEntries(sensors.map((key) => [key, dwdStrings.entity?.sensor?.[key]?.name ?? null])),
      attributes: unique(
        matches(dwdBody, /\b(ATTR_\w+)\b/g)
          .map((m) => m[1])
          .filter((name) => dwdConst[name] !== undefined)
          .map((name) => dwdConst[name]),
      ),
      warningAttributes: unique(matches(dwdBody, /data\[f"warning_\{i\}_(\w+)"\]/g).map((m) => m[1])),
    },
  };
}

/** Reads the recorded core files. */
export function recordedCoreFiles() {
  return Object.fromEntries(CORE_FILES.map((path) => [path, readFileSync(new URL(path, CORE_FIXTURES), 'utf8')]));
}

const difference = (wanted, have) => wanted.filter((item) => !have.includes(item));

/** What the card needs and the contract no longer offers. */
export function missingForCard(contract) {
  const problems = [];
  const lacks = (what, wanted, have) => {
    const gone = difference(wanted, have);
    if (gone.length) problems.push(`${what}: the card reads ${gone.join(', ')}, core no longer has them`);
  };
  // `id` stays an attribute of the slot, the details come from the action.
  lacks('nina slot attributes', CARD_READS.nina.slotAttributes, contract.nina.slotAttributes);
  lacks('nina.get_details', CARD_READS.nina.details, contract.nina.details);
  lacks('nina services', CARD_READS.nina.services, contract.nina.services);
  lacks('dwd warning attributes', CARD_READS.dwd.warningAttributes, contract.dwd.warningAttributes);

  const suffixes = CARD_READS.dwd.sensorSuffixes;
  const [current, advance] = ['current_warning_level', 'advance_warning_level'].map((key) =>
    contract.dwd.sensorNames[key] ? `_${slug(contract.dwd.sensorNames[key])}` : null,
  );
  if (current !== suffixes.current || advance !== suffixes.advance) {
    problems.push(
      `dwd sensor names make the entity ids end in ${current} / ${advance}, the card looks for ${suffixes.current} / ${suffixes.advance}`,
    );
  }
  if (!/^\w+ \{slot_id\}$/.test(contract.nina.slotName ?? '')) {
    problems.push(`nina slot name is ${JSON.stringify(contract.nina.slotName)}, the card strips "<Warning> <n>"`);
  }
  return problems;
}

/** What the recorded contract has and the live one has lost. Anything new is not a problem. */
export function lost(recorded, live) {
  const problems = [];
  const walk = (path, was, now) => {
    if (Array.isArray(was)) {
      const gone = difference(was, now ?? []);
      if (gone.length) problems.push(`${path}: ${gone.join(', ')} gone`);
    } else if (was && typeof was === 'object') {
      for (const key of Object.keys(was)) walk(`${path}.${key}`, was[key], now?.[key]);
    } else if (was !== now) {
      problems.push(`${path}: was ${JSON.stringify(was)}, is ${JSON.stringify(now)}`);
    }
  };
  walk('contract', recorded, live);
  return problems;
}

/** The map keys the card offers in its editor, by kind, from the English translation. */
export function mapOptions() {
  const en = JSON.parse(readFileSync(new URL('src/translation/en.json', ROOT), 'utf8'));
  return {
    state: Object.keys(en.editor.dwd_map_land_options),
    region: Object.keys(en.editor.dwd_map_region_options),
  };
}

/** The URL the card loads a map from (`_getMapUrl` in src/nina-dwd-card.ts, without the cache buster). */
export const mapUrl = (kind, key) =>
  kind === 'region'
    ? `https://www.dwd.de/DWD/warnungen/warnstatus/${key}.jpg`
    : `https://www.dwd.de/DWD/warnungen/warnapp_gemeinden/json/warnungen_gemeinde_map_${key}.png`;

/** The pixel size of a PNG or a JPEG, or `null` when it is neither. */
export function imageSize(bytes) {
  const buffer = Buffer.from(bytes);
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length > 4 && buffer.readUInt16BE(0) === 0xffd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) return null;
      const marker = buffer[offset + 1];
      // The start-of-frame markers carry the size; C4, C8 and CC do not.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
  }
  return null;
}

/** How far a map's proportions may move from the recording before the overlay is off. */
export const RATIO_TOLERANCE = 0.02;

export const ratioMoved = (recorded, live) =>
  Math.abs(live.width / live.height / (recorded.width / recorded.height) - 1) > RATIO_TOLERANCE;

/** Reads the recorded maps. */
export const recordedMaps = () => JSON.parse(readFileSync(MAPS_FIXTURE, 'utf8'));

/** The server could not be reached; that says nothing about what it serves. */
export class FetchError extends Error {}

/** Fetches `url`, one retry for a network error. An HTTP error status is an answer, not an error. */
export async function get(url) {
  let failure;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await globalThis.fetch(url, {
        headers: { 'User-Agent': 'nina-dwd-card-canary' },
        signal: globalThis.AbortSignal.timeout(30_000),
      });
      return {
        status: response.status,
        type: response.headers.get('content-type') ?? '',
        bytes: new Uint8Array(await response.arrayBuffer()),
      };
    } catch (err) {
      failure = err;
    }
  }
  throw new FetchError(`${url}: ${failure?.cause?.message ?? failure?.message ?? failure}`);
}

/** Fetches core's files as `{ path: text }`. A missing file is a change, so it throws a plain Error. */
export async function fetchCoreFiles() {
  const files = {};
  for (const path of CORE_FILES) {
    const answer = await get(CORE_BASE + path);
    if (answer.status !== 200) throw new Error(`${CORE_BASE + path} answers ${answer.status}`);
    files[path] = new globalThis.TextDecoder().decode(answer.bytes);
  }
  return files;
}

/** Fetches every map the editor offers: `{ state: { key: { type, width, height } }, region: {...} }`. */
export async function fetchMaps(options = mapOptions()) {
  const maps = { state: {}, region: {} };
  const problems = [];
  for (const kind of ['state', 'region']) {
    for (const key of options[kind]) {
      const url = mapUrl(kind, key);
      const answer = await get(url);
      const type = answer.type.split(';')[0].trim();
      const size = answer.status === 200 && type.startsWith('image/') ? imageSize(answer.bytes) : null;
      if (!size) {
        problems.push(`${url} answers ${answer.status} ${type}, not an image of a known format`);
        continue;
      }
      maps[kind][key] = { type, ...size };
    }
  }
  return { maps, problems };
}
