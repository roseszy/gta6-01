// HUD: stars, money, health, clock, objective, event feed, live minimap,
// speedometer, weapon line, controls hint and centre-screen toasts.
// All DOM is built here; main.js calls the setters once per frame.

import { fmtMoney, formatClock, clamp } from './util.js';
import { SIZE } from './city.js';

function el(tag, id, parent, text) {
  const e = document.createElement(tag);
  if (id) e.id = id;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

export class HUD {
  constructor() {
    this.root = el('div', 'hud', document.getElementById('app'));
    this.root.innerHTML = '';

    const topLeft = el('div', 'hud-topleft', this.root);
    this.starsEl = el('div', 'hud-stars', topLeft, '☆☆☆☆☆');
    this.moneyEl = el('div', 'hud-money', topLeft, '$0');
    this.healthWrap = el('div', 'hud-health', topLeft);
    this.healthBar = el('div', 'hud-healthbar', this.healthWrap);
    this.clockEl = el('div', 'hud-clock', topLeft, '14:00 · Solmar Bay · Day 1');

    const topCenter = el('div', 'hud-topcenter', this.root);
    this.objectiveTitle = el('div', 'hud-objective-title', topCenter, 'FREE ROAM');
    this.objectiveText = el('div', 'hud-objective-text', topCenter, '');
    this.objectiveDist = el('div', 'hud-objective-dist', topCenter, '');

    this.feedEl = el('div', 'hud-feed', this.root);
    this.minimap = el('canvas', 'hud-minimap', this.root);
    this.minimap.width = 220;
    this.minimap.height = 220;
    this.mapCtx = this.minimap.getContext('2d');

    const bottomRight = el('div', 'hud-bottomright', this.root);
    this.speedEl = el('div', 'hud-speed', bottomRight, '');
    this.weaponEl = el('div', 'hud-weapon', bottomRight, 'PISTOL · 12 / ∞');
    this.hintEl = el('div', 'hud-hint', this.root, 'WASD move · Shift run · E enter car · F punch / Click shoot · R reload · Esc pause');

    this.toastEl = el('div', 'hud-toast', this.root);
    this.toastTimer = null;
    this.clockMinutes = 14 * 60;
  }

  setStars(n) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    this.starsEl.textContent = s;
    this.starsEl.classList.toggle('hot', n > 0);
  }

  setMoney(n) {
    this.moneyEl.textContent = fmtMoney(n);
  }

  setHealth(h) {
    this.healthBar.style.width = clamp(h, 0, 100) + '%';
    this.healthBar.classList.toggle('low', h < 30);
  }

  setClock(minutes) {
    this.clockMinutes = minutes;
    this.clockEl.textContent = `${formatClock(minutes)} · Solmar Bay · Day 1`;
  }

  setObjective(title, text, distText) {
    this.objectiveTitle.textContent = title;
    this.objectiveText.textContent = text;
    this.objectiveDist.textContent = distText || '';
  }

  setSpeed(mph) {
    this.speedEl.textContent = mph > 0.5 ? Math.round(mph) + ' MPH' : '';
  }

  setWeapon(text) {
    this.weaponEl.textContent = text;
  }

  feed(msg) {
    const line = el('div', 'hud-feedline', this.feedEl, msg);
    while (this.feedEl.children.length > 5) this.feedEl.removeChild(this.feedEl.firstChild);
    setTimeout(() => {
      if (line.parentNode) line.classList.add('fade');
    }, 5000);
  }

  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 2600);
  }

  // Live minimap: sea, city, roads, anchors, beacon, cars and the player arrow.
  drawMinimap(state) {
    const ctx = this.mapCtx;
    const S = 220;
    const scale = S / (SIZE + 60);
    const ox = 14;
    const oz = 14;
    const px = (x) => (x + ox) * scale;
    const pz = (z) => (z + oz) * scale;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#1d5a8f';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#7a8a5a';
    ctx.fillRect(px(-20), pz(-20), (SIZE + 40) * scale, (SIZE + 40) * scale);
    ctx.fillStyle = '#e8d5a3';
    ctx.fillRect(px(-20), pz(SIZE), (SIZE + 40) * scale, 34 * scale);
    ctx.fillRect(px(SIZE), pz(-20), 34 * scale, (SIZE + 40) * scale);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 9; i++) {
      const c = i * 54;
      ctx.beginPath();
      ctx.moveTo(px(0), pz(c));
      ctx.lineTo(px(SIZE), pz(c));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px(c), pz(0));
      ctx.lineTo(px(c), pz(SIZE));
      ctx.stroke();
    }
    // Anchors.
    ctx.fillStyle = '#ffffff';
    for (const key of Object.keys(state.anchors)) {
      const a = state.anchors[key];
      ctx.beginPath();
      ctx.arc(px(a.x), pz(a.z), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Beacon.
    if (state.beacon) {
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(px(state.beacon.x), pz(state.beacon.z), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(px(state.beacon.x), pz(state.beacon.z), 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Traffic + cruisers.
    ctx.fillStyle = '#dddddd';
    for (const c of state.cars || []) {
      ctx.fillRect(px(c.x) - 1.5, pz(c.z) - 1.5, 3, 3);
    }
    ctx.fillStyle = '#ff5566';
    for (const c of state.cruisers || []) {
      ctx.fillRect(px(c.x) - 2, pz(c.z) - 2, 4, 4);
    }
    // Player arrow.
    ctx.save();
    ctx.translate(px(state.playerX), pz(state.playerZ));
    ctx.rotate(state.playerYaw);
    ctx.fillStyle = '#39d353';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
