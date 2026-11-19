[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/roseszy/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/roseszy/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

# Solmar Heat

A playable open-world crime game made for the
[make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01), in the spirit of GTA 6:
one sun-soaked coastal city, one getaway driver in debt, and six jobs to buy her
freedom. The city, the characters, the story, the art and the sound are all
original work — no Rockstar names, logos, characters, maps or assets anywhere.

## The story

Dana "Deke" Reyes is the best wheelwoman in Solmar Bay — and she owes fixer
Vera Solano $5,000. Across six missions she steals cars, runs packages, drives
getaways, takes on rival Marcus Kade's crew, pulls one big score, and delivers
the payoff with the whole Solmar PD in her mirrors.

## How to play

```sh
node serve.ts
```

Then open <http://localhost:8080> in a desktop browser. Everything runs offline
from the static files in `game/` — there are no network requests and nothing to
download.

| Keys | What they do |
| --- | --- |
| W A S D | Walk, or drive |
| Mouse (drag) | Look around / aim |
| Shift | Run |
| Space | Jump, or handbrake while driving |
| E | Get in a car, steal a car, get out, pick up a package |
| Click | Fire the pistol |
| F | Punch |
| R | Reload |
| P / Esc | Pause |
| M | Mute |

## What's in the game

- **The city** — 9×9 blocks of coastal Solmar: downtown towers, beachfront
  hotels, a marina with piers and boats, palms and streetlights, and a bay to
  the south. A day clock moves the sun across the sky. Explore on foot or by car.
- **Traffic and people** — cars follow the street grid, ease off for the car
  ahead and turn at intersections; pedestrians use the sidewalks and scatter
  when a car comes at them fast.
- **Car theft** — walk up to a parked car and take it, or jack one straight out
  of traffic. The second one brings the cops.
- **Wanted level** — 0 to 5 stars. Police cars chase and ram; officers on foot
  run you down and arrest you. Break line of sight and the heat cools off.
- **Six missions** — with dialogue, a golden beacon to follow and payouts of
  $300 to $2,500: First Wheels, The Pickup, Getaway Driver, Rival Heat,
  The Big Score, Paying the Debt.
- **Combat** — a pistol with a 12-round magazine and a reload, fists, and armed
  rival gang members who shoot back.
- **Side work** — 20 cash bundles hidden around the city, and taxi fares from
  the stand by the Solmar Grand.
- **HUD and polish** — a live minimap showing traffic, police and the mission
  marker, wanted stars, money, health, clock, speedometer and a message feed;
  title, pause and end screens; and a `localStorage` save that keeps your money
  and mission.
- **Sound** — 100% synthesized WebAudio: a sunset chord-pad score, engine hum,
  sirens, gunshots, pickups and stings. No audio files.

## How it's built

- `game/index.html` — the entry point and the HUD.
- `game/src/` — one module per system: `city`, `player`, `vehicles`,
  `pedestrians`, `wanted`, `missions`, `combat`, `activities`, `hud`, `audio`,
  `textures`, `shots`, `input`, `util`, `main`.
- `game/vendor/three.module.min.js` — three.js r160, vendored.
- `main.ts` — the make.fun entry program: copies `game/` and `screenshots/`
  to `/output` and writes `dossier.json`.

The shots in `screenshots/` are real captures of the running game
(`?shot=start|drive|chase|mission`). You can also play the live build at
<https://roseszy.github.io/gta6-01/game/>.

## License

MIT — see [LICENSE](LICENSE).
