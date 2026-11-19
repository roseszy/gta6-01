// Small helpers: clamping, distances, money formatting and a seeded RNG.
// Nothing here touches the DOM, so the logic checks can import it in Node.

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist2(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return Math.hypot(dx, dz);
}

// Angle lerp along the shortest arc, for smooth heading turns.
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function fmtMoney(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

// Deterministic PRNG (mulberry32). Same seed -> same sequence.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

export function rngPick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function rngRange(rng, min, max) {
  return min + rng() * (max - min);
}

// FNV-1a hash of a string into a uint32, for turning "?seed=" text into a number.
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Game clock: minutes since midnight -> "14:00".
export function formatClock(totalMinutes) {
  const m = Math.floor(totalMinutes) % (24 * 60);
  const h = Math.floor(m / 60);
  const min = m % 60;
  return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
}
