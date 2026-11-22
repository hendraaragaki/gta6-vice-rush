// Solmar Bay — the wanted system: stars, police response, roadblocks, helicopter,
// CCTV "filmed" pressure, cooling down and busts.
import { WANTED, CAR_TYPES } from './config.js';
import { Car } from './entities.js';
import { nearestRoadPoint } from './world.js';

export class Police {
  constructor(game) {
    this.game = game;
    this.cops = [];
    this.heli = null;
    this.timeSinceCrime = 999;
    this.cooling = false;
    this.coolTimer = 0;
    this.spawnTimer = 0;
  }

  wanted() { return this.game.wanted; }

  addHeat(stars, reason) {
    const g = this.game;
    if (g.wanted >= 5) return;
    g.wanted = Math.min(5, g.wanted + stars);
    this.timeSinceCrime = 0;
    this.cooling = false;
    if (reason) g.toast(`${reason} — wanted level ${g.wanted}`, 2200);
    g.audio.phone && g.audio.siren(true);
  }

  update(dt) {
    const g = this.game;
    const player = g.player;
    this.timeSinceCrime += dt;

    // Cooling down: no crime and no cop close for a while.
    const nearestCop = this.cops.reduce((m, c) => Math.min(m, Math.hypot(c.x - player.x, c.y - player.y)), Infinity);
    if (g.wanted > 0 && this.timeSinceCrime > WANTED.decayDelay && nearestCop > 420) {
      if (!this.cooling) { this.cooling = true; this.coolTimer = 0; g.showCooldown(true); }
      this.coolTimer += dt;
      if (this.coolTimer > WANTED.decayStep) {
        this.coolTimer = 0;
        g.wanted -= 1;
        g.toast(g.wanted > 0 ? `Heat dropping… ${g.wanted} star${g.wanted > 1 ? 's' : ''} left` : 'You lost them. Clean.', 2000);
        if (g.wanted === 0) { this.cooling = false; g.showCooldown(false); }
      }
    } else if (this.cooling) {
      this.cooling = false;
      g.showCooldown(false);
    }

    // Desired cop count by wanted level.
    const want = WANTED.maxCops[g.wanted] || 0;
    this.spawnTimer -= dt;
    if (this.cops.length < want && this.spawnTimer <= 0) {
      this.spawnTimer = 1.6;
      this.spawnCop();
    }
    // Extra cops despawn when the heat drops.
    while (this.cops.length > want) {
      const c = this.cops.pop();
      c.dead = true;
      g.cars = g.cars.filter((car) => car !== c);
    }

    // Helicopter at 3+ stars.
    if (g.wanted >= 3) {
      if (!this.heli) { this.heli = new (g.HelicopterClass)(); this.heli.active = true; g.toast('SAPD helicopter overhead — stay out of the spotlight', 2600); }
      this.heli.update(dt, g);
    } else if (this.heli) {
      this.heli.active = false;
      this.heli = null;
    }

    // Siren when any cop is near.
    g.audio.siren(this.cops.some((c) => Math.hypot(c.x - player.x, c.y - player.y) < 700));

    // Bust pressure: a cop touching the player fills it; it drains otherwise.
    if (g.bustPressure > 0) {
      const touching = this.cops.some((c) => Math.hypot(c.x - player.x, c.y - player.y) < 60);
      if (!touching) g.bustPressure = Math.max(0, g.bustPressure - dt * 0.7);
      if (g.bustPressure >= WANTED.bustTime) g.onBusted();
    }
    g.updateBustMeter();

    // Roadblocks at 3+ stars: a parked police car ahead on the player's road.
    if (g.wanted >= 3 && Math.random() < dt * 0.12) this.placeRoadblock();
  }

  spawnCop() {
    const g = this.game;
    const p = g.player;
    const angle = Math.random() * Math.PI * 2;
    const px = p.x + Math.cos(angle) * 900;
    const py = p.y + Math.sin(angle) * 900;
    const road = nearestRoadPoint(px, py);
    const x = road ? road.x : px;
    const y = road ? road.y : py;
    const cop = new Car(x, y, Math.random() * Math.PI * 2, 'police', { ai: 'chase', occupied: true });
    this.cops.push(cop);
    g.cars.push(cop);
  }

  placeRoadblock() {
    const g = this.game;
    const p = g.player;
    if (!p.inCar) return;
    // Ahead of the player's heading, on the same road.
    const ahead = 520;
    const x = p.x + Math.cos(p.angle) * ahead;
    const y = p.y + Math.sin(p.angle) * ahead;
    if (g.cars.some((c) => Math.hypot(c.x - x, c.y - y) < 200)) return;
    const block = new Car(x, y, p.angle + Math.PI / 2, 'police', { occupied: true });
    block.speed = 0;
    g.cars.push(block);
    g.roadblocks.push(block);
    g.toast('Roadblock ahead!', 1800);
  }

  clearAll() {
    for (const c of this.cops) c.dead = true;
    this.cops = [];
    this.game.cars = this.game.cars.filter((c) => !c.isPolice);
    this.game.roadblocks = [];
    if (this.heli) { this.heli.active = false; this.heli = null; }
    this.game.audio.siren(false);
  }

  // CCTV: committing a crime inside a camera cone raises heat faster and flags FILMED.
  checkCctv(crimeX, crimeY) {
    const g = this.game;
    for (const cam of g.city.cctv) {
      const d = Math.hypot(cam.x - crimeX, cam.y - crimeY);
      if (d < cam.range) {
        g.filmedTimer = 4;
        g.showFilmed(true);
        return true;
      }
    }
    return false;
  }
}
