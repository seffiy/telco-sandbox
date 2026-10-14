// Writes the dataset to data/generated/ as JSON so other repos (and notebooks) can load it without the server.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateDataset } from '../src/data/generator.js';

const seed = Number(process.env.SANDBOX_SEED ?? 42);
const subscribers = Number(process.env.SANDBOX_SUBSCRIBERS ?? 1000);
const out = process.argv[2] ?? 'data/generated';

const ds = generateDataset({ seed, subscribers });
mkdirSync(out, { recursive: true });
for (const [name, rows] of Object.entries(ds)) {
  writeFileSync(join(out, `${name}.json`), JSON.stringify(rows, null, name === 'meta' || name === 'anomalies' ? 2 : 0));
}
const byType = ds.anomalies.reduce((m, a) => ({ ...m, [a.type]: (m[a.type] ?? 0) + 1 }), {});
console.log(`Wrote ${out}/ (seed ${seed}, ${subscribers} subscribers)`);
console.table(byType);
