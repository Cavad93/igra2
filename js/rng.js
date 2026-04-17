// js/rng.js — Mulberry32: детерминированный 32-битный PRNG
// Источник: https://stackoverflow.com/a/47593316

export function seededRNG(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6D2B79F5;
    s >>>= 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
