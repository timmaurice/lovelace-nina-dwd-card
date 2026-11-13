// Canary: look at the two seams the card has to the outside, live.
//
//     node scripts/canary.mjs
//
// The unit tests run on entities and URLs the tests make up, so they stay green
// when Home Assistant's `nina` or `dwd_weather_warnings` integration renames an
// attribute, or when the DWD moves a map. This is the check that does not:
//
// - It reads the contract out of core's current source (`dev`) and fails when
//   something the fixtures have is gone from it, or when something the card
//   reads is - a renamed `warning_<n>_*` attribute, a field `nina.get_details`
//   no longer answers, an entity name that no longer makes the ids the card
//   looks for.
// - It fetches every DWD map the editor offers and fails when one is gone or
//   not an image, or when its proportions moved, which puts the overlay of
//   src/map-data.ts off.
// - It checks that warnung.bund.de, where the warnings link to, still answers.
//
// Exit status: 0 all fine, 1 something changed, 2 a server could not be
// reached, which says nothing about what it serves. Runs weekly in
// .github/workflows/canary.yml. When it fails because core or the DWD moved,
// fix the card, then `node scripts/refresh_fixtures.mjs`.
import process from 'node:process';
import {
  FetchError,
  extractContract,
  fetchCoreFiles,
  fetchMaps,
  get,
  lost,
  missingForCard,
  ratioMoved,
  recordedCoreFiles,
  recordedMaps,
} from './seam.mjs';

const failures = [];
const fail = (problem) => {
  process.stdout.write(`  FAIL ${problem}\n`);
  failures.push(problem);
};
const say = (line) => process.stdout.write(`${line}\n`);

async function checkCore() {
  let live;
  try {
    live = extractContract(await fetchCoreFiles());
  } catch (err) {
    if (err instanceof FetchError) throw err;
    fail(`core's files no longer read as they did: ${err.message}`);
    return;
  }
  say(`core: nina ${live.nina.details.length} details, dwd ${live.dwd.warningAttributes.length} warning attributes`);

  for (const problem of lost(extractContract(recordedCoreFiles()), live)) fail(problem);
  for (const problem of missingForCard(live)) fail(problem);
}

async function checkMaps() {
  const { maps, problems } = await fetchMaps();
  const recorded = recordedMaps();
  for (const problem of problems) fail(problem);
  let count = 0;
  for (const kind of ['state', 'region']) {
    for (const [key, size] of Object.entries(maps[kind])) {
      count++;
      const was = recorded[kind][key];
      if (!was) {
        say(`  ${kind}/${key}: not recorded, ${size.width}x${size.height}`);
      } else if (ratioMoved(was, size)) {
        fail(
          `${kind}/${key}: ${was.width}x${was.height} became ${size.width}x${size.height}, the overlay is tuned to the old proportions`,
        );
      } else if (was.width !== size.width || was.height !== size.height) {
        say(`  ${kind}/${key}: ${was.width}x${was.height} is now ${size.width}x${size.height}, same proportions`);
      }
    }
  }
  say(`maps: ${count} read`);
}

async function checkLinks() {
  const answer = await get('https://warnung.bund.de/');
  say(`warnung.bund.de: ${answer.status}`);
  if (answer.status !== 200) fail(`https://warnung.bund.de/ answers ${answer.status}`);
}

try {
  await checkCore();
  await checkMaps();
  await checkLinks();
} catch (err) {
  if (!(err instanceof FetchError)) throw err;
  say(`\ncould not reach a server, nothing is known about what it serves: ${err.message}`);
  process.exit(2);
}

if (failures.length) {
  say("\nCANARY FAILED - core's integrations or the DWD's maps have most likely changed:");
  for (const failure of failures) say(`  - ${failure}`);
  say('\nFix the card, then run scripts/refresh_fixtures.mjs.');
  process.exit(1);
}
say('\nok: the card still fits what core and the DWD serve.');
