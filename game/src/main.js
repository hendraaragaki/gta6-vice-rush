// Solmar Bay — the game itself: loop, states, HUD, wanted/heat, combat, missions,
// dual protagonists, saving and the screenshot hooks (?shot=chase|mission|night).
import { WORLD_W, WORLD_H, CAR_TYPES, PLAYER, SAVE_KEY, clamp, dist2 } from './config.js';
import { buildCity, nearestRoadPoint } from './world.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { Player, Car, Pedestrian, Bullet, Helicopter } from './entities.js';
import { Police } from './police.js';
import { MissionRunner, MISSIONS } from './missions.js';
import { Renderer } from './render.js';
import { saveGameData, loadGameData, clearSaveData } from './save.js';

const $ = (id) => document.getElementById(id);

export class Game {
  constructor() {
    this.city = buildCity(1337);
    this.audio = new AudioEngine();
    this.input = new Input($('game'));
    this.renderer = new Renderer(this);
    this.police = new Police(this);
    this.missions = new MissionRunner(this);
    this.HelicopterClass = Helicopter;

    this.state = 'menu'; // menu | playing | paused | busted | storydone
    this.over = false;
    this.time = 0;
    this.timeOfDay = 0.28; // late morning
    this.camera = { x: 2000, y: 1100 };
    this.shake = 0;
    this.cash = 50;
    this.wanted = 0;
    this.bustPressure = 0;
    this.filmedTimer = 0;
    this.gunfireNear = false;
    this.gunfireTimer = 0;
    this.gunHeatTimer = 0;
    this.muzzleTimer = 0;
    this.callActive = false;
    this.callQueue = [];
    this.marker = null;
    this.sideJob = null;
    this.saveTimer = 0;

    this.cole = new Player(1100, 2900, 'cole');
    this.lena = new Player(1130, 2930, 'lena');
    this.player = this.cole;
    this.other = this.lena;

    this.cars = [];
    this.peds = [];
    this.bullets = [];
    this.enemies = [];
    this.particles = [];
    this.skids = [];
    this.cashBags = [];
    this.healthPacks = [];
    this.roadblocks = [];
    this.trafficTimer = 0;
    this.pedTimer = 0;

    this.spawnParkedCars();
    this.spawnTraffic(true);
    this.spawnPeds(true);
    this.bindUi();
    this.showMenu();
    window.__game = this;
    // Screenshot hooks: ?shot=chase|city|mission|night auto-starts the game
    // straight into that state (no menu click needed).
    if (new URLSearchParams(location.search).get('shot')) this.startGame(true);
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---------- setup / UI ----------
  bindUi() {
    $('btn-new').addEventListener('click', () => { this.audio.ensure(); this.audio.click(); this.startGame(true); });
    $('btn-continue').addEventListener('click', () => { this.audio.ensure(); this.audio.click(); this.startGame(false); });
    $('btn-how').addEventListener('click', () => { $('menu').classList.add('hidden'); $('howto').classList.remove('hidden'); });
    $('btn-how-close').addEventListener('click', () => { $('howto').classList.add('hidden'); $('menu').classList.remove('hidden'); });
    $('btn-resume').addEventListener('click', () => this.togglePause());
    $('btn-restart').addEventListener('click', () => { clearSaveData(); this.startGame(true); });
    $('btn-quit').addEventListener('click', () => { this.saveGame(); this.showMenu(); });
    $('btn-busted').addEventListener('click', () => { $('busted').classList.add('hidden'); this.state = 'playing'; });
    $('btn-freeroam').addEventListener('click', () => { $('storydone').classList.add('hidden'); this.state = 'playing'; });
    $('call').addEventListener('click', () => this.dismissCall());
    if (this.input.isTouch) $('touch').classList.remove('hidden');
  }

  showMenu() {
    this.state = 'menu';
    $('menu').classList.remove('hidden');
    $('pause').classList.add('hidden');
    $('hud').classList.add('hidden');
    $('busted').classList.add('hidden');
    $('storydone').classList.add('hidden');
    const save = loadGameData();
    $('btn-continue').style.display = save ? '' : 'none';
  }

  startGame(fresh) {
    this.audio.ensure();
    $('menu').classList.add('hidden');
    $('howto').classList.add('hidden');
    $('pause').classList.add('hidden');
    $('hud').classList.remove('hidden');
    this.state = 'playing';
    this.over = false;
    if (fresh) {
      clearSaveData();
      this.cash = 50;
      this.wanted = 0;
      this.police.clearAll();
      this.cole = new Player(1100, 2900, 'cole');
      this.lena = new Player(1130, 2930, 'lena');
      this.player = this.cole;
      this.other = this.lena;
      this.cole.hasGun = false; this.cole.ammo = 0;
      this.lena.hasGun = false; this.lena.ammo = 0;
      this.timeOfDay = 0.28;
      this.missions = new MissionRunner(this);
      this.missions.start(0);
    } else {
      const s = loadGameData();
      if (s) this.applySave(s);
      else this.missions.start(0);
    }
    this.applyShotParams();
    this.updateHud();
  }

  applySave(s) {
    this.cash = s.cash ?? 50;
    this.timeOfDay = s.timeOfDay ?? 0.28;
    this.player = s.who === 'lena' ? this.lena : this.cole;
    this.other = this.player === this.cole ? this.lena : this.cole;
    this.player.x = s.x ?? 1150; this.player.y = s.y ?? 2750;
    this.player.hasGun = !!s.hasGun; this.player.ammo = s.ammo ?? 0;
    this.other.hasGun = this.player.hasGun; this.other.ammo = this.player.ammo;
    this.other.x = this.player.x + 30; this.other.y = this.player.y + 30;
    this.player.cash = this.cash; this.other.cash = this.cash;
    if (s.missionDone) {
      this.missions.done = true;
      this.setObjective('SOLMAR BAY', 'Free roam — the city is yours', 'Side jobs pay $180. Press M for a courier run.');
    } else {
      this.missions.start(s.mission ?? 0);
    }
  }

  saveGame() {
    saveGameData({
      cash: this.cash,
      mission: this.missions.index,
      missionDone: this.missions.done,
      x: Math.round(this.player.x), y: Math.round(this.player.y),
      who: this.player.who,
      timeOfDay: this.timeOfDay,
      hasGun: this.player.hasGun,
      ammo: this.player.ammo,
    });
  }

  addCash(n) {
    this.cash = Math.max(0, this.cash + n);
    this.player.cash = this.cash;
    this.other.cash = this.cash;
  }

  // ---------- screenshot hooks: ?shot=chase|city|mission|night&seed=1 ----------
  applyShotParams() {
    const q = new URLSearchParams(location.search);
    const shot = q.get('shot');
    if (!shot) return;
    this.state = 'playing';
    this.callQueue = [];
    this.callActive = false;
    $('call').classList.add('hidden');
    $('menu').classList.add('hidden');
    $('hud').classList.remove('hidden');
    if (shot === 'chase') {
      this.timeOfDay = 0.35;
      this.player.x = 2240; this.player.y = 1600;
      this.enterCarAt(2240, 1600, 'sport');
      this.wanted = 3;
      this.police.timeSinceCrime = 0;
      this.police.cooling = false;
      this.showCooldown(false);
      this.police.spawnCop(); this.police.spawnCop();
      this.setObjective('MISSION 4: THE EASY SCORE', 'Get to the car — any car, NOW', 'Three stars and climbing. Get in a car and move.');
    } else if (shot === 'city') {
      this.timeOfDay = 0.3;
      this.player.x = 2000; this.player.y = 1150;
      this.other.x = 2030; this.other.y = 1180;
      this.setObjective('MISSION 2: WELCOME HOME', 'Pick Lena up — Costa Alta Correctional', 'Downtown Solmar, noon. The city is yours.');
    } else if (shot === 'mission') {
      this.timeOfDay = 0.52; // golden hour
      this.player.x = 1980; this.player.y = 1500;
      this.player.hasGun = true; this.player.ammo = 48;
      this.other.hasGun = true; this.other.ammo = 48;
      this.spawnCashBags(1800, 1380, 3);
      this.missions.index = 3;
      this.missions.step = 1;
      this.missions.active = true;
      this.missions.collectLeft = 3;
      this.setObjective('MISSION 4: THE EASY SCORE', 'Grab the cash — 3 bags', 'Bag by bag. The alarm is already screaming.');
    } else if (shot === 'night') {
      this.timeOfDay = 0.78; // night, neon on
      this.player.x = 800; this.player.y = 1900;
      this.enterCarAt(800, 1900, 'muscle');
      this.wanted = 2;
      this.police.timeSinceCrime = 0;
      this.police.cooling = false;
      this.showCooldown(false);
      this.police.spawnCop();
      this.setObjective('SOLMAR BAY', 'Neon Shore — cruise the boardwalk', 'Night in Solmar Bay. The signs are on, the heat is on.');
    }
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;
    this.updateHud();
  }

  enterCarAt(x, y, type) {
    const car = new Car(x, y, -Math.PI / 2, type, { occupied: true });
    car.stolen = true;
    this.cars.push(car);
    this.player.inCar = car;
    this.player.x = x; this.player.y = y;
  }

  // ---------- spawning ----------
  spawnParkedCars() {
    const types = ['sedan', 'sport', 'muscle', 'pickup', 'taxi', 'van', 'sedan', 'sport'];
    const spots = this.city.parkingSpots.slice(0, 14);
    spots.forEach((s, i) => {
      const car = new Car(s.x, s.y, s.angle, types[i % types.length], {});
      this.cars.push(car);
    });
  }

  spawnTraffic(initial) {
    const types = ['sedan', 'taxi', 'van', 'pickup', 'sedan', 'sport'];
    const want = 10;
    const traffic = this.cars.filter((c) => c.ai === 'traffic').length;
    for (let i = traffic; i < want; i++) {
      const p = nearestRoadPoint(
        this.player.x + (Math.random() - 0.5) * (initial ? 2200 : 1200),
        this.player.y + (Math.random() - 0.5) * (initial ? 2200 : 1200));
      if (!p) continue;
      const car = new Car(p.x, p.y, p.vertical ? Math.PI / 2 : 0, types[Math.floor(Math.random() * types.length)], { ai: 'traffic' });
      car.speed = 2 + Math.random() * 2;
      this.cars.push(car);
    }
  }

  spawnPeds(initial) {
    const want = 14;
    for (let i = this.peds.length; i < want; i++) {
      const p = new Pedestrian(
        this.player.x + (Math.random() - 0.5) * (initial ? 1600 : 900),
        this.player.y + (Math.random() - 0.5) * (initial ? 1600 : 900));
      this.peds.push(p);
    }
  }

  spawnAmbush(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.enemies.push({
        x: x + Math.cos(a) * 320, y: y + Math.sin(a) * 320,
        health: 60, angle: 0, fireCooldown: 1 + Math.random(), dead: false,
      });
    }
    this.toast('Rival crew! They want the bags.', 2600);
    this.audio.phone();
  }

