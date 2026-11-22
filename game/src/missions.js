// Solmar Bay — the story. Five missions, mirroring the arc: ordinary jobs, a prison
// pickup, tooling up, a score gone wrong, and the long getaway home.
// Each mission is a list of steps; a step completes when the player reaches its marker,
// talks to its person, collects its items or survives its ambush.
import { clamp } from './config.js';

export const MISSIONS = [
  {
    id: 1,
    title: 'RENT DAY',
    intro: 'Felix: "Cole. You\'re out, good. Rent\'s due on Palm Court — three tenants, three envelopes. Don\'t make it weird."',
    caller: 'Felix Ortega',
    steps: [
      { kind: 'goto', label: 'Collect rent — Tenant 1 (Palm Court)', at: [1080, 2400], radius: 70, text: 'Knock on the door, take the envelope. $120.' },
      { kind: 'goto', label: 'Collect rent — Tenant 2 (Palm Court)', at: [1450, 2920], radius: 70, text: 'Second envelope. $120. The tenants pay on time when you ask nicely.' },
      { kind: 'goto', label: 'Collect rent — Tenant 3 (Palm Court)', at: [1180, 3050], radius: 70, text: 'Last envelope. $120. That\'s the whole street.' },
      { kind: 'goto', label: 'Bring the rent to Felix (Ortega Boat Yard)', at: [2760, 1750], radius: 80, text: 'Felix counts it twice. "Good. You\'re reliable. That matters more than fast."' },
    ],
    reward: 350,
    complete: 'Felix: "Rent\'s in. Tomorrow your girl gets out — go get her."',
  },
  {
    id: 2,
    title: 'WELCOME HOME',
    intro: 'Lena: "I\'m at the gate in twenty minutes. Don\'t keep me waiting, Cole. Three years is enough."',
    caller: 'Lena Cruz',
    steps: [
      { kind: 'goto', label: 'Pick Lena up — Costa Alta Correctional', at: [2700, 320], radius: 90, text: 'The gate opens. Lena walks out in the sun, free. "You and me, Cole. We got this."' },
      { kind: 'goto', label: 'Drive home — the Safehouse (Palm Court)', at: [1100, 2900], radius: 90, text: 'Home. A flat above a garage, a view of the bay, and a plan forming over cold coffee.' },
    ],
    reward: 200,
    complete: 'Lena: "One score. One clean score and we\'re out of this life. But first — we need a gun and a car."',
  },
  {
    id: 3,
    title: 'TOOL UP',
    intro: 'Lena: "Steel & Smoke Pawn, Dockside. The owner owes Felix. Buy the pistol — then grab us a real car."',
    caller: 'Lena Cruz',
    steps: [
      { kind: 'goto', label: 'Buy a pistol — Steel & Smoke Pawn', at: [3150, 900], radius: 80, text: 'Pistol bought — $150. The owner winks: "First one\'s on the house. The bullets aren\'t."' },
      { kind: 'steal', label: 'Steal a car — any parked car will do', text: 'Walk up to a parked car and press E. The alarm is someone else\'s problem now.' },
      { kind: 'loseheat', label: 'Lose the heat — break line of sight', text: 'One star. Duck into an alley, wait for the cooldown, and the heat fades.' },
    ],
    reward: 250,
    complete: 'Cole: "Gun, car, plan. We\'re ready. Casa Blanca Jewels, downtown — in and out."',
  },
  {
    id: 4,
    title: 'THE EASY SCORE',
    intro: 'Lena: "Casa Blanca Jewels. In, grab three bags, out. Felix says the crew watching it is small. Felix lies sometimes."',
    caller: 'Lena Cruz',
    steps: [
      { kind: 'goto', label: 'Reach Casa Blanca Jewels (Downtown)', at: [1800, 1380], radius: 80, text: 'Glass, gold and a bored guard. Smash and grab — three bags, sixty seconds.' },
      { kind: 'collect', label: 'Grab the cash — 3 bags', at: [1800, 1380], radius: 110, count: 3, timer: 75, text: 'Bag by bag. The alarm is already screaming.' },
      { kind: 'survive', label: 'The crew fights back — survive the ambush', count: 3, text: 'Rival crew! They want the bags. Shoot back — or run.' },
      { kind: 'goto', label: 'Get to the car — any car, NOW', at: [1980, 1500], radius: 120, text: 'Three stars and climbing. Get in a car and move.' },
    ],
    reward: 1200,
    complete: 'Lena, laughing in the back seat: "We\'re gonna get through this. Drive, Cole. DRIVE."',
  },
  {
    id: 5,
    title: 'THE LONG WAY HOME',
    intro: 'Felix: "SAPD\'s got the whole coast road blocked. Take the marina boat, then the back streets. Bring my money home, Cole."',
    caller: 'Felix Ortega',
    steps: [
      { kind: 'goto', label: 'Reach the marina — Felix’s boat', at: [700, 500], radius: 90, text: 'The boat is waiting. Four stars, a helicopter overhead, and the whole city behind you.' },
      { kind: 'goto', label: 'Lose them on the back streets', at: [1500, 2900], radius: 100, text: 'Through the suburbs, lights off, heart loud. The helicopter can\'t follow everywhere.' },
      { kind: 'goto', label: 'Home — the Safehouse', at: [1100, 2900], radius: 90, text: 'The gate closes behind you. The cash is banked. The heat is off.' },
    ],
    reward: 2500,
    complete: 'Cole and Lena made it. The cash is banked, the heat is off — and Solmar Bay is theirs.',
  },
];

