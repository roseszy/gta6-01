// Procedural textures, painted on canvases at boot: building facades with
// lit windows, asphalt, sand, water and billboard signs. Nothing is loaded
// from a file, so the game stays fully offline.
import * as THREE from 'three';
import { rand, randInt } from './util.js';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A building facade: base colour, rows of windows, some lit warm. */
export function buildingTexture(rng, base, floors, cols) {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    // Subtle vertical shading between window columns.
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 4, h);
    const ww = Math.floor((w - 16) / cols);
    const hh = Math.floor((h - 16) / floors);
    for (let r = 0; r < floors; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const lit = rng() < 0.45;
        g.fillStyle = lit ? (rng() < 0.7 ? '#ffd98a' : '#9fd8ff') : '#20283a';
        g.fillRect(10 + c * ww, 10 + r * hh, ww - 8, hh - 8);
        if (lit) {
          g.fillStyle = 'rgba(255,255,255,0.25)';
          g.fillRect(10 + c * ww, 10 + r * hh, ww - 8, 4);
        }
      }
    }
    // Ground floor: shops and doors.
    g.fillStyle = '#181c28';
    g.fillRect(0, h - 26, w, 26);
    g.fillStyle = '#3a2a1a';
    g.fillRect(w / 2 - 14, h - 26, 28, 26);
  });
}

/** A flat roof with a rim and a few rooftop boxes. */
export function roofTexture(rng, base) {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = 'rgba(255,255,255,0.10)';
    for (let i = 0; i < 5; i += 1) {
      g.fillRect(randInt(rng, 8, w - 30), randInt(rng, 8, h - 30), randInt(rng, 10, 26), randInt(rng, 8, 20));
    }
  });
}

/** Asphalt with a centre line and edge lines, tiled along a road. */
export function roadTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#33363d';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2b2e35';
    for (let i = 0; i < 40; i += 1) g.fillRect(Math.floor(Math.random() * w), Math.floor(Math.random() * h), 3, 3);
    g.fillStyle = '#c9a227';
    g.fillRect(w / 2 - 2, 0, 4, h);
    g.fillStyle = '#d8d8d8';
    g.fillRect(4, 0, 3, h);
    g.fillRect(w - 7, 0, 3, h);
  });
}

/** Pale sidewalk slabs. */
export function sidewalkTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#9a938a';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i += 1) {
      g.beginPath(); g.moveTo(0, (i * h) / 4); g.lineTo(w, (i * h) / 4); g.stroke();
      g.beginPath(); g.moveTo((i * w) / 4, 0); g.lineTo((i * w) / 4, h); g.stroke();
    }
  });
}

/** Warm beach sand with a few speckles. */
export function sandTexture(rng) {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#e8cf9e';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i += 1) {
      g.fillStyle = rng() < 0.5 ? 'rgba(190,160,110,0.5)' : 'rgba(255,240,200,0.5)';
      g.fillRect(Math.floor(rng() * w), Math.floor(rng() * h), 2, 2);
    }
  });
}

/** A billboard sign with big text (hotel, garage, club names). */
export function signTexture(text, sub, bg, fg) {
  return canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = fg;
    g.lineWidth = 6;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg;
    g.font = '900 56px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, sub ? h / 2 - 14 : h / 2);
    if (sub) {
      g.font = '600 26px system-ui, sans-serif';
      g.fillText(sub, w / 2, h / 2 + 34);
    }
  });
}
