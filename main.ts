// SOLMAR HEAT — the hand-in program for the make.fun bounty gta6-01.
// "Make GTA 6": the most complete, highest-quality original open-world crime
// game in the spirit of GTA 6. You are Dana "Deke" Reyes, the city's best
// getaway driver. You owe fixer Vera Solano $5,000, and rival boss Marcus
// Kade would rather see you gone than paid up. Steal cars, run six jobs
// across the sun-soaked coastal city of Solmar Bay, lose the cops, and buy
// your way out — all offline, from static files, with three.js r160 vendored
// under game/ and a WebAudio synth for sound.
//
// Run it:  MAKEFUN_OUTPUT_DIR=out node main.ts
// It copies game/ and screenshots/ beside itself into the output directory
// and writes /output/dossier.json with buildDossier from the vendored kit
// library vendor/makefun-game.ts (the scorer's own copy, byte for byte).

import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || join(here, 'output');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(join(here, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(here, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

console.log(`SOLMAR HEAT handed in to ${outDir}`);
console.log(`dossier.json: ${dossier.length} bytes`);
