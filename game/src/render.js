// Solmar Bay — canvas rendering: the city, actors, effects and the minimap.
// Sun-soaked by day, neon by night. Everything is drawn in code — no images.
import { TILE, WORLD_W, WORLD_H, ROADS_V, ROADS_H, ROAD_W, BEACH_X, CAR_TYPES, clamp, lerp } from './config.js';

export class Renderer {
  constructor(game) {
    this.game = game;
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.minimap = document.getElementById('minimap');
    this.mctx = this.minimap.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
  }

  // timeOfDay: 0..1 (0 dawn, .25 noon, .5 dusk, .75 night). Returns a light tint.
  lightFor(t) {
    if (t < 0.2) return { tint: 'rgba(255,170,90,0.10)', neon: 0.2, dark: 0.05 };
    if (t < 0.45) return { tint: 'rgba(255,255,255,0)', neon: 0, dark: 0 };
    if (t < 0.6) return { tint: 'rgba(255,110,80,0.16)', neon: 0.5, dark: 0.08 };
    if (t < 0.85) return { tint: 'rgba(20,16,70,0.34)', neon: 1, dark: 0.3 };
    return { tint: 'rgba(255,150,90,0.12)', neon: 0.4, dark: 0.06 };
  }

  draw(dt) {
    const g = this.game;
    const ctx = this.ctx;
    const cam = g.camera;
    const light = this.lightFor(g.timeOfDay);
    ctx.clearRect(0, 0, this.vw, this.vh);
    ctx.save();
    ctx.translate(-cam.x + this.vw / 2, -cam.y + this.vh / 2);

    const vx0 = cam.x - this.vw / 2 - 80, vy0 = cam.y - this.vh / 2 - 80;
    const vx1 = cam.x + this.vw / 2 + 80, vy1 = cam.y + this.vh / 2 + 80;

    this.drawGround(ctx, vx0, vy0, vx1, vy1, light);
    this.drawRoads(ctx, vx0, vy0, vx1, vy1);
    this.drawParks(ctx, vx0, vy0, vx1, vy1);
    this.drawSkids(ctx);
    this.drawBuildings(ctx, vx0, vy0, vx1, vy1, light);
    this.drawPalms(ctx, vx0, vy0, vx1, vy1);
    this.drawPickups(ctx);
    this.drawCars(ctx, vx0, vy0, vx1, vy1, light);
    this.drawPeds(ctx, vx0, vy0, vx1, vy1);
    this.drawPlayer(ctx, light);
    this.drawBullets(ctx);
    this.drawParticles(ctx);
    this.drawCctv(ctx, vx0, vy0, vx1, vy1, light);
    this.drawMarker(ctx);
    this.drawHeli(ctx, light);

    ctx.restore();

    // Lighting tint + night vignette.
    if (light.tint !== 'rgba(255,255,255,0)') {
      ctx.fillStyle = light.tint;
      ctx.fillRect(0, 0, this.vw, this.vh);
    }
    if (light.dark > 0.1) {
      const grad = ctx.createRadialGradient(this.vw / 2, this.vh / 2, Math.min(this.vw, this.vh) * 0.35,
        this.vw / 2, this.vh / 2, Math.max(this.vw, this.vh) * 0.75);
      grad.addColorStop(0, 'rgba(0,0,10,0)');
      grad.addColorStop(1, `rgba(0,0,20,${light.dark})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.vw, this.vh);
    }
    this.drawMinimap();
  }

  drawGround(ctx, x0, y0, x1, y1, light) {
    // Ocean (west), sand, then grass base.
    ctx.fillStyle = '#5da24a';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    if (x0 < BEACH_X) {
      ctx.fillStyle = '#1e7fa8';
      ctx.fillRect(x0, y0, Math.min(BEACH_X, x1) - x0, y1 - y0);
      // Animated wave lines.
      const t = this.game.time * 1.2;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 3;
      for (let y = Math.floor(y0 / 90) * 90; y < y1; y += 90) {
        ctx.beginPath();
        for (let x = Math.max(x0, 0); x < Math.min(BEACH_X, x1); x += 24) {
          const yy = y + Math.sin(x * 0.02 + t + y * 0.05) * 5;
          if (x === Math.max(x0, 0)) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.fillStyle = '#e8d29a';
      ctx.fillRect(BEACH_X, y0, 160, y1 - y0);
    }
    // Sidewalks along roads.
    ctx.fillStyle = '#9aa0a8';
    for (const rx of ROADS_V) {
      if (rx + 90 < x0 || rx - 90 > x1) continue;
      ctx.fillRect(rx - ROAD_W / 2 - 14, y0, ROAD_W + 28, y1 - y0);
    }
    for (const ry of ROADS_H) {
      if (ry + 90 < y0 || ry - 90 > y1) continue;
      ctx.fillRect(x0, ry - ROAD_W / 2 - 14, x1 - x0, ROAD_W + 28);
    }
  }

  drawRoads(ctx, x0, y0, x1, y1) {
    ctx.fillStyle = '#33363e';
    for (const rx of ROADS_V) {
      if (rx + 60 < x0 || rx - 60 > x1) continue;
      ctx.fillRect(rx - ROAD_W / 2, y0, ROAD_W, y1 - y0);
    }
    for (const ry of ROADS_H) {
      if (ry + 60 < y0 || ry - 60 > y1) continue;
      ctx.fillRect(x0, ry - ROAD_W / 2, x1 - x0, ROAD_W);
    }
    // Centre dashes.
    ctx.fillStyle = '#d8c84a';
    for (const rx of ROADS_V) {
      if (rx < x0 || rx > x1) continue;
      for (let y = Math.floor(y0 / 64) * 64; y < y1; y += 64) ctx.fillRect(rx - 2, y, 4, 30);
    }
    for (const ry of ROADS_H) {
      if (ry < y0 || ry > y1) continue;
      for (let x = Math.floor(x0 / 64) * 64; x < x1; x += 64) ctx.fillRect(x, ry - 2, 30, 4);
    }
  }

  drawParks(ctx, x0, y0, x1, y1) {
    for (const p of this.game.city.parks) {
      if (p.x > x1 || p.x + p.w < x0 || p.y > y1 || p.y + p.h < y0) continue;
      ctx.fillStyle = '#3f7a34';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = '#c9c2b2';
      ctx.fillRect(p.x + p.w / 2 - 3, p.y, 6, p.h);
    }
  }

  drawSkids(ctx) {
    ctx.strokeStyle = 'rgba(15,15,18,0.5)';
    ctx.lineWidth = 5;
    for (const s of this.game.skids) {
      ctx.beginPath();
      ctx.moveTo(s.x - Math.cos(s.a) * 14, s.y - Math.sin(s.a) * 14);
      ctx.lineTo(s.x + Math.cos(s.a) * 14, s.y + Math.sin(s.a) * 14);
      ctx.stroke();
    }
  }

  drawBuildings(ctx, x0, y0, x1, y1, light) {
    const night = light.neon;
    for (const b of this.game.city.buildings) {
      if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x, b.y + b.h - 10, b.w, 10);
      ctx.fillRect(b.x + b.w - 10, b.y, 10, b.h);
      // Windows: lit at night.
      ctx.fillStyle = night > 0.4 ? 'rgba(255,220,120,0.85)' : 'rgba(30,40,60,0.5)';
      for (let wx = b.x + 14; wx < b.x + b.w - 14; wx += 26) {
        for (let wy = b.y + 14; wy < b.y + b.h - 14; wy += 26) {
          if (((wx * 7 + wy * 13) % 5) < 2) ctx.fillRect(wx, wy, 12, 14);
        }
      }
      if (b.kind === 'tower') {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, 8);
      }
    }
    for (const h of this.game.city.houses) {
      if (h.x > x1 || h.x + h.w < x0 || h.y > y1 || h.y + h.h < y0) continue;
      ctx.fillStyle = '#e8dcc8';
      ctx.fillRect(h.x, h.y, h.w, h.h);
      ctx.fillStyle = h.color;
      ctx.beginPath();
      ctx.moveTo(h.x - 6, h.y + 18);
      ctx.lineTo(h.x + h.w / 2, h.y - 16);
      ctx.lineTo(h.x + h.w + 6, h.y + 18);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = night > 0.4 ? 'rgba(255,220,120,0.9)' : 'rgba(30,40,60,0.6)';
      ctx.fillRect(h.x + h.w / 2 - 8, h.y + h.h / 2, 16, 20);
    }
  }

  drawPalms(ctx, x0, y0, x1, y1) {
    for (const p of this.game.city.palms) {
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      ctx.strokeStyle = '#6b4a2a';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 3, p.y - 22); ctx.stroke();
      ctx.fillStyle = '#2e7a3a';
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.55;
        ctx.beginPath();
        ctx.ellipse(p.x + 3 + Math.cos(a) * 12, p.y - 22 + Math.sin(a) * 8, 13, 4, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawPickups(ctx) {
    for (const bag of this.game.cashBags) {
      const bob = Math.sin(this.game.time * 5 + bag.x) * 3;
      ctx.fillStyle = '#2e7a3a';
      ctx.fillRect(bag.x - 12, bag.y - 10 + bob, 24, 18);
      ctx.fillStyle = '#ffd23e';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', bag.x, bag.y + 4 + bob);
    }
    for (const h of this.game.healthPacks) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(h.x - 12, h.y - 12, 24, 24);
      ctx.fillStyle = '#e83a3a';
      ctx.fillRect(h.x - 8, h.y - 3, 16, 6);
      ctx.fillRect(h.x - 3, h.y - 8, 6, 16);
    }
  }

  drawCarShape(ctx, car, light) {
    const type = CAR_TYPES[car.type];
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const w = type.w, l = type.l;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-l / 2 + 3, -w / 2 + 4, l, w);
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(-l / 2, -w / 2, l, w, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(20,30,50,0.85)';
    ctx.beginPath();
    ctx.roundRect(-l * 0.18, -w / 2 + 5, l * 0.36, w - 10, 5);
    ctx.fill();
    // Headlights.
    ctx.fillStyle = '#fff8c0';
    ctx.fillRect(l / 2 - 3, -w / 2 + 4, 3, 7);
    ctx.fillRect(l / 2 - 3, w / 2 - 11, 3, 7);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-l / 2, -w / 2 + 4, 3, 7);
    ctx.fillRect(-l / 2, w / 2 - 11, 3, 7);
    if (car.isPolice) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SAPD', 0, 3);
      // Flashing light bar.
      const phase = Math.sin(this.game.time * 14 + car.lightPhase) > 0;
      ctx.fillStyle = phase ? '#ff2e2e' : '#2e6bff';
      ctx.fillRect(-6, -w / 2 - 2, 12, 5);
      ctx.fillStyle = phase ? '#2e6bff' : '#ff2e2e';
      ctx.fillRect(-6, w / 2 - 3, 12, 5);
      if (light.neon > 0.4) {
        ctx.fillStyle = phase ? 'rgba(255,46,46,0.25)' : 'rgba(46,107,255,0.25)';
        ctx.beginPath(); ctx.arc(0, 0, 70, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (car.type === 'taxi') {
      ctx.fillStyle = '#111';
      ctx.fillRect(-8, -w / 2 - 1, 16, 6);
    }
    ctx.restore();
  }

  drawCars(ctx, x0, y0, x1, y1, light) {
    for (const car of this.game.cars) {
      if (car.dead) continue;
      if (car.x < x0 - 80 || car.x > x1 + 80 || car.y < y0 - 80 || car.y > y1 + 80) continue;
      this.drawCarShape(ctx, car, light);
    }
  }

  drawPeds(ctx, x0, y0, x1, y1) {
    for (const p of this.game.peds) {
      if (p.dead) continue;
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      const wob = Math.sin(p.walkPhase) * 2;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8b98a';
      ctx.beginPath(); ctx.arc(4, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (p.fleeing > 0) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('!', p.x, p.y - 16 + wob);
      }
    }
  }

  drawPlayer(ctx, light) {
    const g = this.game;
    const p = g.player;
    if (p.inCar) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 4, 14, 9, 0, 0, Math.PI * 2); ctx.fill();
    // Body.
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.shirt;
    ctx.beginPath(); ctx.arc(3, 0, 8, 0, Math.PI * 2); ctx.fill();
    // Facing: head + gun.
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath(); ctx.arc(8, 0, 6, 0, Math.PI * 2); ctx.fill();
    if (p.hasGun) {
      ctx.fillStyle = '#222';
      ctx.fillRect(10, -2, 14, 4);
      if (g.muzzleTimer > 0) {
        ctx.fillStyle = '#ffd23e';
        ctx.beginPath(); ctx.arc(28, 0, 8 + Math.random() * 5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    // Name tag.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.who === 'cole' ? 'COLE' : 'LENA', p.x, p.y - 20);
  }

  drawBullets(ctx) {
    ctx.fillStyle = '#ffe27a';
    for (const b of this.game.bullets) {
      ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawParticles(ctx) {
    for (const pt of this.game.particles) {
      ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }

  drawCctv(ctx, x0, y0, x1, y1, light) {
    for (const cam of this.game.city.cctv) {
      if (cam.x < x0 || cam.x > x1 || cam.y < y0 || cam.y > y1) continue;
      ctx.fillStyle = '#222';
      ctx.fillRect(cam.x - 4, cam.y - 4, 8, 8);
      // Small faint watch-cone — no long lines across the map.
      ctx.fillStyle = 'rgba(255,80,80,0.10)';
      ctx.beginPath();
      ctx.moveTo(cam.x, cam.y);
      ctx.arc(cam.x, cam.y, 90, cam.angle - 0.4, cam.angle + 0.4);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawMarker(ctx) {
    const g = this.game;
    const m = g.marker;
    if (!m) return;
    const pulse = 1 + Math.sin(g.time * 4) * 0.12;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.scale(pulse, pulse);
    ctx.strokeStyle = '#ffd23e';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,210,62,0.2)';
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.moveTo(0, -44); ctx.lineTo(10, -26); ctx.lineTo(-10, -26);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  drawHeli(ctx, light) {
    const g = this.game;
    const heli = g.police.heli;
    if (!heli || !heli.active) return;
    // Spotlight on the player.
    const grad = ctx.createRadialGradient(g.player.x, g.player.y, 10, g.player.x, g.player.y, 190);
    grad.addColorStop(0, 'rgba(255,255,200,0.35)');
    grad.addColorStop(1, 'rgba(255,255,200,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(g.player.x, g.player.y, 190, 0, Math.PI * 2); ctx.fill();
    // The helicopter itself.
    ctx.save();
    ctx.translate(heli.x, heli.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(4, 6, 26, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#20242e';
    ctx.beginPath(); ctx.ellipse(0, 0, 24, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 3;
    const spin = this.game.time * 30;
    ctx.beginPath();
    ctx.moveTo(Math.cos(spin) * 34, Math.sin(spin) * 34);
    ctx.lineTo(-Math.cos(spin) * 34, -Math.sin(spin) * 34);
    ctx.stroke();
    ctx.fillStyle = '#ff2e2e';
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  drawMinimap() {
    const g = this.game;
    const m = this.mctx;
    const size = 180;
    const scale = size / 3840;
    m.clearRect(0, 0, size, size);
    // Ocean + land.
    m.fillStyle = '#1e7fa8';
    m.fillRect(0, 0, size, size);
    m.fillStyle = '#3a5a34';
    m.fillRect(BEACH_X * scale, 0, size, size);
    // Roads.
    m.strokeStyle = '#888';
    m.lineWidth = 2;
    for (const rx of ROADS_V) { m.beginPath(); m.moveTo(rx * scale, 0); m.lineTo(rx * scale, size); m.stroke(); }
    for (const ry of ROADS_H) { m.beginPath(); m.moveTo(0, ry * scale); m.lineTo(size, ry * scale); m.stroke(); }
    // Marker.
    if (g.marker) {
      m.fillStyle = '#ffd23e';
      m.beginPath(); m.arc(g.marker.x * scale, g.marker.y * scale, 6, 0, Math.PI * 2); m.fill();
      m.strokeStyle = '#ffd23e';
      m.beginPath(); m.arc(g.marker.x * scale, g.marker.y * scale, 9 + Math.sin(g.time * 4) * 2, 0, Math.PI * 2); m.stroke();
    }
    // Police.
    m.fillStyle = '#2e6bff';
    for (const c of g.police.cops) { m.beginPath(); m.arc(c.x * scale, c.y * scale, 3.5, 0, Math.PI * 2); m.fill(); }
    // Player.
    m.fillStyle = '#fff';
    m.beginPath(); m.arc(g.player.x * scale, g.player.y * scale, 5, 0, Math.PI * 2); m.fill();
    m.fillStyle = g.player.color;
    m.beginPath(); m.arc(g.player.x * scale, g.player.y * scale, 3.5, 0, Math.PI * 2); m.fill();
    // View cone.
    m.strokeStyle = 'rgba(255,255,255,0.7)';
    m.lineWidth = 1.5;
    m.beginPath(); m.arc(g.player.x * scale, g.player.y * scale, 7, 0, Math.PI * 2); m.stroke();
  }
}
