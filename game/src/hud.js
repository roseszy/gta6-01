// The HUD: wanted stars, money, health, clock, mission objective, message
// feed, speedometer, and a live 2D minimap painted from the world each
// frame. It only touches the DOM; all game state lives in main.js.
import { formatClock, formatMoney } from './util.js';
import { CITY, PITCH } from './city.js';

export class Hud {
  constructor() {
    this.el = document.getElementById('hud');
    this.starsEl = document.getElementById('stars');
    this.moneyEl = document.getElementById('money');
    this.healthEl = document.getElementById('health-bar');
    this.clockEl = document.getElementById('clock');
    this.dayEl = document.getElementById('day-label');
    this.objTitle = document.getElementById('objective-title');
    this.objText = document.getElementById('objective-text');
    this.objDist = document.getElementById('objective-dist');
    this.feedEl = document.getElementById('feed');
    this.speedo = document.getElementById('speedo');
    this.speedEl = document.getElementById('speed');
    this.weaponEl = document.getElementById('weapon');
    this.crosshair = document.getElementById('crosshair');
    this.toastEl = document.getElementById('toast');
    this.map = document.getElementById('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.toastTimer = 0;
    this.lastStars = -1;
    this.lastMoney = -1;
  }

  show() {
    this.el.classList.remove('hidden');
  }

  hide() {
    this.el.classList.add('hidden');
  }

  /** Push a line onto the message feed (keeps the last four, fades after 9 s). */
  feed(text) {
    const div = document.createElement('div');
    div.textContent = text;
    this.feedEl.prepend(div);
    while (this.feedEl.children.length > 4) this.feedEl.lastChild.remove();
    setTimeout(() => div.remove(), 9000);
  }

  /** Big centre-screen announcement with a smaller line under it. */
  toast(title, sub, seconds = 2.6) {
    this.toastEl.innerHTML = title + (sub ? `<small>${sub}</small>` : '');
    this.toastTimer = seconds;
  }

  update(dt, s) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.textContent = '';
    }
    if (s.stars !== this.lastStars) {
      this.lastStars = s.stars;
      let html = '';
      for (let i = 0; i < 5; i += 1) {
        html += `<span class="${i < s.stars ? '' : 'off'}">★</span>`;
      }
      this.starsEl.innerHTML = html;
    }
    if (s.money !== this.lastMoney) {
      this.lastMoney = s.money;
      this.moneyEl.textContent = formatMoney(s.money);
    }
    this.healthEl.style.width = Math.max(0, Math.round((s.health / 100) * 100)) + '%';
    this.clockEl.textContent = formatClock(s.clockMinutes);
    this.dayEl.textContent = `Solmar Bay · Day ${s.day}`;
    this.objTitle.textContent = s.objective.title;
    this.objText.textContent = s.objective.text;
    this.objDist.textContent = s.objectiveDist || '';
    if (s.inCar) {
      this.speedo.classList.remove('hidden');
      this.speedEl.textContent = String(Math.round(Math.abs(s.speed) * 2.2));
      this.weaponEl.textContent = `PISTOL · ${s.ammo} / ∞`;
    } else {
      this.speedo.classList.add('hidden');
    }
    this.crosshair.classList.toggle('hidden', s.inCar || !s.aiming);
    this.renderMinimap(s);
  }

  /** The 2D minimap: streets, blocks, water, markers, cars, the player. */
  renderMinimap(s) {
    const ctx = this.mapCtx;
    const W = this.map.width;
    const scale = W / (CITY + 120);
    const px = (x, z) => [10 + x * scale, 10 + z * scale];
    ctx.clearRect(0, 0, W, W);
    // Bay and beach along the bottom edge.
    const [, waterTop] = px(0, CITY + 14);
    const [, sandTop] = px(0, CITY);
    ctx.fillStyle = '#1e7fa8';
    ctx.fillRect(0, waterTop, W, W - waterTop);
    ctx.fillStyle = '#e8cf9e';
    ctx.fillRect(0, sandTop, W, waterTop - sandTop);
    // Streets as thick grey lines.
    ctx.strokeStyle = '#5a6b7d';
    ctx.lineWidth = Math.max(1, 13 * scale);
    for (let i = 0; i <= 9; i += 1) {
      const [x0, y0] = px(i * PITCH, 0);
      const [x1, y1] = px(i * PITCH, CITY);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      const [ax, ay] = px(0, i * PITCH);
      const [bx, by] = px(CITY, i * PITCH);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    // City blocks as dark squares.
    ctx.fillStyle = '#2c3a4d';
    for (let i = 0; i < 9; i += 1) {
      for (let j = 0; j < 9; j += 1) {
        const [x, y] = px(i * PITCH + 8, j * PITCH + 8);
        ctx.fillRect(x, y, (PITCH - 16) * scale, (PITCH - 16) * scale);
      }
    }
    // Uncollected cash as green dots.
    ctx.fillStyle = '#7dff9a';
    for (const c of s.cash) {
      const [x, y] = px(c.x, c.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // Mission marker: a pulsing yellow diamond.
    if (s.marker) {
      const [x, y] = px(s.marker.x, s.marker.z);
      const r = 5 + Math.sin(performance.now() * 0.006) * 2;
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.fill();
    }
    // Waiting taxi passenger as a blue dot.
    if (s.fareWaiting) {
      const [x, y] = px(s.fareWaiting.x, s.fareWaiting.z);
      ctx.fillStyle = '#4dd8ff';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Traffic as small yellow squares.
    ctx.fillStyle = '#ffd23e';
    for (const c of s.traffic) {
      const [x, y] = px(c.x, c.z);
      ctx.fillRect(x - 1, y - 1, 2.5, 2.5);
    }
    // Police as flashing blue/red circles.
    const flash = Math.floor(performance.now() / 300) % 2 === 0;
    ctx.fillStyle = flash ? '#3a7bff' : '#ff3a3a';
    for (const c of s.police) {
      const [x, y] = px(c.x, c.z);
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player: a white arrow pointing where they face.
    const [pxx, pyy] = px(s.playerX, s.playerZ);
    ctx.save();
    ctx.translate(pxx, pyy);
    ctx.rotate(s.playerYaw);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // North tick.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('N', W - 14, 14);
  }
}