  spawnCashBags(x, y, n) {
    // Cash lands on the street by the shop, never inside a building.
    this.cashBags = [];
    const road = nearestRoadPoint(x, y);
    const cx = road ? road.x : x;
    const cy = road ? road.y : y;
    for (let i = 0; i < n; i++) {
      this.cashBags.push({ x: cx + (Math.random() - 0.5) * 120, y: cy + (Math.random() - 0.5) * 120 });
    }
  }

  // ---------- events ----------
  onCrash(x, y) {
    this.audio.crash();
    this.shake = 0.35;
    for (let i = 0; i < 8; i++) {
      this.particles.push({ x, y, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, life: 0.5, max: 0.5, color: '#ffd23e' });
    }
  }

  addSkid(x, y, a) {
    this.skids.push({ x, y, a });
    if (this.skids.length > 220) this.skids.splice(0, this.skids.length - 220);
  }

  addSpark(x, y) {
    for (let i = 0; i < 5; i++) {
      this.particles.push({ x, y, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5, life: 0.3, max: 0.3, color: '#fff' });
    }
  }

  toast(msg, ms) {
    const el = $('toast');
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.style.opacity = '0'; }, ms || 2000);
  }

  banner(text) {
    const el = $('banner');
    el.textContent = text;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 2400);
  }

  call(name, text) {
    this.callQueue.push({ name, text });
    if (!this.callActive) this.showNextCall();
  }

  showNextCall() {
    const c = this.callQueue.shift();
    if (!c) { this.callActive = false; return; }
    this.callActive = true;
    $('call-name').textContent = '☎ ' + c.name;
    $('call-text').textContent = c.text;
    $('call').classList.remove('hidden');
  }

  dismissCall() {
    $('call').classList.add('hidden');
    this.showNextCall();
  }

  setObjective(title, text, sub) {
    $('objective-title').textContent = title;
    $('objective-text').textContent = text;
    $('objective-sub').textContent = sub || '';
  }

  showCooldown(on) { $('cooldown').classList.toggle('hidden', !on); }
  showFilmed(on) { $('filmed').classList.toggle('hidden', !on); }

  updateBustMeter() {
    const el = $('bustmeter');
    if (this.bustPressure > 0.15) {
      el.classList.remove('hidden');
      $('bustfill').style.width = `${clamp(this.bustPressure / 2.6 * 100, 0, 100)}%`;
    } else el.classList.add('hidden');
  }

  onBusted() {
    const fine = Math.min(this.cash, 150 + this.wanted * 100);
    this.addCash(-fine);
    this.wanted = 0;
    this.bustPressure = 0;
    this.police.clearAll();
    this.player.health = PLAYER.health;
    if (this.player.inCar) this.player.exitCar(this);
    this.player.x = 1100; this.player.y = 2900;
    this.other.x = 1130; this.other.y = 2930;
    this.audio.busted();
    this.audio.engine(null);
    $('busted-text').textContent = `SAPD booked you. Fine: $${fine}. Your car was impounded — the safehouse is where you wake up.`;
    $('busted').classList.remove('hidden');
    this.state = 'busted';
    this.saveGame();
  }

  onWasted() {
    this.addCash(-100);
    this.wanted = 0;
    this.bustPressure = 0;
    this.police.clearAll();
    this.player.health = PLAYER.health;
    if (this.player.inCar) this.player.exitCar(this);
    this.player.x = 1100; this.player.y = 2900;
    this.other.x = 1130; this.other.y = 2930;
    this.audio.busted();
    $('busted-text').textContent = 'You were wasted. The paramedics dropped you at the safehouse — minus $100.';
    $('busted').classList.remove('hidden');
    this.state = 'busted';
    this.saveGame();
  }

  onStoryComplete() {
    $('story-stats').textContent = `Final cash: $${this.cash}. Missions: 5/5. Solmar Bay is yours — free roam unlocked.`;
    $('storydone').classList.remove('hidden');
    this.state = 'storydone';
    this.saveGame();
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      $('pause-stats').textContent = `Cash $${this.cash} · Mission ${this.missions.index + 1}/5 · ${this.player.who === 'cole' ? 'Cole' : 'Lena'} active`;
      $('pause').classList.remove('hidden');
      this.audio.engine(null);
    } else if (this.state === 'paused') {
      this.state = 'playing';
      $('pause').classList.add('hidden');
    }
  }

  swapProtagonist() {
    if (this.player.inCar) return; // swap on foot only
    const tmp = this.player;
    this.player = this.other;
    this.other = tmp;
    this.audio.click();
    this.toast(`Now playing as ${this.player.who === 'cole' ? 'Cole Maddox' : 'Lena Cruz'}`, 1600);
    this.updateHud();
  }

  // ---------- combat / interaction ----------
  tryEnterCar() {
    const p = this.player;
    if (p.inCar) { p.exitCar(this); this.audio.door(); return; }
    let best = null, bestD = 80 * 80;
    for (const car of this.cars) {
      if (car.dead || car.isPolice && car.ai === 'chase') continue;
      const d = dist2(p.x, p.y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (!best) return;
    best.occupied = true;
    best.ai = null;
    p.inCar = best;
    p.x = best.x; p.y = best.y;
    this.audio.door();
    if (!best.stolen) {
      best.stolen = true;
      if (this.wanted === 0) this.police.addHeat(1, 'Car stolen');
      else this.police.checkCctv(p.x, p.y);
    }
  }

  shoot() {
    const p = this.player;
    if (!p.hasGun || p.ammo <= 0 || p.fireCooldown > 0) return;
    p.fireCooldown = 0.22;
    p.ammo -= 1;
    this.muzzleTimer = 0.06;
    let angle;
    if (this.input.isTouch) {
      // Auto-aim at the nearest enemy or cop.
      let best = null, bestD = 500 * 500;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = dist2(p.x, p.y, e.x, e.y);
        if (d < bestD) { bestD = d; best = e; }
      }
      if (!best) for (const c of this.police.cops) {
        const d = dist2(p.x, p.y, c.x, c.y);
        if (d < bestD) { bestD = d; best = c; }
      }
      angle = best ? Math.atan2(best.y - p.y, best.x - p.x) : p.angle;
    } else {
      angle = Math.atan2(this.input.mouse.worldY - p.y, this.input.mouse.worldX - p.x);
    }
    p.angle = angle;
    this.bullets.push(new Bullet(p.x + Math.cos(angle) * 20, p.y + Math.sin(angle) * 20, angle, true, 34));
    this.audio.gunshot();
    this.gunfireNear = true;
    this.gunfireTimer = 1;
    this.gunHeatTimer -= 1;
    if (this.gunHeatTimer <= 0) {
      this.gunHeatTimer = 3;
      if (this.police.checkCctv(p.x, p.y)) this.police.addHeat(1, 'Shots fired on camera');
      else if (this.wanted === 0 && Math.random() < 0.4) this.police.addHeat(1, 'Shots fired');
    }
    this.updateHud();
  }

  // ---------- main loop ----------
  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt));
    const dt = Math.min(0.05, (t - (this._last || t)) / 1000 || 0.016);
    this._last = t;
    // The phone call blocks the world, so its dismissal is handled here,
    // outside update() — Enter, Space or a click/tap on the call box.
    if (this.callActive && (this.input.wasPressed('enter') || this.input.wasPressed(' '))) this.dismissCall();
    if (this.state === 'playing' && !this.callActive) this.update(dt);
    else if (this.state === 'menu') {
      // Slow cinematic pan behind the menu.
      this.time += dt;
      this.camera.x = 2000 + Math.cos(this.time * 0.05) * 500;
      this.camera.y = 1100 + Math.sin(this.time * 0.04) * 300;
    }
    this.renderer.draw(dt);
    this.input.endFrame();
  }

  update(dt) {
    this.time += dt;
    this.timeOfDay = (this.timeOfDay + dt / 260) % 1;
    this.muzzleTimer = Math.max(0, this.muzzleTimer - dt);
    this.gunfireTimer -= dt;
    if (this.gunfireTimer <= 0) this.gunfireNear = false;
    if (this.filmedTimer > 0) {
      this.filmedTimer -= dt;
      if (this.filmedTimer <= 0) this.showFilmed(false);
    }
    this.shake = Math.max(0, this.shake - dt);

    // Global keys.
    if (this.input.wasPressed('p') || this.input.wasPressed('escape')) this.togglePause();
    if (this.input.wasPressed('m')) this.audio.setMuted(!this.audio.muted);
    if (this.input.wasPressed('r')) {
      const on = this.audio.toggleRadio();
      this.toast(on ? 'Radio on — Solmar FM' : 'Radio off', 1400);
    }
    if (this.input.wasPressed('q')) this.swapProtagonist();
    if (this.input.wasPressed('e')) this.tryEnterCar();
    if (this.input.wasPressed('enter')) { if (this.callActive) this.dismissCall(); }
    if (this.input.wasPressed('n') && this.missions.done && !this.sideJob) this.missions.startSideJob();

    // Mouse world position for aiming.
    this.input.mouse.worldX = this.input.mouse.x + this.camera.x - this.renderer.vw / 2;
    this.input.mouse.worldY = this.input.mouse.y + this.camera.y - this.renderer.vh / 2;

    // Player + companion.
    this.player.update(dt, this.input, this.city, this);
    const o = this.other;
    if (!this.player.inCar) {
      const d = Math.hypot(o.x - this.player.x, o.y - this.player.y);
      if (d > 200) {
        const a = Math.atan2(this.player.y - o.y, this.player.x - o.x);
        o.x += Math.cos(a) * PLAYER.walkSpeed * 0.9;
        o.y += Math.sin(a) * PLAYER.walkSpeed * 0.9;
      }
    } else {
      o.x = this.player.inCar.x; o.y = this.player.inCar.y;
    }

    // Shooting.
    if (this.input.firing && !this.player.inCar) this.shoot();
    if (this.player.inCar && this.input.firing) {
      // Drive-by: shoot from the car window.
      if (this.player.hasGun && this.player.ammo > 0 && this.player.fireCooldown <= 0) {
        this.player.fireCooldown = 0.3;
        this.player.ammo -= 1;
        const a = this.player.angle + (Math.random() - 0.5) * 0.3;
        this.bullets.push(new Bullet(this.player.x + Math.cos(a) * 30, this.player.y + Math.sin(a) * 30, a, true, 34));
        this.audio.gunshot();
        this.updateHud();
      }
    }

    // Cars, peds, bullets, enemies, particles.
    for (const car of this.cars) car.update(dt, this.city, this);
    this.resolveCarCollisions();
    this.cars = this.cars.filter((c) => !c.dead);
    for (const p of this.peds) p.update(dt, this.city, this);
    for (const b of this.bullets) b.update(dt, this.city, this);
    this.resolveBulletHits();
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.updateEnemies(dt);
    for (const pt of this.particles) {
      pt.x += pt.vx; pt.y += pt.vy; pt.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    // Traffic/pedestrian upkeep.
    this.trafficTimer -= dt;
    if (this.trafficTimer <= 0) { this.trafficTimer = 4; this.spawnTraffic(false); }
    this.pedTimer -= dt;
    if (this.pedTimer <= 0) { this.pedTimer = 5; this.spawnPeds(false); }

    // Traffic hitting the player on foot.
    if (!this.player.inCar) {
      for (const car of this.cars) {
        if (car.ai !== 'traffic' || car.speed < 2) continue;
        if (Math.hypot(car.x - this.player.x, car.y - this.player.y) < 34) {
          this.player.health -= 18 * dt * 10;
          this.shake = 0.3;
          this.player.x += Math.sign(this.player.x - car.x) * 6;
          this.player.y += Math.sign(this.player.y - car.y) * 6;
        }
      }
    }

    // Pickups.
    for (const bag of this.cashBags) {
      if (Math.hypot(bag.x - this.player.x, bag.y - this.player.y) < 40) {
        bag.taken = true;
        this.addCash(100);
        this.audio.pickup();
        if (this.missions.collectLeft > 0) this.missions.collectLeft -= 1;
        this.toast('+$100', 1200);
      }
    }
    this.cashBags = this.cashBags.filter((b) => !b.taken);
    for (const h of this.healthPacks) {
      if (Math.hypot(h.x - this.player.x, h.y - this.player.y) < 36) {
        h.taken = true;
        this.player.health = Math.min(100, this.player.health + 40);
        this.audio.heal();
        this.toast('+40 health', 1400);
      }
    }
    this.healthPacks = this.healthPacks.filter((h) => !h.taken);

    // Side job.
    if (this.sideJob) {
      const d = Math.hypot(this.sideJob.x - this.player.x, this.sideJob.y - this.player.y);
      if (d < 80) {
        this.addCash(180);
        this.audio.cash();
        this.toast('Side job done — +$180', 2000);
        this.sideJob = null;
        this.marker = this.missions.active ? this.missionMarker() : null;
        this.setObjective('SOLMAR BAY', 'Free roam — the city is yours', 'Press N for another courier run.');
      }
    }

    // Mission marker.
    this.marker = this.missionMarker();

    // Wanted / police.
    this.police.update(dt);
    this.missions.update(dt);

    // Health regen + death.
    if (this.player.health < 100) this.player.health = Math.min(100, this.player.health + 1.2 * dt);
    if (this.player.health <= 0) this.onWasted();

    // Camera follows the player, with shake.
    const tx = clamp(this.player.x, this.renderer.vw / 2 - 100, WORLD_W - this.renderer.vw / 2 + 100);
    const ty = clamp(this.player.y, this.renderer.vh / 2 - 100, WORLD_H - this.renderer.vh / 2 + 100);
    this.camera.x += (tx - this.camera.x) * Math.min(1, dt * 6);
    this.camera.y += (ty - this.camera.y) * Math.min(1, dt * 6);
    if (this.shake > 0) {
      this.camera.x += (Math.random() - 0.5) * this.shake * 22;
      this.camera.y += (Math.random() - 0.5) * this.shake * 22;
    }

    // Autosave.
    this.saveTimer += dt;
    if (this.saveTimer > 30) { this.saveTimer = 0; this.saveGame(); }

    this.updateHud();
  }

  missionMarker() {
    if (this.sideJob) return { x: this.sideJob.x, y: this.sideJob.y };
    if (!this.missions.active) return null;
    const s = this.missions.currentStep();
    if (!s) return null;
    if (s.kind === 'goto' || s.kind === 'collect') return { x: s.at[0], y: s.at[1] };
    return null;
  }

  resolveCarCollisions() {
    // The player's car bumps into parked, traffic and police cars instead of
    // passing through them.
    const pc = this.player.inCar;
    if (!pc) return;
    for (const car of this.cars) {
      if (car === pc || car.dead) continue;
      const dx = pc.x - car.x, dy = pc.y - car.y;
      const d = Math.hypot(dx, dy);
      if (d < 46 && d > 0.01) {
        const push = (46 - d) / 2;
        pc.x += (dx / d) * push; pc.y += (dy / d) * push;
        car.x -= (dx / d) * push; car.y -= (dy / d) * push;
        if (Math.abs(pc.speed) > 4) this.onCrash(pc.x, pc.y);
        pc.speed *= 0.6; car.speed *= 0.6;
      }
    }
  }

  resolveBulletHits() {
    for (const b of this.bullets) {
      if (b.dead) continue;
      if (b.fromPlayer) {
        // Enemies.
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.x - b.x, e.y - b.y) < 16) {
            e.health -= b.damage;
            b.dead = true;
            this.addSpark(b.x, b.y);
            if (e.health <= 0) {
              e.dead = true;
              this.missions.enemiesLeft = Math.max(0, this.missions.enemiesLeft - 1);
              this.addCash(25);
              this.audio.pickup();
              if (Math.random() < 0.4) this.healthPacks.push({ x: e.x, y: e.y });
            }
            break;
          }
        }
        if (b.dead) continue;
        // Police cars.
        for (const c of this.police.cops) {
          if (c.dead) continue;
          if (Math.hypot(c.x - b.x, c.y - b.y) < 26) {
            c.health -= b.damage;
            b.dead = true;
            this.addSpark(b.x, b.y);
            if (c.health <= 0) {
              c.dead = true;
              this.police.cops = this.police.cops.filter((x) => x !== c);
              this.police.addHeat(1, 'Officer down');
              this.onCrash(c.x, c.y);
            }
            break;
          }
        }
        if (b.dead) continue;
        // Pedestrians (crime — raises heat).
        for (const p of this.peds) {
          if (p.dead) continue;
          if (Math.hypot(p.x - b.x, p.y - b.y) < 14) {
            p.dead = true;
            b.dead = true;
            this.police.addHeat(1, 'Pedestrian down');
            break;
          }
        }
      } else {
        // Enemy bullet vs player.
        if (Math.hypot(this.player.x - b.x, this.player.y - b.y) < 16) {
          this.player.health -= 8;
          b.dead = true;
          this.shake = 0.25;
          this.addSpark(b.x, b.y);
        }
      }
    }
  }

  updateEnemies(dt) {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      e.angle = Math.atan2(p.y - e.y, p.x - e.x);
      if (d > 260) {
        e.x += Math.cos(e.angle) * 2.6;
        e.y += Math.sin(e.angle) * 2.6;
      }
      e.fireCooldown -= dt;
      if (e.fireCooldown <= 0 && d < 480) {
        e.fireCooldown = 1.1 + Math.random() * 0.8;
        const a = e.angle + (Math.random() - 0.5) * 0.25;
        this.bullets.push(new Bullet(e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 20, a, false, 8));
        this.audio.enemyShot();
      }
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  // ---------- HUD ----------
  updateHud() {
    $('cash').textContent = '$' + this.cash;
    const stars = $('stars');
    let html = '';
    for (let i = 0; i < 5; i++) html += `<span class="${i < this.wanted ? '' : 'dim'}">★</span>`;
    stars.innerHTML = html;
    $('healthfill').style.width = `${clamp(this.player.health, 0, 100)}%`;
    const w = this.player.hasGun ? 'Pistol' : 'Fists';
    $('weapon-name').textContent = w;
    $('ammo').textContent = this.player.hasGun ? `Ammo ${this.player.ammo}` : '';
    const drive = $('hud-drive');
    if (this.player.inCar) {
      drive.classList.remove('hidden');
      $('speed').textContent = Math.round(Math.abs(this.player.inCar.speed) * 9);
      $('carname').textContent = CAR_TYPES[this.player.inCar.type].name;
    } else drive.classList.add('hidden');
  }
}

// Boot.
window.addEventListener('DOMContentLoaded', () => { new Game(); });
