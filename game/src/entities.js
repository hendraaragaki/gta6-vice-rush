// Solmar Bay — actors: the two protagonists, cars (traffic / parked / police),
// pedestrians, bullets and the police helicopter.
import { CAR_TYPES, PLAYER, clamp, dist2, rand } from './config.js';
import { collideBuildings, nearestRoadPoint } from './world.js';

let nextId = 1;

export class Player {
  constructor(x, y, who) {
    this.id = nextId++;
    this.x = x; this.y = y;
    this.who = who; // 'cole' or 'lena'
    this.angle = -Math.PI / 2;
    this.health = PLAYER.health;
    this.speed = 0;
    this.inCar = null;
    this.hasGun = false;
    this.ammo = 0;
    this.cash = 50;
    this.firing = false;
    this.fireCooldown = 0;
    this.color = who === 'cole' ? '#3a7bd5' : '#d53a7b';
    this.shirt = who === 'cole' ? '#e8e4d8' : '#ff9e2e';
  }

  update(dt, input, city, game) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.inCar) { this.updateDriving(dt, input, city, game); return; }
    const axis = input.moveAxis();
    const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const moving = Math.hypot(axis.x, axis.y) > 0.05;
    if (moving) {
      const nx = this.x + axis.x * speed;
      const ny = this.y + axis.y * speed;
      if (!collideBuildings(city, nx, this.y, PLAYER.radius)) this.x = nx;
      if (!collideBuildings(city, this.x, ny, PLAYER.radius)) this.y = ny;
      this.angle = Math.atan2(axis.y, axis.x);
      this.speed = speed;
    } else this.speed = 0;
    // Aim: mouse on desktop, movement direction on touch.
    if (!input.isTouch) {
      this.angle = Math.atan2(input.mouse.worldY - this.y, input.mouse.worldX - this.x);
    }
  }

  updateDriving(dt, input, city, game) {
    const car = this.inCar;
    const axis = input.moveAxis();
    const type = CAR_TYPES[car.type];
    const forward = axis.y < 0 ? 1 : axis.y > 0 ? -0.55 : 0;
    const steer = axis.x;
    if (forward !== 0) {
      car.speed += forward * type.accel * dt * 60 * 0.28;
      car.speed = clamp(car.speed, -type.max * 0.45, type.max);
    } else {
      car.speed *= Math.pow(0.985, dt * 60);
      if (Math.abs(car.speed) < 0.05) car.speed = 0;
    }
    // Steering scales with speed, weaker in reverse.
    const steerAmount = steer * 0.045 * clamp(Math.abs(car.speed) / 4, 0, 1) * (car.speed < 0 ? -1 : 1);
    car.angle += steerAmount * dt * 60 * 0.28;
    car.angle *= 1;
    const nx = car.x + Math.cos(car.angle) * car.speed;
    const ny = car.y + Math.sin(car.angle) * car.speed;
    if (!collideBuildings(city, nx, ny, 20)) {
      car.x = nx; car.y = ny;
    } else {
      // Bump: scrape along, lose speed, spark + sound.
      if (Math.abs(car.speed) > 3) { game.onCrash(car.x, car.y); game.addSkid(car.x, car.y, car.angle); }
      car.speed *= 0.4;
      // Slide along the wall on one axis.
      if (!collideBuildings(city, nx, car.y, 20)) car.x = nx;
      else if (!collideBuildings(city, car.x, ny, 20)) car.y = ny;
    }
    // Skid marks when turning hard at speed.
    if (Math.abs(steer) > 0.6 && Math.abs(car.speed) > 6 && Math.random() < 0.4) {
      game.addSkid(car.x, car.y, car.angle);
    }
    this.x = car.x; this.y = car.y;
    this.angle = car.angle;
    game.audio.engine(clamp(Math.abs(car.speed) / type.max, 0.05, 1));
  }

  exitCar(game) {
    const car = this.inCar;
    if (!car) return;
    car.occupied = false;
    car.speed = 0;
    const side = car.angle + Math.PI / 2;
    this.x = car.x + Math.cos(side) * 34;
    this.y = car.y + Math.sin(side) * 34;
    this.inCar = null;
    game.audio.engine(null);
  }
}

export class Car {
  constructor(x, y, angle, type, opts = {}) {
    this.id = nextId++;
    this.x = x; this.y = y;
    this.angle = angle;
    this.type = type;
    this.speed = 0;
    this.occupied = !!opts.occupied;
    this.isPolice = type === 'police';
    this.color = opts.color || CAR_TYPES[type].color;
    this.health = 100;
    this.dead = false;
    this.ai = opts.ai || null; // 'traffic' | 'chase' | null
    this.target = null;
    this.stuckTimer = 0;
    this.lightPhase = Math.random() * Math.PI * 2;
    this.smoke = 0;
  }

  update(dt, city, game) {
    if (this.dead) return;
    if (this.ai === 'traffic') this.updateTraffic(dt, city, game);
    else if (this.ai === 'chase') this.updateChase(dt, city, game);
    else if (!this.occupied) {
      // Parked car: nothing.
    }
  }

