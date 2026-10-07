// Jalankan semua test/*.test.js. Wajib lulus sebelum database di-deploy.
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'test');
const files = readdirSync(testDir).filter(f => f.endsWith('.test.js')).sort();
let pass = 0, fail = 0;

for (const f of files) {
  console.log(`\n▸ ${f}`);
  const mod = await import(pathToFileURL(join(testDir, f)).href);
  const t = async (name, fn) => {
    try { await fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e) { fail++; console.log(`  ✗ ${name}\n    ${e.message}`); }
  };
  try { await mod.default(t); }
  catch (e) { fail++; console.log(`  ✗ suite gagal dimuat: ${e.message}`); }
}

console.log(`\n${pass} lulus, ${fail} gagal (${files.length} suite)`);
process.exit(fail ? 1 : 0);
