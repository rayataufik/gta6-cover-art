// Golden Hour Cover Studio — a gta6-cover-art-01 entry (Node 22, standard
// library only). The app itself is plain static files under app/: an
// index.html page with hand-written scripts, the Anton font and two free
// sample photos, nothing fetched from the network. This program hands
// that app in: it copies app/ and screenshots/ from beside this file
// into the output directory and writes dossier.json there, the summary
// the judge reads, built with the kit's vendored library. Outside the
// grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The two runs the grader does must write identical bytes. Nothing
// here reads the clock or rolls dice: the copies are byte for byte and
// buildDossier is deterministic for the same input directory.

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

// This file's own directory: app/ and screenshots/ sit beside it.
const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fail fast with a plain message when the entry is incomplete, instead
// of copying a half-built app and letting the dossier builder throw.
if (!existsSync(join(here, 'app', 'index.html'))) {
  console.error('main.ts: app/index.html is missing — the app is not built yet.');
  process.exit(1);
}
const shotFiles = existsSync(join(here, 'screenshots'))
  ? readdirSync(join(here, 'screenshots')).filter((n) => !n.startsWith('.'))
  : [];
if (shotFiles.length < 3 || shotFiles.length > 4) {
  console.error(`main.ts: screenshots/ holds ${shotFiles.length} images — the entry needs 3 or 4.`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps: only text_max_bytes shapes the bytes, the
// rest make this program fail exactly where the scorer would refuse
// the entry (too many screenshots, one over 256 KiB, app/ past 993
// files or 48 MiB, or a path under app/ over 1000 bytes).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);
