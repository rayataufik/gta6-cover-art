// Golden Hour Cover Studio — the entry program (Node 22, standard library only).
// It copies app/ and screenshots/ beside it into the output directory and
// writes the dossier buildDossier makes from them, so the sealed scorer can
// check the entry and the judge can read it. Run it twice and the bytes
// must come out the same, so it reads nothing that changes between runs:
// no clock, no randomness, no environment beyond the output directory.

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// Fail fast, before copying anything, if the entry is incomplete: the app
// folder, the screenshots folder, and at least one screenshot must all be
// present beside this file. A half-copied output is worse than a loud stop.
for (const dir of ['app', 'screenshots']) {
  if (!existsSync(join(here, dir))) {
    throw new Error(`missing ${dir}/ beside main.ts — refusing to write ${outDir}`);
  }
}
if (readdirSync(join(here, 'screenshots')).length === 0) {
  throw new Error('screenshots/ is empty — refusing to write ' + outDir);
}

const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
};

mkdirSync(outDir, { recursive: true });
cpSync(join(here, 'app'), join(outDir, 'app'), { recursive: true });
cpSync(join(here, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, caps);
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`dossier.json: ${dossier.length} bytes`);
