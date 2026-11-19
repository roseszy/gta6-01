// Shared helpers for Solmar Heat: a seeded random stream, small vector and
// angle math, and the text formatting the HUD and the story feed use. Every
// bit of world randomness flows from one seeded stream per system, so the
// same seed always grows the same city, the same traffic and the same faces
// in the crowd.

/** A tiny deterministic generator (mulberry32). `seed` picks the stream. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mix = Math.imul(state ^ (state >>> 15), 1 | state);
    mix = (mix + Math.imul(mix ^ (mix >>> 7), 61 | mix)) ^ mix;
    return ((mix ^ (mix >>> 14)) >>> 0) / 4294967296;
  };
}

export const TAU = Math.PI * 2;

/** Pin `v` into the closed interval [lo, hi]. */
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Blend from `a` to `b` by `t` (0 gives `a`, 1 gives `b`). */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** A random float in [lo, hi) drawn from `rng`. */
export function rand(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

/** A random whole number in [lo, hi], drawn from `rng`. */
export function randInt(rng, lo, hi) {
  return Math.floor(lo + rng() * (hi - lo + 1));
}

/** One random entry of `arr`, drawn from `rng`. */
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/** Flat (x, z) distance between two points. */
export function dist2(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

/** The shortest signed turn from angle `a` to angle `b`, in radians. */
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Nudge angle `a` toward `b` by at most `step` radians. */
export function angleToward(a, b, step) {
  return a + clamp(angleDiff(a, b), -step, step);
}

/** Dollars as the HUD shows them: $5,000, $300. */
export function formatMoney(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

/** Minutes since midnight as a 24-hour clock: 14:00, 09:05. */
export function formatClock(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
