// SOLMAR HEAT — the make.fun gta6-01 entry program (Node 22, stdlib only).
// The game itself is this directory's game/ folder: plain static files a
// desktop browser loads offline (game/index.html and its ES modules, three.js
// vendored under game/vendor/, no network request at all). This program hands
// it in: it copies game/ and screenshots/ from beside this file to /output
// and writes /output/dossier.json — the summary the judge reads — with the
// vendored make.fun library.
//
// The game: Solmar, a sun-soaked coastal city. Dana "Deke" Reyes, a getaway
// driver $5,000 in debt to fixer Vera Solano, works six missions across the
// city — stealing cars, pickups, getaway driving, a rival gang fight, a big
// score and the final payoff — with traffic, pedestrians, a 5-star wanted
// system and police chases, combat, taxi fares and cash stashes, a HUD with a
// live minimap, title and pause screens, a localStorage save, and synthesized
// WebAudio music and sound.
//
// Put 3 or 4 PNG or JPEG screenshots in screenshots/ (the first by name is
// the cover) and run this file. Serve the game locally with `node serve.ts`,
// then open http://localhost:8080. Outside the grader's container,
// MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps (from reference/gate.json): only text_max_bytes
// shapes the bytes. The rest refuse an entry the scorer would refuse — more
// than 4 screenshots or one over 256 KiB; more than 993 files in game/ or
// 48 MiB of game files in all, or a path under game/ over 1000 bytes. game/
// counts beside /output's own 1000-entry cap, its screenshots/ and
// dossier.json.
const GATE_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

/** Copy the game and the screenshots into the output directory. */
function copyEntryFiles(dest: string) {
  mkdirSync(dest, { recursive: true });
  cpSync(join(repoRoot, 'game'), join(dest, 'game'), { recursive: true });
  mkdirSync(join(dest, 'screenshots'), { recursive: true });
  const shots = join(repoRoot, 'screenshots');
  if (existsSync(shots)) cpSync(shots, join(dest, 'screenshots'), { recursive: true });
}

/** Build dossier.json for everything now in the output directory. */
function writeDossier(dest: string) {
  writeFileSync(join(dest, 'dossier.json'), buildDossier(dest, GATE_CAPS));
}

copyEntryFiles(outDir);
writeDossier(outDir);
