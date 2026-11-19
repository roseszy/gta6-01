[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/roseszy/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/roseszy/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

# SOLMAR HEAT

An original open-world crime game in the spirit of GTA 6, built for the
[make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01) — a sun-soaked coastal city,
a getaway driver in debt, and six missions to buy her freedom. Everything in it is
original: the city of Solmar, its people, its story, its art and its sound. No Rockstar
names, logos, characters, maps or assets.

**The story.** Dana "Deke" Reyes owes fixer Vera Solano $5,000. To pay it off she steals
cars, runs packages across Solmar, drives getaway jobs, settles a score with rival
Marcus Kade's crew, pulls one big score — and delivers the payoff while the whole
Solmar PD is on her tail.

## Play it

```sh
node serve.ts
```

Then open <http://localhost:8080> in a desktop browser. The game runs entirely offline
from the static files under `game/` — no network requests, no downloads.

## Controls

| Keys | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse (drag) | Look around |
| Shift | Run |
| Space | Jump / handbrake |
| E | Steal / enter a car, exit a car, pick up a package |
| Click | Shoot (pistol) |
| F | Punch |
| R | Reload |
| P / Esc | Pause |
| M | Mute |

## Systems

- **Open world** — a 9×9-block coastal city: downtown towers, beachfront hotels, a
  marina with piers and boats, palms, streetlights and a bay to the south. On foot and
  by car, with a day clock that moves the sun.
- **Traffic and pedestrians** — cars follow the street grid, slow for the car ahead
  and turn at intersections; pedestrians walk the sidewalks and flee fast cars.
- **Stealing cars** — walk up to a parked car or jack one out of traffic (the cops
  notice the second one).
- **Wanted system** — 0 to 5 stars. Police cars chase and ram; cops on foot run you
  down and arrest you. Stay out of sight and the heat cools off.
- **Missions and story** — six missions with dialogue, a beacon marker and rewards
  ($300–$2,500): First Wheels, The Pickup, Getaway Driver, Rival Heat, The Big Score,
  Paying the Debt.
- **Combat** — a pistol with a 12-round magazine and reload, punches, and armed rival
  gang members who shoot back.
- **Side activities** — 20 cash stashes hidden around the city and taxi fares from the
  stand by the Solmar Grand.
- **HUD and polish** — live minimap with traffic, police and mission markers, wanted
  stars, money, health, clock, speedometer and objective feed; title, pause and end
  screens; a save in `localStorage` that resumes your money and mission.
- **Sound** — synthesized WebAudio only: a sunset chord-pad score, engine hum, sirens,
  gunshots, pickups and stings. No audio files.

## Tech

- `game/index.html` — entry point and HUD.
- `game/src/` — one module per system: `city`, `player`, `vehicles`, `pedestrians`,
  `wanted`, `missions`, `combat`, `activities`, `hud`, `audio`, `textures`, `shots`,
  `input`, `util`, `main`.
- `game/vendor/three.module.min.js` — three.js r160, vendored.
- `main.ts` — the make.fun entry program: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json`.

Screenshots in `screenshots/` are real captures of the game running
(`?shot=start|drive|chase|mission`). A playable build is also live at
<https://roseszy.github.io/gta6-01/game/>.

## License

MIT — see [LICENSE](LICENSE).
