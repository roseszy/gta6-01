// Procedural canvas textures: building facades, asphalt roads and sand.
// All textures are generated at run time from a 2D canvas, so the game needs
// no image files and no network requests.

import * as THREE from 'three';

function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// A pastel facade with a grid of windows, some lit, some dark.
export function makeBuildingTexture(baseColor) {
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, w, h);
    // Subtle vertical shading so flat walls read as panels.
    for (let x = 0; x < w; x += 32) {
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      ctx.fillRect(x, 0, 2, h);
    }
    const cols = 4;
    const rows = 8;
    const cw = w / cols;
    const ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = ((r * 7 + c * 3) % 5) === 0;
        ctx.fillStyle = lit ? '#ffe9a8' : 'rgba(20,30,50,0.55)';
        ctx.fillRect(c * cw + 6, r * ch + 8, cw - 12, ch - 16);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(c * cw + 6, r * ch + 8, cw - 12, 3);
      }
    }
    // Ground-floor shopfront band.
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, h - 26, w, 26);
  });
}

// Dark asphalt with a dashed centre line and faint tyre wear.
export function makeRoadTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#33363b';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i++) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    ctx.fillStyle = '#e8d24a';
    ctx.fillRect(w / 2 - 2, 0, 4, 34);
    ctx.fillRect(w / 2 - 2, 64, 4, 34);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(4, 0, 2, h);
    ctx.fillRect(w - 6, 0, 2, h);
  });
}

// Pale sand with speckles.
export function makeSandTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#e8d5a3';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 320; i++) {
      const shade = Math.random() < 0.5 ? 'rgba(120,90,40,0.12)' : 'rgba(255,255,255,0.18)';
      ctx.fillStyle = shade;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
}

// Flat sea blue with a soft light gradient, for the water plane.
export function makeWaterTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#2f7fc2');
    grad.addColorStop(1, '#1d5a8f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    for (let y = 12; y < h; y += 22) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const yy = y + Math.sin(x * 0.2 + y) * 2;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  });
}
