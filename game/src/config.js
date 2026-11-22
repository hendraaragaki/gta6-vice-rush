// Solmar Bay — tuning, palettes and world constants.
// All original: a sun-soaked coastal city in the fictional state of Costa Alta.
export const TILE = 48;
export const WORLD_W = 3840;
export const WORLD_H = 3840;

export const COLORS = {
  ocean: '#1e7fa8',
  oceanDeep: '#155e80',
  sand: '#e8d29a',
  boardwalk: '#b98d5f',
  grass: '#5da24a',
  grassDry: '#8a9a4b',
  road: '#33363e',
  roadLine: '#d8c84a',
  sidewalk: '#9aa0a8',
  buildingRoof: '#6b5b4f',
  buildingRoof2: '#4f5b6b',
  buildingRoof3: '#7a4f5b',
  houseRoof: '#b5542e',
  houseRoof2: '#2e6b8a',
  warehouse: '#7d838d',
  park: '#3f7a34',
  plaza: '#c9c2b2',
  water: '#1e7fa8',
};

export const DISTRICTS = [
  { name: 'Neon Shore', x: 480, y: 0, w: 420, h: 3840, palette: 'beach' },
  { name: 'Downtown', x: 1500, y: 500, w: 1100, h: 1300, palette: 'downtown' },
  { name: 'Dockside', x: 2900, y: 400, w: 940, h: 1500, palette: 'port' },
  { name: 'Palm Court', x: 900, y: 2200, w: 1600, h: 1640, palette: 'suburb' },
  { name: 'Mud Flats', x: 2600, y: 2300, w: 1240, h: 1540, palette: 'rural' },
];

// Vertical and horizontal road centre lines (px). Roads are 96 px wide.
export const ROADS_V = [800, 1280, 1760, 2240, 2720, 3200];
export const ROADS_H = [640, 1120, 1600, 2080, 2560, 3040];
export const ROAD_W = 96;
export const BEACH_X = 480; // west of this is ocean, 480..640 is sand

export const CAR_TYPES = {
  sedan:   { name: 'Solmar Sedan',  top: 118, accel: 0.22, max: 8.6, grip: 0.86, color: '#c94f42', w: 34, l: 62 },
  sport:   { name: 'Veloce GT',    top: 138, accel: 0.30, max: 11.4, grip: 0.80, color: '#e8b73a', w: 32, l: 60 },
  muscle:  { name: 'Bravado 68',   top: 128, accel: 0.26, max: 10.2, grip: 0.72, color: '#7a2e8a', w: 34, l: 64 },
  pickup:  { name: 'Rancho Pickup',top: 112, accel: 0.20, max: 8.2, grip: 0.88, color: '#3a7a4f', w: 36, l: 66 },
  taxi:    { name: 'Solmar Taxi',  top: 112, accel: 0.20, max: 8.4, grip: 0.86, color: '#f2c230', w: 34, l: 62 },
  police:  { name: 'SAPD Interceptor', top: 132, accel: 0.32, max: 10.6, grip: 0.88, color: '#20242e', w: 34, l: 62 },
  van:     { name: 'Cargo Van',    top: 100, accel: 0.16, max: 7.4, grip: 0.90, color: '#8a8f98', w: 38, l: 70 },
};

export const PLAYER = {
  walkSpeed: 3.4,
  runSpeed: 5.2,
  radius: 14,
  health: 100,
};

export const WANTED = {
  decayDelay: 16,      // seconds with no crime and no cop near before cooling starts
  decayStep: 7,        // seconds per star lost while cooling
  bustTime: 2.6,       // seconds pinned by a cop to get busted
  maxCops: [0, 1, 2, 3, 4, 5],
};

export const SAVE_KEY = 'solmar-bay-save-v1';

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
export function rand(seedObj) {
  // Deterministic mulberry32 — same city every load for a given seed.
  seedObj.s = (seedObj.s + 0x6D2B79F5) | 0;
  let t = Math.imul(seedObj.s ^ (seedObj.s >>> 15), 1 | seedObj.s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