  updateTraffic(dt, city, game) {
    const type = CAR_TYPES[this.type];
    // Cruise along the road; pick a new direction at intersections.
    const aheadX = this.x + Math.cos(this.angle) * 70;
    const aheadY = this.y + Math.sin(this.angle) * 70;
    const nearPlayer = game.player.inCar && dist2(this.x, this.y, game.player.x, game.player.y) < 90 * 90;
    const targetSpeed = nearPlayer ? 0 : type.max * 0.42;
    this.speed += (targetSpeed - this.speed) * 0.03 * dt * 60;
    // Keep on the road: if the road ahead ends, turn.
    const roadAhead = city.isRoad(aheadX, aheadY);
    if (!roadAhead || this.stuckTimer > 0) {
      this.stuckTimer += dt;
      this.angle += 0.02 * dt * 60;
      if (this.stuckTimer > 1.2) this.stuckTimer = 0;
    }
    const nx = this.x + Math.cos(this.angle) * this.speed;
    const ny = this.y + Math.sin(this.angle) * this.speed;
    if (!collideBuildings(city, nx, ny, 20)) { this.x = nx; this.y = ny; }
    else { this.angle += 0.05 * dt * 60; this.speed *= 0.8; }
    // Despawning far away keeps the city alive around the player.
    if (dist2(this.x, this.y, game.player.x, game.player.y) > 1600 * 1600) {
      const p = nearestRoadPoint(game.player.x + (Math.random() - 0.5) * 1400, game.player.y + (Math.random() - 0.5) * 1400);
      if (p) { this.x = p.x; this.y = p.y; this.angle = p.vertical ? Math.PI / 2 : 0; }
    }
  }

  updateChase(dt, city, game) {
    const type = CAR_TYPES[this.type];
    const px = game.player.x, py = game.player.y;
    const dx = px - this.x, dy = py - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const want = Math.atan2(dy, dx);
    let diff = want - this.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.angle += clamp(diff, -0.05, 0.05) * dt * 60 * 0.5;
    const targetSpeed = d > 300 ? type.max : type.max * 0.85;
    this.speed += (targetSpeed - this.speed) * 0.02 * dt * 60;
    const nx = this.x + Math.cos(this.angle) * this.speed;
    const ny = this.y + Math.sin(this.angle) * this.speed;
    if (!collideBuildings(city, nx, ny, 20)) { this.x = nx; this.y = ny; }
    else {
      this.angle += 0.06 * dt * 60;
      this.speed *= 0.7;
      if (Math.abs(this.speed) > 3) game.onCrash(this.x, this.y);
    }
    // Ram the player: bust pressure when touching.
    if (d < 52) {
      game.bustPressure += dt;
      this.speed *= 0.9;
      if (game.player.inCar) {
        game.player.inCar.health -= 6 * dt;
        if (Math.random() < 0.3) game.audio.crash();
      } else {
        game.player.health -= 4 * dt;
      }
    }
  }
}

export class Pedestrian {
  constructor(x, y) {
    this.id = nextId++;
    this.x = x; this.y = y;
    this.angle = Math.random() * Math.PI * 2;
    this.speed = 0.8 + Math.random() * 0.7;
    this.fleeing = 0;
    this.color = ['#e8b73a', '#7ab8e8', '#e87ab8', '#9a7ae8', '#7ae8a0'][Math.floor(Math.random() * 5)];
    this.dead = false;
    this.walkPhase = Math.random() * 10;
  }

  update(dt, city, game) {
    if (this.dead) return;
    this.walkPhase += dt * 6;
    const p = game.player;
    const d = Math.hypot(this.x - p.x, this.y - p.y);
    if (this.fleeing > 0) {
      this.fleeing -= dt;
      this.angle = Math.atan2(this.y - p.y, this.x - p.x);
      this.speed = 3.4;
    } else if (d < 130 && (p.inCar ? Math.abs(p.inCar.speed) > 5 : game.gunfireNear)) {
      this.fleeing = 3;
    } else {
      this.speed = 0.8 + Math.sin(this.walkPhase * 0.2) * 0.2;
      if (Math.random() < 0.002) this.angle += (Math.random() - 0.5) * 2;
    }
    const nx = this.x + Math.cos(this.angle) * this.speed;
    const ny = this.y + Math.sin(this.angle) * this.speed;
    if (!collideBuildings(city, nx, ny, 10)) { this.x = nx; this.y = ny; }
    else this.angle += Math.PI / 2;
    // Keep near the player.
    if (d > 1300) {
      this.x = p.x + (Math.random() - 0.5) * 1100;
      this.y = p.y + (Math.random() - 0.5) * 1100;
    }
  }
}

export class Bullet {
  constructor(x, y, angle, fromPlayer, damage) {
    this.x = x; this.y = y;
    this.angle = angle;
    this.speed = 26;
    this.fromPlayer = fromPlayer;
    this.damage = damage || 34;
    this.life = 0.9;
    this.dead = false;
  }
  update(dt, city, game) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.x += Math.cos(this.angle) * this.speed;
    this.y += Math.sin(this.angle) * this.speed;
    if (collideBuildings(city, this.x, this.y, 2)) { this.dead = true; game.addSpark(this.x, this.y); }
  }
}

export class Helicopter {
  constructor() {
    this.x = 0; this.y = 0;
    this.angle = 0;
    this.radius = 260;
    this.active = false;
  }
  update(dt, game) {
    if (!this.active) return;
    this.angle += dt * 0.35;
    this.x = game.player.x + Math.cos(this.angle) * this.radius;
    this.y = game.player.y + Math.sin(this.angle) * this.radius;
  }
}
