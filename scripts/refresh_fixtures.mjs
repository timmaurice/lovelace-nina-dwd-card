// Refresh test/fixtures from the live sources.
//
//     node scripts/refresh_fixtures.mjs          # rewrite core's files and the maps
//     node scripts/refresh_fixtures.mjs --check  # change nothing, say what moved
//
// Run it when the canary (scripts/canary.mjs, .github/workflows/canary.yml)
// reports that core's integrations or the DWD's maps have changed and the card
// has been adjusted to it: the tests then run against what is served now.
// Review the diff before committing - it is the upstream's change, line by
// line - and run the suite.
//
// core's files are stored verbatim (.prettierignore leaves test/fixtures/core
// alone), the maps as their type and pixel size in test/fixtures/dwd-maps.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  CORE_FIXTURES,
  FetchError,
  MAPS_FIXTURE,
  extractContract,
  fetchCoreFiles,
  fetchMaps,
  lost,
  recordedCoreFiles,
  recordedMaps,
} from './seam.mjs';

const check = process.argv.includes('--check');
const say = (line) => process.stdout.write(`${line}\n`);
const write = (url, text) => {
  const path = fileURLToPath(url);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

try {
  const files = await fetchCoreFiles();
  let recorded = null;
  try {
    recorded = extractContract(recordedCoreFiles());
  } catch {
    say('core: nothing recorded yet');
  }
  if (recorded) {
    const gone = lost(recorded, extractContract(files));
    say(`core: ${gone.length} things of the recorded contract gone`);
    for (const problem of gone) say(`    - ${problem}`);
  }

  const { maps, problems } = await fetchMaps();
  for (const problem of problems) say(`maps: ${problem}`);
  let before = {};
  try {
    before = recordedMaps();
  } catch {
    say('maps: nothing recorded yet');
  }
  const moved = Object.keys(maps).flatMap((kind) =>
    Object.entries(maps[kind]).filter(([key, size]) => JSON.stringify(before[kind]?.[key]) !== JSON.stringify(size)),
  );
  say(
    `maps: ${moved.length} of ${Object.values(maps).reduce((n, m) => n + Object.keys(m).length, 0)} differ from the recording`,
  );

  if (problems.length) {
    say('not written: a map could not be read, kept as it was.');
    process.exit(1);
  }
  if (!check) {
    for (const [path, text] of Object.entries(files)) write(new URL(path, CORE_FIXTURES), text);
    write(MAPS_FIXTURE, `${JSON.stringify(maps, null, 2)}\n`);
    say('written: test/fixtures/core, test/fixtures/dwd-maps.json');
  }
} catch (err) {
  if (!(err instanceof FetchError)) throw err;
  say(`not fetched - ${err.message}`);
  process.exit(2);
}
