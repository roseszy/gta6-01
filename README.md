[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/roseszy/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/roseszy/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)
# Solmar Heat

An original open-world crime game in the spirit of GTA 6, built for the
[make.fun](https://make.fun/bounty/gta6-01) bounty "Make GTA 6". It runs
offline in a desktop browser from static files — no build step, no network
requests, no downloads at run time.

## The story

You are Dana "Deke" Reyes, the city's best getaway driver. You owe fixer
Vera Solano $5,000, and rival boss Marcus Kade would rather see you gone
than paid up. Steal cars, run six jobs across the sun-soaked coastal city of
Solmar Bay, lose the cops, and buy your way out.

## Play it

```sh
node serve.ts
```

Then open http://localhost:8080/ in a desktop browser. A live build is also
up at https://roseszy.github.io/gta6-01/game/.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move on foot / drive |
| Shift | Run |
| Space | Jump / handbrake |
| Mouse | Look around (click the game to lock the mouse) |
| Click | Shoot the pistol |
| F | Punch |
| R | Reload (12-round mag, infinite reserve) |
| E | Enter / steal a car, interact, exit a car |
| M | Mute |
| Esc | Pause |

## What's in the game

- A 9×9-block coastal city: Solmar Bay, with a beach, marina, palms,
  pastel buildings and eight named landmarks — Vera's Garage, Solmar Marina,
  Solmar Grand Hotel, the Azure Penthouse, Solmar General hospital, Solmar PD
  Central, the Taxi Stand and Club Neon Palms.
- Six story missions ($300–$2,500, $5,400 in total) with a golden beacon
  marking each destination: steal a car, run packages, be a getaway driver,
  fight off Kade's crew, pull the big score, and pay the debt.
- Wanted system, 0–5 stars: police cruisers spawn, chase and ram you; stay
  out of sight and the heat cools one star at a time. Get caught and it's
  BUSTED — you wake up at the hospital.
- Traffic that drives the street grid, pedestrians on the sidewalks, car
  stealing, pistol and fist combat, rival gang members who shoot back.
- Side activities: 20 hidden cash stashes and taxi fares from the stand.
- HUD with wanted stars, money, health, a clock, objectives with distance,
  an event feed, a live minimap, a speedometer and a weapon readout.
- Title, pause and end screens; progress saves to localStorage (CONTINUE on
  the title screen); synthesized WebAudio sound — engine hum, two-tone
  police siren, pickup and gunshot blips. No audio files.
- Deterministic screenshot scenes: `?shot=start|drive|chase|mission&seed=1337`
  stages a fixed scene and sets `window.__shotReady`. The four images in
  `screenshots/` are real captures of those scenes.

## How it's built

- `game/index.html` + ES modules under `game/src/` (city, vehicles,
  pedestrians, player, wanted, combat, missions, activities, HUD, audio,
  input, textures, screenshot scenes).
- three.js r160, vendored at `game/vendor/three.module.min.js`.
- `main.ts` (Node 22, stdlib only) copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json` with the kit's
  `vendor/makefun-game.ts` library. Run it with
  `MAKEFUN_OUTPUT_DIR=out node main.ts`.
- `serve.ts` is a tiny static server for local play.

## License

MIT — see [LICENSE](LICENSE).
