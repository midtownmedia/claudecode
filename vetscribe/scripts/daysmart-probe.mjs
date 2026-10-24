/**
 * Dumps what the DaySmart Vet API actually returns for this clinic so the
 * adapter's field mapping can be confirmed. Reads the same DAYSMART_* settings
 * as the server (put them in .env or the environment), writes raw JSON under
 * DATA_DIR/probe, and prints the top-level keys it saw.
 *
 *   node --env-file=.env scripts/daysmart-probe.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../server/config.js';
import { DaySmartPims, mapAppointment } from '../server/pims/daysmart.js';

const cfg = loadConfig();
const pims = new DaySmartPims({ ...cfg.pims.daysmart, dataDir: cfg.dataDir, maxPages: 1 });
const out = join(cfg.dataDir, 'probe');
await mkdir(out, { recursive: true });

const keys = (o) => (o && typeof o === 'object' ? Object.keys(o).join(', ') : typeof o);
async function probe(label, path, query) {
  try {
    const json = await pims.request('GET', path, { query });
    await writeFile(join(out, `${label}.json`), JSON.stringify(json, null, 2));
    const items = DaySmartPims.resources(json);
    console.log(`\n${label}: ${items.length} item(s)  (saved ${label}.json)`);
    console.log(`  envelope keys: ${keys(json)}${json?.response ? ` / response: ${keys(json.response)}` : ''}`);
    if (items[0]) console.log(`  item keys: ${keys(items[0])}`);
    return items;
  } catch (e) {
    console.log(`\n${label}: FAILED  ${e.message}`);
    return [];
  }
}

console.log(`Probing ${pims.base} as clinic ${cfg.pims.daysmart.clinicId || '(no clinic id)'} ...`);
try { await pims.token(); console.log('token: ok'); } catch (e) { console.log(`token: FAILED  ${e.message}`); process.exit(1); }

const appts = await probe('appointments', 'appointments', { page: 1, perPage: 20, category: 'medical' });
await probe('appointment-providers', 'appointment-providers', { page: 1, perPage: 50 });
await probe('appointment-types', 'appointment-types', { page: 1, perPage: 50 });
const patients = await probe('patients', 'patients', { page: 1, perPage: 5 });
await probe('clients', 'clients', { page: 1, perPage: 5 });
const pid = patients[0]?.id ?? appts[0]?.patient?.id ?? appts[0]?.patient;
if (pid) {
  await probe('patient-one', `patients/${pid}`);
  for (const p of ['records', 'medical-records', 'history', 'visits', 'vaccinations', 'weights', 'reminders']) await probe(`patient-${p}`, `patients/${pid}/${p}`, { page: 1, perPage: 5 });
}
if (appts[0]) {
  console.log('\nFirst appointment as VetScribe would see it:');
  console.log(JSON.stringify(mapAppointment(appts[0]), null, 2));
}
console.log(`\nRaw responses are in ${out}. Compare the item keys above with server/pims/daysmart.js and adjust pick() names where they differ.`);