export class MissionRunner {
  constructor(game) {
    this.game = game;
    this.index = 0; // 0-based into MISSIONS
    this.step = 0;
    this.active = false;
    this.collectLeft = 0;
    this.stepTimer = 0;
    this.ambushSpawned = false;
    this.enemiesLeft = 0;
    this.done = false;
  }

  get mission() { return MISSIONS[this.index]; }

  start(index) {
    this.index = index;
    this.step = 0;
    this.active = true;
    this.ambushSpawned = false;
    this.enemiesLeft = 0;
    const m = this.mission;
    this.game.call(m.caller, m.intro);
    this.game.setObjective(`MISSION ${m.id}: ${m.title}`, this.currentStep().label, this.currentStep().text || '');
    this.game.audio.phone();
  }

  currentStep() {
    const m = this.mission;
    return m ? m.steps[Math.min(this.step, m.steps.length - 1)] : null;
  }

  update(dt) {
    if (!this.active || this.done) return;
    const g = this.game;
    const p = g.player;
    const s = this.currentStep();
    if (!s) return;
    this.stepTimer += dt;

    if (s.kind === 'goto') {
      const d = Math.hypot(p.x - s.at[0], p.y - s.at[1]);
      if (d < s.radius) this.advance();
    } else if (s.kind === 'steal') {
      if (p.inCar && p.inCar.stolen) this.advance();
    } else if (s.kind === 'loseheat') {
      if (g.wanted === 0) this.advance();
    } else if (s.kind === 'collect') {
      if (this.collectLeft <= 0) this.advance();
    } else if (s.kind === 'survive') {
      if (!this.ambushSpawned) {
        this.ambushSpawned = true;
        this.enemiesLeft = s.count;
        g.spawnAmbush(p.x, p.y, s.count);
      }
      if (this.enemiesLeft <= 0) this.advance();
    }

    // Timed steps.
    if (s.timer && this.stepTimer > s.timer) {
      g.toast('Too slow — the score slipped away. Try again.', 2600);
      this.failStep();
    }
  }

  advance() {
    const g = this.game;
    const m = this.mission;
    const s = this.currentStep();
    if (s.kind === 'goto' || s.kind === 'collect' || s.kind === 'steal') g.audio.pickup();
    this.step++;
    this.stepTimer = 0;
    this.ambushSpawned = false;
    if (this.step >= m.steps.length) { this.completeMission(); return; }
    const next = this.currentStep();
    if (next.kind === 'collect') {
      this.collectLeft = next.count;
      g.spawnCashBags(next.at[0], next.at[1], next.count);
    }
    g.setObjective(`MISSION ${m.id}: ${m.title}`, next.label, next.text || '');
  }

  failStep() {
    // Restart the current step, keep the mission.
    this.stepTimer = 0;
    this.ambushSpawned = false;
    const s = this.currentStep();
    if (s.kind === 'collect') { this.collectLeft = s.count; this.game.spawnCashBags(s.at[0], s.at[1], s.count); }
  }

  completeMission() {
    const g = this.game;
    const m = this.mission;
    this.active = false;
    g.addCash(m.reward);
    g.audio.cash();
    g.audio.missionDone();
    g.banner(`+$${m.reward}`);
    g.call(m.caller, m.complete);
    g.setObjective('SOLMAR BAY', 'Free roam — next job when you\'re ready', 'Press M for missions, or just cause trouble.');
    if (this.index + 1 < MISSIONS.length) {
      setTimeout(() => { if (!g.over) this.start(this.index + 1); }, 5200);
    } else {
      this.done = true;
      setTimeout(() => g.onStoryComplete(), 5200);
    }
    g.saveGame();
  }

  // Side job for free roam: collect packages around the city.
  startSideJob() {
    const g = this.game;
    const spots = [[900, 900], [2400, 2400], [3200, 2800], [1400, 3200], [2900, 700]];
    const spot = spots[Math.floor(Math.random() * spots.length)];
    this.active = false;
    g.setObjective('SIDE JOB — COURIER', 'Pick up the package', 'Felix pays $180 a run. Marker is on the map.');
    g.sideJob = { x: spot[0], y: spot[1], stage: 0 };
  }
}
